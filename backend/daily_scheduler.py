#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日自动更新调度器 — 结合 precompute（量化数据）+ DeerFlow（AI 研究简报）

用法:
  python3 daily_scheduler.py              # 启动定时调度（前台运行）
  python3 daily_scheduler.py --daemon     # 后台守护进程
  python3 daily_scheduler.py --run-now    # 立即执行一次（测试用）
  python3 daily_scheduler.py --brief-only # 只生成 DeerFlow 简报（跳过 precompute）

调度时刻（交易日）:
  09:00  盘前作战地图 — DeerFlow 搜索隔夜消息 + 生成盘前简报
  11:35  午间更新     — precompute 刷新数据 + DeerFlow 盘中简报
  15:10  收盘更新     — precompute 刷新数据 + DeerFlow 每日总结
"""
from __future__ import annotations

import json
import logging
import os
import signal
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from threading import Event, Thread
from typing import Optional

# ── 路径 ──────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
DB_PATH = BACKEND / "data" / "daily_briefs.db"
PID_DIR = ROOT / ".pids"

# ── 日志 ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s  %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(BACKEND / "logs" / "scheduler.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("scheduler")

# ── DeerFlow 配置 ──────────────────────────────────────
DEERFLOW_API = os.environ.get("DEERFLOW_API", "http://127.0.0.1:8080")
DEERFLOW_ENABLED = os.environ.get("DEERFLOW_ENABLED", "true").lower() == "true"

# ── 数据库初始化 ──────────────────────────────────────
def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS daily_briefs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_date  TEXT NOT NULL,
            brief_type  TEXT NOT NULL,  -- 'pre_market' | 'midday' | 'post_market'
            title       TEXT NOT NULL,
            content     TEXT NOT NULL,  -- Markdown 格式
            metadata    TEXT,           -- JSON: 额外信息
            created_at  TEXT NOT NULL,
            UNIQUE(trade_date, brief_type)
        );
        CREATE INDEX IF NOT EXISTS idx_briefs_date ON daily_briefs(trade_date);
    """)
    conn.close()
    logger.info("daily_briefs 数据库就绪")


