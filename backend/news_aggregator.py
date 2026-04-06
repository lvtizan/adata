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
            stock_mentions TEXT DEFAULT '[]',
            UNIQUE(source, title, published)
        );
        CREATE INDEX IF NOT EXISTS idx_news_date ON news_items(published);
        CREATE INDEX IF NOT EXISTS idx_news_source ON news_items(source);
    """)
    # 兼容旧表：加 stock_mentions 列
    try:
        conn.execute("ALTER TABLE news_items ADD COLUMN stock_mentions TEXT DEFAULT '[]'")
    except Exception:
        pass
    conn.close()


def save_items(items: list[dict[str, Any]]) -> int:
    if not items:
        return 0
    conn = sqlite3.connect(DB_PATH)
    now = datetime.now().isoformat(timespec="seconds")
    saved = 0
    for item in items:
        try:
            text = f"{item['title']} {item.get('summary', '')}"
            mentions = _extract_stock_mentions(text)
            conn.execute(
                """INSERT OR IGNORE INTO news_items
                   (source, title, summary, url, category, published, fetched_at, raw_data, stock_mentions)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    item["source"],
                    item["title"],
                    item.get("summary", ""),
                    item.get("url", ""),
                    item.get("category", "general"),
                    item.get("published", now),
                    now,
                    json.dumps(item.get("raw_data"), ensure_ascii=False) if item.get("raw_data") else None,
                    json.dumps(mentions, ensure_ascii=False),
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
    result = []
    for r in rows:
        d = dict(r)
        try:
            d["stock_mentions"] = json.loads(d.get("stock_mentions") or "[]")
        except (json.JSONDecodeError, TypeError):
            d["stock_mentions"] = []
        result.append(d)
    return result


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
ZSXQ_DB_PATH = Path(__file__).parent / "data" / "zsxq.db"
ZSXQ_IMG_DIR = Path(__file__).parent / "data" / "zsxq_images"
ZSXQ_GROUP_ID = "15522414228522"  # 默认群组

_ZSXQ_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Origin": "https://wx.zsxq.com",
    "Referer": "https://wx.zsxq.com/",
    "Accept": "application/json",
}

# 股票代码正则: 6位数字
_STOCK_CODE_RE = re.compile(r"(?<!\d)(\d{6})(?!\d)")
# 中文股票名: 常见后缀模式
_STOCK_NAME_RE = re.compile(
    r"([\u4e00-\u9fa5]{2,6}(?:股份|集团|科技|电子|医药|能源|材料|通信|光电|半导体|新材|智能|生物|环保|机械|化工|控股|电气|汽车|银行|证券|保险|地产|传媒|食品|医疗|制药|软件|芯片|光伏|锂电|储能|算力))"
)


