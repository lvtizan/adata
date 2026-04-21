"""
Obsidian 知识库 → Cloudflare D1 导入脚本

支持两种导入方式:
1. 解析 Obsidian wiki 板块 .md 文件（自动提取结构化数据）
2. 解析标准 YAML 模板（其他 AI 整理后的标准格式）

用法:
  # 导入 Obsidian 板块知识
  python scripts/import_obsidian.py --obsidian /Users/kp/Code/Obsidian/wiki/知识库/板块

  # 导入标准模板文件
  python scripts/import_obsidian.py --template /path/to/stocks.yaml

  # 导入单个板块模板
  python scripts/import_obsidian.py --template /path/to/PCB.yaml

前置条件:
  export WORKER_URL=https://a-data-api.xxx.workers.dev
  export ACCESS_TOKEN=your-token
"""

import os
import re
import sys
import json
import yaml
import requests
from pathlib import Path
from typing import Optional

WORKER_URL = os.environ.get("WORKER_URL", "http://127.0.0.1:8787")
ACCESS_TOKEN = os.environ.get("ACCESS_TOKEN", "dev-token")
HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
}


def push_rows(table: str, rows: list[dict]):
    """批量推送到 D1"""
    if not rows:
        return
    resp = requests.post(
        f"{WORKER_URL}/api/push/{table}",
        headers=HEADERS,
        json={"rows": rows},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"  ERROR pushing {table}: {resp.text}")
    else:
        print(f"  {table}: pushed {len(rows)} rows")


# ─── 标准模板导入 ───────────────────────────────────────

def import_template(path: Path):
    """
    导入标准 YAML 模板文件。
    支持:
    - 单个板块模板 (type: sector)
    - 批量个股模板 (type: stocks)
    - 混合模板 (type: bundle)
    """
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    doc_type = data.get("type", "stocks")

    if doc_type == "sector":
        import_sector_template(data)
    elif doc_type == "stocks":
        import_stocks_template(data)
    elif doc_type == "bundle":
        if "sector" in data:
            import_sector_template(data["sector"])
        if "stocks" in data:
            import_stocks_template(data)
    else:
        print(f"Unknown template type: {doc_type}")


def import_sector_template(data: dict):
    """导入板块模板"""
    sector = {
        "sector_code": data["sector_code"],
        "sector_name": data["sector_name"],
        "summary": data.get("summary", ""),
        "drivers": json.dumps(data.get("drivers", []), ensure_ascii=False),
        "trading_sequence": data.get("trading_sequence", ""),
        "risks": json.dumps(data.get("risks", []), ensure_ascii=False),
        "chain_map": json.dumps(data.get("chain_map", {}), ensure_ascii=False),
        "updated_at": data.get("updated", ""),
    }
    push_rows("sector_cards", [sector])


def import_stocks_template(data: dict):
    """导入个股模板"""
    profiles = []
    edges = []

    for stock in data.get("stocks", []):
        # stock_profiles
        profiles.append({
            "ts_code": stock["ts_code"],
            "stock_name": stock["name"],
            "one_liner": stock.get("one_liner", ""),
            "core_clients": stock.get("core_clients", ""),
            "industry_position": stock.get("industry_position", ""),
            "sector_code": stock.get("sector_code", data.get("sector_code", "")),
        })

        # industry_edges
        for up in stock.get("upstream", []):
            edges.append({
                "from_code": up.get("code", ""),
                "to_code": stock["ts_code"],
                "relation": "upstream",
                "description": up.get("desc", up.get("name", "")),
            })
        for down in stock.get("downstream", []):
            edges.append({
                "from_code": stock["ts_code"],
                "to_code": down.get("code", ""),
                "relation": "downstream",
                "description": down.get("desc", down.get("name", "")),
            })

    push_rows("stock_profiles", profiles)
    if edges:
        # industry_edges 走单独 API（有 AUTOINCREMENT id）
        for edge in edges:
            requests.post(
                f"{WORKER_URL}/api/push/industry_edges_single",
                headers=HEADERS,
                json=edge,
                timeout=10,
            )
        print(f"  industry_edges: pushed {len(edges)} edges")


# ─── Obsidian 板块 .md 解析 ─────────────────────────────

