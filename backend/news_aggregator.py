#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
多源新闻聚合器 — 从多个免费来源采集 A 股相关新闻

支持来源:
  1. 东方财富快讯 (eastmoney)
  2. 新浪财经 (sina)
  3. 同花顺 (10jqka)
  4. 知识星球 (zsxq, 需手动登录获取 cookie)

用法:
  python3 news_aggregator.py                 # 采集所有来源
  python3 news_aggregator.py --source sina   # 只采集新浪
  python3 news_aggregator.py --login-zsxq    # 启动知识星球登录助手
"""
from __future__ import annotations

import json
import logging
import re
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger("news_aggregator")

DB_PATH = Path(__file__).parent / "data" / "news_feed.db"
COOKIE_DIR = Path(__file__).parent / "data" / "cookies"

# ── 数据库 ──────────────────────────────────────────
def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS news_items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            source      TEXT NOT NULL,
            title       TEXT NOT NULL,
            summary     TEXT NOT NULL DEFAULT '',
            url         TEXT NOT NULL DEFAULT '',
            category    TEXT NOT NULL DEFAULT 'general',
            published   TEXT NOT NULL,
            fetched_at  TEXT NOT NULL,
            raw_data    TEXT,
            UNIQUE(source, title, published)
        );
        CREATE INDEX IF NOT EXISTS idx_news_date ON news_items(published);
        CREATE INDEX IF NOT EXISTS idx_news_source ON news_items(source);
    """)
    conn.close()


