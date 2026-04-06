#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
新闻采集守护进程 — 每 5 分钟从多源采集一次新闻

用法:
  python3 news_daemon.py           # 前台运行
  python3 news_daemon.py --daemon  # 后台运行

启动后立即采集一次，之后每 5 分钟轮询。
"""
from __future__ import annotations

import logging
import os
import signal
import sys
import time
from datetime import datetime
from pathlib import Path
from threading import Event

# 路径
ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
PID_DIR = ROOT / ".pids"

# 日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [news_daemon] %(levelname)s  %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(BACKEND / "logs" / "news_daemon.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("news_daemon")

INTERVAL = 300  # 5 分钟

stop_event = Event()


def cleanup_old_news() -> None:
    """删除 3 天前的新闻，不长期存储"""
    try:
        from news_aggregator import DB_PATH
        import sqlite3
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(days=3)).isoformat(timespec="seconds")
        conn = sqlite3.connect(DB_PATH)
        cur = conn.execute("DELETE FROM news_items WHERE fetched_at < ?", (cutoff,))
        deleted = cur.rowcount
        conn.commit()
        conn.close()
        if deleted > 0:
            logger.info(f"清理过期新闻: 删除 {deleted} 条")
    except Exception as e:
        logger.debug(f"新闻清理失败: {e}")


def run_once() -> None:
    """执行一轮采集"""
    try:
        from news_aggregator import init_db, fetch_all, save_items, fetch_cls, fetch_sina, fetch_eastmoney

        init_db()
        cleanup_old_news()  # 每轮采集前清理过期数据

        total = 0
        sources = [
            ("财联社", fetch_cls),
            ("新浪财经", fetch_sina),
            ("东方财富", fetch_eastmoney),
        ]

        for name, fetcher in sources:
            try:
                items = fetcher()
                if items:
                    saved = save_items(items)
                    total += len(items)
                    logger.info(f"{name}: 获取 {len(items)} 条")
                else:
                    logger.info(f"{name}: 0 条")
            except Exception as e:
                logger.warning(f"{name} 采集失败: {e}")

        logger.info(f"本轮采集完成: 共 {total} 条")

    except Exception as e:
        logger.error(f"采集异常: {e}", exc_info=True)


def main() -> None:
    logger.info("新闻采集守护进程启动")
    logger.info(f"采集间隔: {INTERVAL}s")

    # PID 文件
    if "--daemon" in sys.argv:
        PID_DIR.mkdir(parents=True, exist_ok=True)
        pid_file = PID_DIR / "news_daemon.pid"
        pid_file.write_text(str(os.getpid()))
        logger.info(f"PID: {os.getpid()}")

    # 信号处理
    def handle_signal(signum, frame):
        logger.info(f"收到信号 {signum}，停止...")
        stop_event.set()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # 立即执行一次
    run_once()

    # 轮询
    while not stop_event.is_set():
        stop_event.wait(INTERVAL)
        if not stop_event.is_set():
            run_once()

    logger.info("新闻采集守护进程已停止")


if __name__ == "__main__":
    main()