def init_zsxq_db() -> None:
    ZSXQ_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(ZSXQ_DB_PATH)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS zsxq_topics (
            topic_id    TEXT PRIMARY KEY,
            author      TEXT NOT NULL DEFAULT '',
            content     TEXT NOT NULL,
            images      TEXT DEFAULT '[]',
            likes_count INTEGER DEFAULT 0,
            comments_count INTEGER DEFAULT 0,
            published   TEXT NOT NULL,
            fetched_at  TEXT NOT NULL,
            stock_mentions TEXT DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_zsxq_pub ON zsxq_topics(published);

        CREATE TABLE IF NOT EXISTS zsxq_stock_stats (
            stock_name  TEXT NOT NULL,
            mention_count INTEGER DEFAULT 0,
            last_mentioned TEXT,
            topic_ids   TEXT DEFAULT '[]',
            updated_at  TEXT NOT NULL,
            PRIMARY KEY (stock_name)
        );
    """)
    conn.close()


def fetch_zsxq(group_id: str = "", limit: int = 200) -> list[dict[str, Any]]:
    """完整抓取知识星球近2个月内容，支持翻页。"""
    if not group_id:
        group_id = ZSXQ_GROUP_ID
    items: list[dict[str, Any]] = []

    cookies = _load_zsxq_cookies()
    if not cookies:
        logger.info("知识星球: 未找到 cookie，请先运行 --login-zsxq 登录")
        return items

    cutoff = (datetime.now() - timedelta(days=60)).isoformat(timespec="seconds")

    try:
        end_time = ""
        fetched = 0
        page = 0
        max_pages = 10  # 最多翻10页覆盖2个月

        while fetched < limit and page < max_pages:
            url = f"https://api.zsxq.com/v2/groups/{group_id}/topics"
            params: dict[str, str] = {"scope": "all", "count": "30"}
            if end_time:
                params["end_time"] = end_time

            resp = requests.get(url, params=params, headers=_ZSXQ_HEADERS, cookies=cookies, timeout=15)

            if resp.status_code == 401:
                logger.warning("知识星球: cookie 已过期，请重新运行 --login-zsxq 登录")
                return items
            if resp.status_code != 200:
                logger.warning(f"知识星球: HTTP {resp.status_code}")
                break

            data = resp.json()
            topics = data.get("resp_data", {}).get("topics", [])
            if not topics:
                break

            hit_cutoff = False
            for topic in topics:
                pub = topic.get("create_time", "")
                if pub and pub < cutoff:
                    hit_cutoff = True
                    break
                item = _parse_zsxq_topic(topic, group_id)
                if item:
                    items.append(item)
                    fetched += 1

            if hit_cutoff:
                break

            # 翻页: 用最后一条的时间作为 end_time
            last_time = topics[-1].get("create_time", "")
            if last_time and last_time != end_time:
                end_time = last_time
            else:
                break
            page += 1
            time.sleep(0.5)  # 礼貌延迟

        logger.info(f"知识星球: 获取 {len(items)} 条")
    except Exception as e:
        logger.warning(f"知识星球采集失败: {e}")
    return items


def _clean_zsxq_text(text: str) -> str:
    """清理知识星球文本中的标签，提取可读内容。"""
    from urllib.parse import unquote
    # 解析 <e type="hashtag" title="..." /> 为 #标签#
    text = re.sub(
        r'<e\s+type="hashtag"[^>]*title="([^"]*)"[^/]*/\s*>',
        lambda m: unquote(m.group(1)),
        text,
    )
    # 解析 <e type="mention" ... title="..." /> 为 @人名
    text = re.sub(
        r'<e\s+type="mention"[^>]*title="([^"]*)"[^/]*/\s*>',
        lambda m: "@" + unquote(m.group(1)),
        text,
    )
    # 移除其他未知 <e .../> 标签
    text = re.sub(r'<e\s+[^/]*/\s*>', '', text)
    return text.strip()


def _parse_zsxq_topic(topic: dict, group_id: str) -> dict[str, Any] | None:
    """解析单条知识星球话题，提取完整内容 + 图片 + 股票提及。"""
    topic_id = str(topic.get("topic_id", ""))
    create_time = topic.get("create_time", "")

    # 内容可能在 talk / question / answer 中
    talk = topic.get("talk", {})
    question = topic.get("question", {})
    answer = topic.get("answer", {})

    # 提取文本
    text_parts = []
    author = ""

    if talk:
        text_parts.append(talk.get("text", ""))
        author = talk.get("owner", {}).get("name", "")
    if question:
        q_text = question.get("text", "")
        q_author = question.get("owner", {}).get("name", "")
        if q_text:
            text_parts.append(f"【提问】{q_text}")
        if not author:
            author = q_author
    if answer:
        a_text = answer.get("text", "")
        a_author = answer.get("owner", {}).get("name", "")
        if a_text:
            text_parts.append(f"【回答】{a_text}")
        if not author:
            author = a_author

    full_text = "\n\n".join(_clean_zsxq_text(t) for t in text_parts if t.strip())
    if not full_text:
        return None

    # 提取图片 URL
    images = []
    for img in talk.get("images", []) or []:
        img_url = img.get("large", {}).get("url", "") or img.get("original", {}).get("url", "")
        if img_url:
            images.append(img_url)

    # 互动数据
    likes = topic.get("likes_count", 0)
    comments = topic.get("comments_count", 0)

    # 提取股票提及
    stock_mentions = _extract_stock_mentions(full_text)

    # 生成标题（第一行或前60字）
    first_line = full_text.split("\n")[0].strip()
    title = first_line[:60] + ("..." if len(first_line) > 60 else "")

    return {
        "source": "zsxq",
        "title": title,
        "summary": full_text,  # 完整内容
        "url": f"https://wx.zsxq.com/group/{group_id}",
        "category": "insight",
        "published": create_time,
        "raw_data": {
            "topic_id": topic_id,
            "author": author,
            "images": images,
            "likes": likes,
            "comments": comments,
            "stock_mentions": stock_mentions,
        },
    }


def _extract_stock_mentions(text: str) -> list[str]:
    """从文本中提取股票代码和名称。只提取高置信度的匹配。"""
    mentions = set()
    # 6位数字代码（必须是合法开头）
    for m in _STOCK_CODE_RE.finditer(text):
        code = m.group(1)
        if code.startswith(("00", "30", "60", "68")):
            mentions.add(code)
    # 中文股票名: 必须是"名称+后缀"格式，排除动词短语
    _noise = {"关注", "坚定", "详情", "欢迎", "近期", "回购", "合末", "价下", "分体", "很多", "十万"}
    for m in _STOCK_NAME_RE.finditer(text):
        name = m.group(1)
        # 排除以常见噪音词开头的
        if any(name.startswith(n) for n in _noise):
            continue
        # 至少2个字才可能是股票名
        if len(name) >= 4:
            mentions.add(name)
    return sorted(mentions)


def _download_zsxq_image(url: str, topic_id: str, idx: int) -> str | None:
    """下载知识星球图片到本地，返回本地文件名。"""
    try:
        ZSXQ_IMG_DIR.mkdir(parents=True, exist_ok=True)
        # 文件名: topic_id_idx.jpg
        ext = "jpg"
        if "format/png" in url:
            ext = "png"
        filename = f"{topic_id}_{idx}.{ext}"
        filepath = ZSXQ_IMG_DIR / filename

        if filepath.exists() and filepath.stat().st_size > 1000:
            return filename  # 已下载过

        cookies = _load_zsxq_cookies()
        resp = requests.get(url, headers=_ZSXQ_HEADERS, cookies=cookies or {}, timeout=15, stream=True)
        if resp.status_code == 200 and len(resp.content) > 500:
            filepath.write_bytes(resp.content)
            return filename
        else:
            logger.debug(f"图片下载失败: HTTP {resp.status_code}, {len(resp.content)} bytes")
            return None
    except Exception as e:
        logger.debug(f"图片下载异常: {e}")
        return None


def save_zsxq_topics(items: list[dict[str, Any]]) -> int:
    """保存知识星球内容到专用数据库，同时更新股票统计。"""
    if not items:
        return 0
    init_zsxq_db()
    conn = sqlite3.connect(ZSXQ_DB_PATH)
    now = datetime.now().isoformat(timespec="seconds")
    saved = 0
    stock_mentions_all: dict[str, list[str]] = {}  # {stock_name: [topic_ids]}

    for item in items:
        raw = item.get("raw_data", {})
        topic_id = raw.get("topic_id", "")
        if not topic_id:
            continue

        try:
            # 下载图片到本地
            local_images = []
            for idx, img_url in enumerate(raw.get("images", [])):
                local_name = _download_zsxq_image(img_url, topic_id, idx)
                if local_name:
                    local_images.append(local_name)

            conn.execute(
                """INSERT OR REPLACE INTO zsxq_topics
                   (topic_id, author, content, images, likes_count, comments_count, published, fetched_at, stock_mentions)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    topic_id,
                    raw.get("author", ""),
                    item.get("summary", ""),
                    json.dumps(local_images, ensure_ascii=False),
                    raw.get("likes", 0),
                    raw.get("comments", 0),
                    item.get("published", ""),
                    now,
                    json.dumps(raw.get("stock_mentions", []), ensure_ascii=False),
                ),
            )
            saved += 1

            # 收集股票提及
            for mention in raw.get("stock_mentions", []):
                stock_mentions_all.setdefault(mention, []).append(topic_id)
        except Exception:
            pass

    # 更新股票统计
    for stock_name, topic_ids in stock_mentions_all.items():
        try:
            existing = conn.execute(
                "SELECT topic_ids FROM zsxq_stock_stats WHERE stock_name = ?", (stock_name,)
            ).fetchone()
            if existing:
                old_ids = set(json.loads(existing[0]))
                old_ids.update(topic_ids)
                all_ids = sorted(old_ids)
            else:
                all_ids = sorted(set(topic_ids))
            conn.execute(
                """INSERT OR REPLACE INTO zsxq_stock_stats
                   (stock_name, mention_count, last_mentioned, topic_ids, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (stock_name, len(all_ids), now, json.dumps(all_ids, ensure_ascii=False), now),
            )
        except Exception:
            pass

    conn.commit()
    conn.close()
    return saved


def query_zsxq_topics(limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    """查询知识星球内容，按时间倒序。"""
    if not ZSXQ_DB_PATH.exists():
        return []
    conn = sqlite3.connect(ZSXQ_DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM zsxq_topics ORDER BY published DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["images"] = json.loads(d.get("images", "[]"))
        d["stock_mentions"] = json.loads(d.get("stock_mentions", "[]"))
        result.append(d)
    return result


def query_zsxq_stock_stats(limit: int = 50) -> list[dict[str, Any]]:
    """查询股票提及统计，按次数降序。"""
    if not ZSXQ_DB_PATH.exists():
        return []
    conn = sqlite3.connect(ZSXQ_DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT stock_name, mention_count, last_mentioned FROM zsxq_stock_stats ORDER BY mention_count DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def query_zsxq_summary() -> dict[str, Any]:
    """知识星球智能汇总: 总帖数、活跃作者、热门股票、最近趋势。"""
    if not ZSXQ_DB_PATH.exists():
        return {"totalTopics": 0, "authors": [], "hotStocks": [], "recentTrend": []}
    conn = sqlite3.connect(ZSXQ_DB_PATH)
    conn.row_factory = sqlite3.Row

    # 总帖数
    total = conn.execute("SELECT COUNT(*) as cnt FROM zsxq_topics").fetchone()["cnt"]

    # 活跃作者 top 10
    authors = conn.execute(
        "SELECT author, COUNT(*) as cnt FROM zsxq_topics GROUP BY author ORDER BY cnt DESC LIMIT 10"
    ).fetchall()

    # 热门股票 top 20
    hot_stocks = conn.execute(
        "SELECT stock_name, mention_count, last_mentioned FROM zsxq_stock_stats ORDER BY mention_count DESC LIMIT 20"
    ).fetchall()

    # 最近7天每天发帖数
    trend = conn.execute("""
        SELECT DATE(published) as day, COUNT(*) as cnt
        FROM zsxq_topics
        WHERE published >= DATE('now', '-7 days')
        GROUP BY DATE(published)
        ORDER BY day DESC
    """).fetchall()

    conn.close()

    return {
        "totalTopics": total,
        "authors": [{"name": r["author"], "count": r["cnt"]} for r in authors],
        "hotStocks": [dict(r) for r in hot_stocks],
        "recentTrend": [{"date": r["day"], "count": r["cnt"]} for r in trend],
    }


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
                {
                    "title": i["title"],
                    "summary": i.get("summary", ""),
                    "source": i["source"],
                    "url": i.get("url", ""),
                    "stock_mentions": i.get("stock_mentions", []),
                }
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