def save_items(items: list[dict[str, Any]]) -> int:
    if not items:
        return 0
    conn = sqlite3.connect(DB_PATH)
    now = datetime.now().isoformat(timespec="seconds")
    saved = 0
    for item in items:
        try:
            conn.execute(
                """INSERT OR IGNORE INTO news_items
                   (source, title, summary, url, category, published, fetched_at, raw_data)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    item["source"],
                    item["title"],
                    item.get("summary", ""),
                    item.get("url", ""),
                    item.get("category", "general"),
                    item.get("published", now),
                    now,
                    json.dumps(item.get("raw_data"), ensure_ascii=False) if item.get("raw_data") else None,
                ),
            )
            saved += conn.total_changes
        except sqlite3.IntegrityError:
            pass
    conn.commit()
    conn.close()
    return saved


def query_news(
    source: str | None = None,
    category: str | None = None,
    date: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    sql = "SELECT * FROM news_items WHERE 1=1"
    params: list[Any] = []
    if source:
        sql += " AND source = ?"
        params.append(source)
    if category:
        sql += " AND category = ?"
        params.append(category)
    if date:
        sql += " AND published LIKE ?"
        params.append(f"{date}%")
    sql += " ORDER BY published DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── 财联社电报 ──────────────────────────────────
def fetch_cls(limit: int = 50) -> list[dict[str, Any]]:
    """财联社 7x24 电报（高质量实时快讯）"""
    items: list[dict[str, Any]] = []
    try:
        url = "https://www.cls.cn/nodeapi/updateTelegraphList"
        params = {
            "app": "CailianpressWeb",
            "os": "web",
            "sv": "8.4.6",
            "rn": str(limit),
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Referer": "https://www.cls.cn/",
        }
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        data = resp.json()
        for n in data.get("data", {}).get("roll_data", []):
            title = (n.get("title") or "").strip()
            content = (n.get("content") or "").strip()
            if not title and not content:
                continue
            display_title = title if title else content[:80]
            ts = int(n.get("ctime", 0))
            pub_time = datetime.fromtimestamp(ts).isoformat(timespec="seconds") if ts else ""
            items.append({
                "source": "cls",
                "title": display_title,
                "summary": content[:500] if content != display_title else "",
                "url": f"https://www.cls.cn/detail/{n.get('id', '')}",
                "category": _classify_news(display_title),
                "published": pub_time,
            })
        logger.info(f"财联社: 获取 {len(items)} 条")
    except Exception as e:
        logger.warning(f"财联社采集失败: {e}")
    return items


# ── 东方财富公告 ──────────────────────────────────
def fetch_eastmoney(limit: int = 30) -> list[dict[str, Any]]:
    """东方财富上市公司公告"""
    items: list[dict[str, Any]] = []
    try:
        url = "https://np-anotice-stock.eastmoney.com/api/security/ann"
        params = {
            "page_size": str(limit),
            "page_index": "1",
            "ann_type": "A",
            "client_source": "web",
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Referer": "https://www.eastmoney.com/",
        }
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        data = resp.json()
        for n in data.get("data", {}).get("list", []):
            title = (n.get("title") or "").strip()
            if not title:
                continue
            codes = n.get("codes", [])
            stock_name = codes[0].get("short_name", "") if codes else ""
            pub_time = (n.get("display_time") or "")[:19]
            items.append({
                "source": "eastmoney",
                "title": f"{stock_name}: {title}" if stock_name else title,
                "summary": "",
                "url": f"https://data.eastmoney.com/notices/detail/{codes[0].get('stock_code','')}/{n.get('art_code','')}.html" if codes else "",
                "category": "company",
                "published": pub_time,
            })
        logger.info(f"东方财富: 获取 {len(items)} 条")
    except Exception as e:
        logger.warning(f"东方财富采集失败: {e}")
    return items


# ── 新浪财经 ──────────────────────────────────
def fetch_sina(limit: int = 50) -> list[dict[str, Any]]:
    """新浪财经滚动新闻"""
    items: list[dict[str, Any]] = []
    try:
        url = "https://feed.mix.sina.com.cn/api/roll/get"
        params = {
            "pageid": "153",
            "lid": "2516",
            "k": "",
            "num": str(limit),
            "page": "1",
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Referer": "https://finance.sina.com.cn/",
        }
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        data = resp.json()
        for n in data.get("result", {}).get("data", []):
            title = n.get("title", "").strip()
            if not title:
                continue
            ts = int(n.get("ctime", 0))
            pub_time = datetime.fromtimestamp(ts).isoformat(timespec="seconds") if ts else ""
            items.append({
                "source": "sina",
                "title": title,
                "summary": n.get("intro", ""),
                "url": n.get("url", ""),
                "category": _classify_news(title),
                "published": pub_time,
            })
        logger.info(f"新浪财经: 获取 {len(items)} 条")
    except Exception as e:
        logger.warning(f"新浪财经采集失败: {e}")
    return items


# ── 韭菜公社/雪球热帖 (备用) ──────────────────────
# 同花顺 SSL 不稳定，改用其他来源作为第三源


# ── 知识星球 ──────────────────────────────────
ZSXQ_COOKIE_FILE = COOKIE_DIR / "zsxq_cookies.json"


def fetch_zsxq(group_id: str = "", limit: int = 20) -> list[dict[str, Any]]:
    """
    知识星球内容抓取（需要预先登录保存 cookie）。
    group_id: 知识星球群组ID，从 URL 获取
    """
    items: list[dict[str, Any]] = []
    if not group_id:
        logger.debug("知识星球: 未配置 group_id，跳过")
        return items

    cookies = _load_zsxq_cookies()
    if not cookies:
        logger.info("知识星球: 未找到 cookie，请先运行 --login-zsxq 登录")
        return items

    try:
        url = f"https://api.zsxq.com/v2/groups/{group_id}/topics"
        params = {
            "scope": "all",
            "count": str(limit),
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Origin": "https://wx.zsxq.com",
            "Referer": "https://wx.zsxq.com/",
        }
        resp = requests.get(url, params=params, headers=headers, cookies=cookies, timeout=15)
        if resp.status_code == 401:
            logger.warning("知识星球: cookie 已过期，请重新运行 --login-zsxq 登录")
            return items
        data = resp.json()
        for topic in data.get("resp_data", {}).get("topics", []):
            talk = topic.get("talk", {})
            text = talk.get("text", "").strip()
            if not text:
                continue
            title = text[:80] + ("..." if len(text) > 80 else "")
            owner = talk.get("owner", {}).get("name", "")
            pub_time = topic.get("create_time", "")
            items.append({
                "source": "zsxq",
                "title": title,
                "summary": text[:500],
                "url": f"https://wx.zsxq.com/group/{group_id}",
                "category": "insight",
                "published": pub_time,
                "raw_data": {"author": owner},
            })
        logger.info(f"知识星球: 获取 {len(items)} 条")
    except Exception as e:
        logger.warning(f"知识星球采集失败: {e}")
    return items


def _load_zsxq_cookies() -> dict[str, str] | None:
    if not ZSXQ_COOKIE_FILE.exists():
        return None
    try:
        data = json.loads(ZSXQ_COOKIE_FILE.read_text())
        return data
    except Exception:
        return None


def save_zsxq_cookies(cookies: dict[str, str]) -> None:
    COOKIE_DIR.mkdir(parents=True, exist_ok=True)
    ZSXQ_COOKIE_FILE.write_text(json.dumps(cookies, ensure_ascii=False, indent=2))
    logger.info(f"知识星球 cookie 已保存到 {ZSXQ_COOKIE_FILE}")


def login_zsxq_interactive() -> None:
    """交互式登录知识星球 — 打印提示，用户手动提供 cookie"""
    print("""
╔══════════════════════════════════════════════╗
║       知识星球 Cookie 配置向导               ║
╠══════════════════════════════════════════════╣
║                                              ║
║  1. 浏览器打开 https://wx.zsxq.com           ║
║  2. 扫码登录                                 ║
║  3. 按 F12 → Network → 任意请求 → Headers    ║
║  4. 复制 Cookie 字段的值粘贴到下方            ║
║                                              ║
╚══════════════════════════════════════════════╝
""")
    raw = input("请粘贴 Cookie 值 (或输入 q 退出): ").strip()
    if not raw or raw.lower() == "q":
        print("已取消")
        return

    # 解析 cookie 字符串
    cookies: dict[str, str] = {}
    for pair in raw.split(";"):
        pair = pair.strip()
        if "=" in pair:
            k, v = pair.split("=", 1)
            cookies[k.strip()] = v.strip()

    if not cookies:
        print("无效的 Cookie，请重试")
        return

    save_zsxq_cookies(cookies)
    print(f"Cookie 已保存 ({len(cookies)} 项)")

    # 测试
    group_id = input("请输入知识星球群组ID (从URL中获取，如 481855228228): ").strip()
    if group_id:
        items = fetch_zsxq(group_id, limit=3)
        if items:
            print(f"测试成功！获取到 {len(items)} 条消息")
            for i in items[:3]:
                print(f"  - {i['title'][:60]}")
        else:
            print("测试失败，请检查 Cookie 和群组ID")


# ── 新闻分类 ──────────────────────────────────
_CATEGORY_PATTERNS = {
    "policy": re.compile(r"(政策|监管|央行|国务院|发改委|证监会|财政部|降准|降息|LPR)"),
    "sector": re.compile(r"(板块|行业|概念|题材|赛道|产业链)"),
    "company": re.compile(r"(公司|个股|涨停|跌停|业绩|财报|分红|回购)"),
    "macro": re.compile(r"(GDP|CPI|PMI|美股|美联储|外盘|港股|汇率|原油|黄金)"),
    "fund": re.compile(r"(基金|北向|外资|融资|主力|游资|机构|社保)"),
    "tech": re.compile(r"(AI|人工智能|芯片|半导体|新能源|锂电|光伏|算力)"),
}


def _classify_news(title: str) -> str:
    for cat, pattern in _CATEGORY_PATTERNS.items():
        if pattern.search(title):
            return cat
    return "general"


# ── 聚合采集 ──────────────────────────────────
def fetch_all(zsxq_group_id: str = "") -> dict[str, int]:
    """采集所有来源，返回各来源获取数量"""
    init_db()
    results: dict[str, int] = {}

    sources = [
        ("cls", fetch_cls),
        ("sina", fetch_sina),
        ("eastmoney", fetch_eastmoney),
    ]

    for name, fetcher in sources:
        try:
            items = fetcher()
            saved = save_items(items)
            results[name] = len(items)
        except Exception as e:
            logger.error(f"{name} 采集异常: {e}")
            results[name] = 0

    if zsxq_group_id:
        try:
            items = fetch_zsxq(zsxq_group_id)
            saved = save_items(items)
            results["zsxq"] = len(items)
        except Exception as e:
            logger.error(f"知识星球采集异常: {e}")
            results["zsxq"] = 0

    return results


# ── 生成简报摘要 ──────────────────────────────────
def generate_brief_summary(date: str | None = None) -> dict[str, Any]:
    """根据采集到的新闻，生成结构化简报"""
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    items = query_news(date=date.replace("-", ""), limit=200)
    if not items:
        # 尝试用完整日期格式
        items = query_news(date=date, limit=200)

    by_category: dict[str, list[dict[str, Any]]] = {}
    by_source: dict[str, int] = {}
    for item in items:
        cat = item.get("category", "general")
        by_category.setdefault(cat, []).append(item)
        src = item.get("source", "unknown")
        by_source[src] = by_source.get(src, 0) + 1

    # 每个类别取重要性最高的几条
    highlights: list[dict[str, Any]] = []
    category_labels = {
        "policy": "政策动态",
        "sector": "板块热点",
        "company": "个股要闻",
        "macro": "宏观经济",
        "fund": "资金动向",
        "tech": "科技前沿",
        "insight": "星球观点",
        "general": "综合资讯",
    }

    sections: list[dict[str, Any]] = []
    for cat, label in category_labels.items():
        cat_items = by_category.get(cat, [])
        if cat_items:
            section_items = [
                {"title": i["title"], "summary": i.get("summary", ""), "source": i["source"], "url": i.get("url", "")}
                for i in cat_items[:5]
            ]
            sections.append({
                "category": cat,
                "label": label,
                "count": len(cat_items),
                "items": section_items,
            })

    return {
        "date": date,
        "totalItems": len(items),
        "sourceStats": by_source,
        "sections": sections,
    }


# ── CLI 入口 ──────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    if "--login-zsxq" in sys.argv:
        login_zsxq_interactive()
    elif "--source" in sys.argv:
        idx = sys.argv.index("--source")
        source = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else ""
        init_db()
        fetchers = {"cls": fetch_cls, "sina": fetch_sina, "eastmoney": fetch_eastmoney}
        if source in fetchers:
            items = fetchers[source]()
            saved = save_items(items)
            print(f"{source}: 获取 {len(items)} 条，保存 {saved} 条")
        else:
            print(f"未知来源: {source}，可选: {', '.join(fetchers.keys())}")
    else:
        zsxq_id = ""
        if "--zsxq" in sys.argv:
            idx = sys.argv.index("--zsxq")
            zsxq_id = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else ""
        results = fetch_all(zsxq_group_id=zsxq_id)
        print(f"采集完成: {results}")