def parse_obsidian_sector(path: Path) -> dict:
    """解析 Obsidian 板块 .md 文件，提取结构化数据"""
    text = path.read_text(encoding="utf-8")

    # frontmatter
    fm_match = re.match(r"^---\n(.+?)\n---", text, re.DOTALL)
    fm = yaml.safe_load(fm_match.group(1)) if fm_match else {}

    # 标题
    title_match = re.search(r"^# (.+)$", text, re.MULTILINE)
    title = title_match.group(1) if title_match else path.stem

    # 摘要 (> blockquote)
    summary_match = re.search(r"^> (.+?)(?:\n\n|\n##)", text, re.DOTALL | re.MULTILINE)
    summary = summary_match.group(1).replace("\n> ", " ").strip() if summary_match else ""

    # 板块驱动逻辑
    drivers = extract_numbered_list(text, "板块驱动逻辑")

    # 炒作顺序
    trading_seq = extract_code_block(text, "炒作顺序")

    # 风险
    risks = extract_bullet_list(text, "风险")

    # 产业链图谱
    chain_map = extract_chain_map(text)

    # 核心个股表
    stocks = extract_stock_table(text)

    # 各股上下游关系
    stock_chains = extract_stock_chains(text)

    return {
        "frontmatter": fm,
        "title": title,
        "summary": summary,
        "drivers": drivers,
        "trading_sequence": trading_seq,
        "risks": risks,
        "chain_map": chain_map,
        "stocks": stocks,
        "stock_chains": stock_chains,
    }


def extract_numbered_list(text: str, heading: str) -> list[str]:
    """提取 ## heading 下的编号列表"""
    pattern = rf"## {heading}\s*\n((?:\d+\..+\n?)+)"
    match = re.search(pattern, text)
    if not match:
        return []
    items = re.findall(r"\d+\.\s*\*\*(.+?)\*\*[：:](.+?)(?:\n|$)", match.group(1))
    return [f"{title}: {desc.strip()}" for title, desc in items]


def extract_bullet_list(text: str, heading: str) -> list[str]:
    """提取 ## heading 下的 bullet 列表"""
    pattern = rf"## {heading}\s*\n((?:- .+\n?)+)"
    match = re.search(pattern, text)
    if not match:
        return []
    return [line.lstrip("- ").strip() for line in match.group(1).strip().split("\n") if line.strip()]


def extract_code_block(text: str, heading: str) -> str:
    """提取 ## heading 下的代码块"""
    pattern = rf"## {heading}\s*\n```[^\n]*\n(.+?)```"
    match = re.search(pattern, text, re.DOTALL)
    return match.group(1).strip() if match else ""


def extract_chain_map(text: str) -> dict:
    """提取产业链图谱表格"""
    chain = {"upstream": [], "midstream": [], "downstream": []}
    pattern = r"## 产业链图谱\s*\n.+?\n\|[-|]+\|\n(.+?)(?:\n##|\n\n##|\Z)"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return chain

    for line in match.group(1).strip().split("\n"):
        cols = [c.strip() for c in line.split("|") if c.strip()]
        if len(cols) < 3:
            continue
        level = cols[0].replace("**", "").strip()
        content = cols[1]
        companies = cols[2] if len(cols) > 2 else ""

        if "上游" in level:
            chain["upstream"].append({"content": content, "companies": companies})
        elif "中游" in level:
            chain["midstream"].append({"content": content, "companies": companies})
        elif "下游" in level:
            chain["downstream"].append({"content": content, "companies": companies})

    return chain


def extract_stock_table(text: str) -> list[dict]:
    """提取核心个股表"""
    stocks = []
    pattern = r"## 核心个股.+?\n.+?\n\|[-|]+\|\n(.+?)(?:\n##|\n\n##|\Z)"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return stocks

    for line in match.group(1).strip().split("\n"):
        cols = [c.strip().replace("**", "") for c in line.split("|") if c.strip()]
        if len(cols) >= 3:
            code = cols[0].strip()
            name = cols[1].strip()
            role = cols[2].strip() if len(cols) > 2 else ""
            clients = cols[3].strip() if len(cols) > 3 else ""
            stocks.append({
                "code": code,
                "name": name,
                "one_liner": role,
                "core_clients": clients,
            })

    return stocks