def save_brief(trade_date: str, brief_type: str, title: str, content: str, metadata: dict | None = None):
    conn = sqlite3.connect(DB_PATH)
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        """INSERT OR REPLACE INTO daily_briefs
           (trade_date, brief_type, title, content, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (trade_date, brief_type, title, content,
         json.dumps(metadata or {}, ensure_ascii=False), now),
    )
    conn.commit()
    conn.close()
    logger.info(f"简报已保存: {trade_date} / {brief_type}")


# ── 交易日判断 ──────────────────────────────────────
def is_trade_day(dt: datetime | None = None) -> bool:
    """简单判断是否为交易日（周一到周五且非节假日）"""
    if dt is None:
        dt = datetime.now()
    # 周末不交易
    if dt.weekday() >= 5:
        return False
    # TODO: 可以加中国节假日列表，或用 Tushare trade_cal API 判断
    return True


def get_trade_date() -> str:
    """获取当前交易日期字符串 YYYYMMDD"""
    return datetime.now().strftime("%Y%m%d")


# ── precompute 执行 ──────────────────────────────────
def run_precompute(trade_date: str | None = None) -> bool:
    """运行 precompute.py 刷新量化数据"""
    logger.info(f"开始 precompute... (trade_date={trade_date or 'auto'})")
    cmd = [sys.executable, str(BACKEND / "precompute.py")]
    if trade_date:
        cmd.append(trade_date)
    try:
        result = subprocess.run(
            cmd,
            cwd=str(BACKEND),
            capture_output=True,
            text=True,
            timeout=600,  # 10 分钟超时
        )
        if result.returncode == 0:
            logger.info("precompute 完成")
            return True
        else:
            logger.error(f"precompute 失败: {result.stderr[-500:]}")
            return False
    except subprocess.TimeoutExpired:
        logger.error("precompute 超时（10分钟）")
        return False
    except Exception as e:
        logger.error(f"precompute 异常: {e}")
        return False


def run_daily_snapshot_fetch(trade_date: str | None = None) -> bool:
    """抓取并落库当日日线快照（AKShare + 新浪hq兜底）"""
    td = trade_date or get_trade_date()
    logger.info(f"开始抓取日线快照... (trade_date={td})")
    cmd = [
        sys.executable,
        str(BACKEND / "fetch_today_snapshot_akshare.py"),
        "--trade-date",
        td,
    ]
    env = os.environ.copy()
    env.update(
        {
            "http_proxy": "",
            "https_proxy": "",
            "HTTP_PROXY": "",
            "HTTPS_PROXY": "",
            "ALL_PROXY": "",
            "all_proxy": "",
            "NO_PROXY": "*",
            "no_proxy": "*",
        }
    )
    try:
        result = subprocess.run(
            cmd,
            cwd=str(BACKEND),
            capture_output=True,
            text=True,
            timeout=240,
            env=env,
        )
        if result.returncode == 0:
            logger.info(f"日线快照抓取完成: {td}")
            return True
        tail = (result.stdout or "")[-400:] + "\n" + (result.stderr or "")[-400:]
        logger.error(f"日线快照抓取失败: {tail}")
        return False
    except subprocess.TimeoutExpired:
        logger.error("日线快照抓取超时（4分钟）")
        return False
    except Exception as e:
        logger.error(f"日线快照抓取异常: {e}")
        return False


# ── DeerFlow 调用 ──────────────────────────────────
def call_deerflow(prompt: str, timeout: int = 120) -> str | None:
    """
    调用 DeerFlow API 生成研究简报。

    DeerFlow 2.0 提供 REST API，可以通过 /api/agents/run 发送请求。
    如果 DeerFlow 不可用，回退到本地简报生成。
    """
    if not DEERFLOW_ENABLED:
        logger.info("DeerFlow 已禁用，跳过 AI 简报")
        return None

    try:
        import httpx
    except ImportError:
        logger.warning("httpx 未安装，跳过 DeerFlow 调用。请运行: pip install httpx")
        return None

    try:
        import httpx as hx
        with hx.Client(base_url=DEERFLOW_API, timeout=timeout) as client:
            # DeerFlow 2.0 的 agent API
            resp = client.post("/api/agents/run", json={
                "input": prompt,
                "stream": False,
            })
            if resp.status_code == 200:
                data = resp.json()
                # DeerFlow 返回格式可能是 {output: "..."} 或 {messages: [...]}
                output = data.get("output") or data.get("result", "")
                if not output and "messages" in data:
                    # 取最后一条 assistant 消息
                    msgs = data["messages"]
                    for m in reversed(msgs):
                        if m.get("role") == "assistant":
                            output = m.get("content", "")
                            break
                logger.info(f"DeerFlow 返回 {len(output)} 字符")
                return output
            else:
                logger.warning(f"DeerFlow API 返回 {resp.status_code}: {resp.text[:200]}")
                return None
    except Exception as e:
        logger.warning(f"DeerFlow 调用失败: {e}")
        return None


def call_deerflow_mcp(prompt: str) -> str | None:
    """
    备选方案：通过 MCP Server 的 HTTP 模式调用。
    如果 DeerFlow 主 API 不可用，可以直接用 MCP 获取数据，
    然后本地拼装简报。
    """
    try:
        import httpx as hx
        with hx.Client(base_url="http://127.0.0.1:8082", timeout=30) as client:
            # 直接调后端 API 获取数据
            overview = client.get("/api/market/overview").json()
            sectors = client.get("/api/sectors/rankings", params={"sortBy": "rps10"}).json()
            bull = client.get("/api/camp/bull-stocks").json()
            return _build_local_brief(overview, sectors, bull)
    except Exception as e:
        logger.warning(f"本地 API 调用失败: {e}")
        return None


def _build_local_brief(overview: dict, sectors: dict, bull: dict) -> str:
    """当 DeerFlow 不可用时，用本地数据拼装简报"""
    trade_date = overview.get("tradeDate", get_trade_date())

    lines = [f"# 每日市场简报 — {trade_date}\n"]

    # 市场概览
    lines.append("## 市场概览\n")
    risk = overview.get("risk", {})
    lines.append(f"- 风险度: {risk.get('riskLevel', 'N/A')}")
    stats = overview.get("stats", {})
    lines.append(f"- 上涨: {stats.get('up', 0)} 家 / 下跌: {stats.get('down', 0)} 家")
    lines.append(f"- 涨停: {stats.get('limitUp', 0)} / 跌停: {stats.get('limitDown', 0)}\n")

    # 板块 Top 5
    lines.append("## 板块强度 Top 5\n")
    items = sectors.get("items", [])[:5]
    lines.append("| 排名 | 板块 | RPS10 | 涨跌幅 |")
    lines.append("|------|------|-------|--------|")
    for i, s in enumerate(items, 1):
        name = s.get("sectorName", s.get("name", ""))
        rps = s.get("rps10", 0)
        pct = s.get("pctChange", s.get("pct_change", 0))
        lines.append(f"| {i} | {name} | {rps:.0f} | {pct:+.2f}% |")
    lines.append("")

    # 牛股集中营
    bull_items = bull.get("items", [])
    lines.append(f"## 牛股集中营 ({len(bull_items)} 只)\n")
    if bull_items:
        lines.append("| 代码 | 名称 | 板块 | RPS20 | 涨跌幅 |")
        lines.append("|------|------|------|-------|--------|")
        for s in bull_items[:10]:
            lines.append(
                f"| {s.get('tsCode', '')} | {s.get('name', '')} | "
                f"{s.get('sectorName', '')} | {s.get('rps20', 0):.0f} | "
                f"{s.get('pctChg', 0):+.2f}% |"
            )

    lines.append("\n---\n*本简报由系统自动生成，DeerFlow AI 分析未启用*")
    return "\n".join(lines)


# ── 三个定时任务 ──────────────────────────────────
def _fetch_news_and_build_brief(trade_date: str, brief_type: str) -> str | None:
    """采集多源新闻并生成本地简报"""
    try:
        from news_aggregator import fetch_all, generate_brief_summary
        results = fetch_all()
        logger.info(f"新闻采集完成: {results}")
        brief = generate_brief_summary(date=trade_date[:4] + "-" + trade_date[4:6] + "-" + trade_date[6:8])
        if brief and brief.get("totalItems", 0) > 0:
            # 转为 Markdown
            lines = [f"# 每日简报 — {trade_date}\n"]
            lines.append(f"共采集 {brief['totalItems']} 条新闻\n")
            for section in brief.get("sections", []):
                lines.append(f"\n## {section['label']} ({section['count']}条)\n")
                for item in section["items"]:
                    lines.append(f"- **{item['title']}** ({item['source']})")
                    if item.get("summary") and item["summary"] != item["title"]:
                        lines.append(f"  {item['summary'][:100]}")
            return "\n".join(lines)
    except Exception as e:
        logger.warning(f"本地新闻采集失败: {e}")
    return None


def job_pre_market():
    """盘前作战地图（09:00）"""
    trade_date = get_trade_date()
    logger.info(f"=== 盘前作战地图 {trade_date} ===")

    # 优先用本地多源新闻采集
    content = _fetch_news_and_build_brief(trade_date, "pre_market")

    # 回退到 DeerFlow（如果可用）
    if not content:
        prompt = f"今天是 {trade_date}，请生成盘前作战地图。"
        content = call_deerflow(prompt)

    # 最后回退到 MCP 本地数据
    if not content:
        content = call_deerflow_mcp("")

    if content:
        save_brief(trade_date, "pre_market", f"盘前作战地图 — {trade_date}", content)
    else:
        logger.error("盘前简报生成失败")


def job_midday():
    """午间更新（11:35）"""
    trade_date = get_trade_date()
    logger.info(f"=== 午间更新 {trade_date} ===")

    # Step 1: 先抓当日快照，再刷新量化数据
    run_daily_snapshot_fetch(trade_date)

    # Step 2: 刷新量化数据
    run_precompute(trade_date)

    # Step 3: 多源新闻简报
    content = _fetch_news_and_build_brief(trade_date, "midday")
    if not content:
        content = call_deerflow_mcp("")

    if content:
        save_brief(trade_date, "midday", f"午间简报 — {trade_date}", content)


def job_post_market():
    """收盘更新（15:10）"""
    trade_date = get_trade_date()
    logger.info(f"=== 收盘更新 {trade_date} ===")

    # Step 1: 收盘后先抓一版日线快照
    run_daily_snapshot_fetch(trade_date)

    # Step 2: 刷新量化数据（收盘后完整数据）
    run_precompute(trade_date)

    # Step 3: 多源新闻简报
    content = _fetch_news_and_build_brief(trade_date, "post_market")
    if not content:
        content = call_deerflow_mcp("")

    if content:
        save_brief(trade_date, "post_market", f"收盘总结 — {trade_date}", content)


# ── 调度循环 ──────────────────────────────────────
def job_precompute_predictions():
    """16:00 收盘后预计算全市场形态预测"""
    trade_date = get_trade_date()
    logger.info(f"=== 预计算形态预测 {trade_date} ===")
    run_precompute(trade_date)


def job_intraday_snapshot():
    """盘中抓取当日日线快照"""
    trade_date = get_trade_date()
    logger.info(f"=== 盘中快照抓取 {trade_date} ===")
    run_daily_snapshot_fetch(trade_date)


SCHEDULE = [
    ("09:00", job_pre_market),
    ("09:35", job_intraday_snapshot),
    ("11:35", job_midday),
    ("14:35", job_intraday_snapshot),
    ("15:10", job_post_market),
    ("16:00", job_precompute_predictions),
]

stop_event = Event()


def scheduler_loop():
    """主调度循环：每分钟检查一次是否到了执行时间"""
    logger.info("调度器启动，等待执行时刻...")
    logger.info(f"调度计划: {', '.join(t for t, _ in SCHEDULE)}")
    logger.info(f"DeerFlow: {'启用' if DEERFLOW_ENABLED else '禁用'} ({DEERFLOW_API})")

    executed_today: set[str] = set()
    last_date = ""

    while not stop_event.is_set():
        now = datetime.now()
        today = now.strftime("%Y%m%d")
        current_time = now.strftime("%H:%M")

        # 新的一天，重置执行记录
        if today != last_date:
            executed_today.clear()
            last_date = today
            logger.info(f"新的一天: {today}, 是否交易日: {is_trade_day(now)}")

        # 检查是否该执行
        if is_trade_day(now):
            for sched_time, job_func in SCHEDULE:
                job_key = f"{today}_{sched_time}"
                if current_time == sched_time and job_key not in executed_today:
                    executed_today.add(job_key)
                    logger.info(f"触发任务: {job_func.__name__} @ {sched_time}")
                    # 在线程中执行，避免阻塞调度器
                    t = Thread(target=_safe_run, args=(job_func,), daemon=True)
                    t.start()

        # 每 30 秒检查一次
        stop_event.wait(30)

    logger.info("调度器已停止")


def _safe_run(func):
    """安全执行任务，捕获所有异常"""
    try:
        func()
    except Exception as e:
        logger.error(f"任务 {func.__name__} 执行失败: {e}", exc_info=True)


# ── 入口 ──────────────────────────────────────────
def main():
    init_db()

    if "--run-now" in sys.argv:
        logger.info("立即执行模式")
        trade_date = get_trade_date()

        if "--brief-only" in sys.argv:
            logger.info("仅生成 AI 简报")
            job_post_market()
        else:
            logger.info("完整更新：precompute + AI 简报")
            run_daily_snapshot_fetch(trade_date)
            run_precompute()
            job_post_market()
        return

    if "--brief-only" in sys.argv and "--run-now" not in sys.argv:
        logger.info("仅简报模式：立即生成")
        job_post_market()
        return

    # 守护进程模式
    if "--daemon" in sys.argv:
        PID_DIR.mkdir(parents=True, exist_ok=True)
        pid_file = PID_DIR / "scheduler.pid"
        pid_file.write_text(str(os.getpid()))
        logger.info(f"守护进程 PID: {os.getpid()}")

    # 信号处理
    def handle_signal(signum, frame):
        logger.info(f"收到信号 {signum}，准备停止...")
        stop_event.set()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # 启动调度循环
    scheduler_loop()


if __name__ == "__main__":
    main()
