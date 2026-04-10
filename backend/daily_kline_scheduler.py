#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
日K自动落库调度器。

目标：每天 15:00（含）之后自动执行一次落库任务，失败自动重试。

用法:
  python3 daily_kline_scheduler.py               # 前台循环
  python3 daily_kline_scheduler.py --daemon      # 守护进程模式
  python3 daily_kline_scheduler.py --run-now     # 立即执行一次
  python3 daily_kline_scheduler.py --once        # 仅检查并执行一次（若未到时间会直接退出）

任务内容:
  1) 抓取当日快照（AKShare，失败自动走新浪 hq 兜底）并写入 stock_snapshot
  2) 回填最近 N 天日线快照（含当日）到本地 SQLite
"""

import argparse
import json
import logging
import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Event

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
PID_DIR = ROOT / ".pids"
STATE_PATH = BACKEND / "data" / "kline_scheduler_state.json"
LOG_PATH = BACKEND / "logs" / "kline_scheduler.log"

stop_event = Event()


@dataclass(frozen=True)
class SchedulerConfig:
    start_time: str
    retry_minutes: int
    poll_seconds: int
    backfill_days: int


def setup_logging() -> logging.Logger:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s  %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(LOG_PATH, encoding="utf-8"),
        ],
    )
    return logging.getLogger("kline-scheduler")


logger = setup_logging()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="每天15点后自动落库日K")
    parser.add_argument("--daemon", action="store_true", help="守护进程模式")
    parser.add_argument("--run-now", action="store_true", help="立即执行一次任务")
    parser.add_argument("--once", action="store_true", help="只检查并尝试执行一次")
    parser.add_argument("--start-time", default="15:00", help="每日开始触发时间，默认 15:00")
    parser.add_argument("--retry-minutes", type=int, default=20, help="失败重试间隔分钟，默认 20")
    parser.add_argument("--poll-seconds", type=int, default=30, help="调度轮询秒数，默认 30")
    parser.add_argument("--backfill-days", type=int, default=7, help="回填最近N天，默认 7")
    return parser.parse_args()


def is_trade_day(dt: datetime) -> bool:
    return dt.weekday() < 5


def current_trade_date(dt: datetime | None = None) -> str:
    now = dt or datetime.now()
    return now.strftime("%Y%m%d")


def _read_state() -> dict:
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_state(data: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _clear_proxy_env(env: dict[str, str]) -> dict[str, str]:
    cleaned = dict(env)
    for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "all_proxy"):
        cleaned[k] = ""
    cleaned["NO_PROXY"] = "*"
    cleaned["no_proxy"] = "*"
    return cleaned


def _run_cmd(cmd: list[str], timeout: int) -> tuple[bool, str]:
    try:
        result = subprocess.run(
            cmd,
            cwd=str(BACKEND),
            capture_output=True,
            text=True,
            timeout=timeout,
            env=_clear_proxy_env(os.environ),
        )
        output = (result.stdout or "") + "\n" + (result.stderr or "")
        if result.returncode != 0:
            return False, output[-1200:]
        return True, output[-1200:]
    except subprocess.TimeoutExpired:
        return False, f"timeout after {timeout}s"
    except Exception as exc:
        return False, str(exc)


def run_kline_persist(trade_date: str, backfill_days: int) -> bool:
    logger.info("开始日K落库: trade_date=%s backfill_days=%s", trade_date, backfill_days)

    snap_cmd = [
        sys.executable,
        str(BACKEND / "fetch_today_snapshot_akshare.py"),
        "--trade-date",
        trade_date,
    ]
    ok_snap, out_snap = _run_cmd(snap_cmd, timeout=300)
    if not ok_snap:
        logger.error("当日快照抓取失败: %s", out_snap)
        return False

    logger.info("当日快照抓取完成")

    backfill_cmd = [
        sys.executable,
        str(BACKEND / "backfill_daily_data.py"),
        "--days",
        str(max(1, backfill_days)),
        "--end-date",
        trade_date,
        "--full",
        "--sleep",
        "0.05",
    ]
    ok_backfill, out_backfill = _run_cmd(backfill_cmd, timeout=1200)
    if not ok_backfill:
        logger.error("回填日K失败: %s", out_backfill)
        return False

    logger.info("回填日K完成")
    return True


def _is_after_start(now: datetime, start_time: str) -> bool:
    hh, mm = start_time.split(":", 1)
    threshold = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
    return now >= threshold


def _mark_run_result(trade_date: str, success: bool, message: str) -> None:
    state = _read_state()
    now = datetime.now().isoformat(timespec="seconds")
    state["last_attempt_at"] = now
    state["last_attempt_trade_date"] = trade_date
    state["last_message"] = message
    if success:
        state["last_success_at"] = now
        state["last_success_trade_date"] = trade_date
        state.pop("last_failure_at", None)
    else:
        state["last_failure_at"] = now
    _write_state(state)


def _should_skip_today_success(today: str) -> bool:
    state = _read_state()
    return str(state.get("last_success_trade_date", "")) == today


def _last_attempt_too_recent(now_ts: float, retry_minutes: int) -> bool:
    state = _read_state()
    last_attempt_at = state.get("last_attempt_at")
    if not last_attempt_at:
        return False
    try:
        last_ts = datetime.fromisoformat(str(last_attempt_at)).timestamp()
    except Exception:
        return False
    return (now_ts - last_ts) < retry_minutes * 60


def maybe_run_once(cfg: SchedulerConfig, force: bool = False) -> bool:
    now = datetime.now()
    today = current_trade_date(now)

    if not force:
        if not is_trade_day(now):
            logger.info("今日非交易日，跳过: %s", today)
            return False
        if not _is_after_start(now, cfg.start_time):
            logger.info("未到触发时间(%s)，当前=%s", cfg.start_time, now.strftime("%H:%M:%S"))
            return False

    if _should_skip_today_success(today):
        logger.info("今日已成功执行，跳过: %s", today)
        return False

    now_ts = time.time()
    if not force and _last_attempt_too_recent(now_ts, cfg.retry_minutes):
        logger.info("距离上次尝试不足 %s 分钟，稍后重试", cfg.retry_minutes)
        return False

    ok = run_kline_persist(today, cfg.backfill_days)
    if ok:
        _mark_run_result(today, True, "kline persist ok")
        logger.info("日K落库成功: %s", today)
        return True

    _mark_run_result(today, False, "kline persist failed")
    logger.error("日K落库失败: %s", today)
    return False


def scheduler_loop(cfg: SchedulerConfig) -> None:
    logger.info(
        "调度器启动: start_time=%s retry=%sm poll=%ss backfill_days=%s",
        cfg.start_time,
        cfg.retry_minutes,
        cfg.poll_seconds,
        cfg.backfill_days,
    )
    while not stop_event.is_set():
        try:
            maybe_run_once(cfg, force=False)
        except Exception as exc:
            logger.error("调度循环异常: %s", exc, exc_info=True)
        stop_event.wait(max(5, cfg.poll_seconds))
    logger.info("调度器已停止")


def _install_signal_handlers() -> None:
    def handle_signal(signum, _frame):
        logger.info("收到信号 %s，准备退出", signum)
        stop_event.set()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)


def _write_pid() -> None:
    PID_DIR.mkdir(parents=True, exist_ok=True)
    (PID_DIR / "kline_scheduler.pid").write_text(str(os.getpid()), encoding="utf-8")


def main() -> int:
    args = parse_args()
    cfg = SchedulerConfig(
        start_time=args.start_time,
        retry_minutes=max(1, args.retry_minutes),
        poll_seconds=max(5, args.poll_seconds),
        backfill_days=max(1, args.backfill_days),
    )

    _install_signal_handlers()

    if args.run_now:
        return 0 if maybe_run_once(cfg, force=True) else 1

    if args.daemon:
        _write_pid()
        logger.info("守护进程PID: %s", os.getpid())

    if args.once:
        maybe_run_once(cfg, force=False)
        return 0

    scheduler_loop(cfg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