def extract_stock_chains(text: str) -> dict[str, dict]:
    """提取各股上下游关系"""
    chains: dict[str, dict] = {}
    # Match ### 股票名（代码）sections
    pattern = r"### (.+?)（(\d{6})）\s*\n((?:- .+\n?)+)"
    for match in re.finditer(pattern, text):
        name = match.group(1)
        code = match.group(2)
        block = match.group(3)

        chain_info: dict = {"name": name, "upstream": "", "downstream": "", "position": ""}
        for line in block.strip().split("\n"):
            line = line.lstrip("- ").strip()
            if line.startswith("**上游"):
                chain_info["upstream"] = line.split("**：", 1)[-1].split("**:", 1)[-1].strip()
            elif line.startswith("**下游"):
                chain_info["downstream"] = line.split("**：", 1)[-1].split("**:", 1)[-1].strip()
            elif line.startswith("**产业链地位"):
                chain_info["position"] = line.split("**：", 1)[-1].split("**:", 1)[-1].strip()

        chains[code] = chain_info

    return chains


def import_obsidian_dir(obsidian_dir: Path):
    """导入整个 Obsidian 板块目录"""
    md_files = sorted(obsidian_dir.glob("*.md"))
    print(f"Found {len(md_files)} sector files\n")

    all_profiles = []
    all_edges = []
    all_sectors = []

    for md_path in md_files:
        print(f"Parsing: {md_path.name}")
        parsed = parse_obsidian_sector(md_path)

        sector_code = md_path.stem  # 文件名作为 sector_code

        # sector_cards
        all_sectors.append({
            "sector_code": sector_code,
            "sector_name": parsed["title"],
            "summary": parsed["summary"],
            "drivers": json.dumps(parsed["drivers"], ensure_ascii=False),
            "trading_sequence": parsed["trading_sequence"],
            "risks": json.dumps(parsed["risks"], ensure_ascii=False),
            "chain_map": json.dumps(parsed["chain_map"], ensure_ascii=False),
            "updated_at": str(parsed["frontmatter"].get("updated", "")),
        })

        # stock_profiles from table
        for stock in parsed["stocks"]:
            code_6 = stock["code"]
            # 推断交易所后缀
            ts_code = to_ts_code(code_6)
            all_profiles.append({
                "ts_code": ts_code,
                "stock_name": stock["name"],
                "one_liner": stock["one_liner"],
                "core_clients": stock["core_clients"],
                "industry_position": "",
                "sector_code": sector_code,
            })

        # industry_edges + position from 各股上下游
        for code_6, chain in parsed["stock_chains"].items():
            ts_code = to_ts_code(code_6)
            # 更新 profile 的 industry_position
            for p in all_profiles:
                if p["ts_code"] == ts_code:
                    p["industry_position"] = chain.get("position", "")
                    break

        print(f"  -> {len(parsed['stocks'])} stocks, {len(parsed['stock_chains'])} chain entries")

    # Push to D1
    print(f"\nPushing to D1...")
    push_rows("sector_cards", all_sectors)
    push_rows("stock_profiles", all_profiles)
    print(f"\nDone! {len(all_sectors)} sectors, {len(all_profiles)} stock profiles imported.")


def to_ts_code(code_6: str) -> str:
    """6位代码 → ts_code (000001 → 000001.SZ)"""
    code_6 = code_6.strip()
    if code_6.startswith("6"):
        return f"{code_6}.SH"
    else:
        return f"{code_6}.SZ"


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Import Obsidian knowledge to D1")
    parser.add_argument("--obsidian", type=str, help="Obsidian 板块目录路径")
    parser.add_argument("--template", type=str, help="标准 YAML 模板文件路径")
    args = parser.parse_args()

    if not args.obsidian and not args.template:
        parser.print_help()
        sys.exit(1)

    if args.obsidian:
        obsidian_dir = Path(args.obsidian)
        if not obsidian_dir.is_dir():
            print(f"ERROR: {obsidian_dir} is not a directory")
            sys.exit(1)
        import_obsidian_dir(obsidian_dir)

    if args.template:
        template_path = Path(args.template)
        if not template_path.exists():
            print(f"ERROR: {template_path} not found")
            sys.exit(1)
        import_template(template_path)


if __name__ == "__main__":
    main()
