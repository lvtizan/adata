#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""性能基准测试 - 对比优化前后的性能"""
import time
from market_engine import MarketEngine

def benchmark():
    engine = MarketEngine()

    print("🚀 开始性能测试...\n")

    # 测试1: 首次加载（冷启动）
    print("📊 测试1: 冷启动性能")
    start = time.time()
    trade_date = engine.latest_trade_date()
    print(f"  获取最新交易日: {trade_date}")
    print(f"  耗时: {time.time() - start:.2f}s\n")

    # 测试2: 市场概览
    print("📊 测试2: 市场概览")
    start = time.time()
    overview = engine.market_overview(trade_date)
    print(f"  市场状态: {overview['marketState']['label']}")
    print(f"  涨停/跌停: {overview['breadth']['limitUpCount']} / {overview['breadth']['limitDownCount']}")
    print(f"  耗时: {time.time() - start:.2f}s\n")

    # 测试3: 板块排行
    print("📊 测试3: 板块排行")
    start = time.time()
    rankings = engine.sector_rankings(trade_date)
    print(f"  板块数量: {len(rankings)}")
    print(f"  耗时: {time.time() - start:.2f}s\n")

    # 测试4: 板块成分股
    if rankings:
        print("📊 测试4: 板块内强股")
        start = time.time()
        sector_code = rankings[0]["sectorCode"]
        stocks = engine.sector_stocks(sector_code, trade_date)
        print(f"  板块: {rankings[0]['sectorName']}")
        print(f"  股票数量: {len(stocks)}")
        print(f"  耗时: {time.time() - start:.2f}s\n")

    # 测试5: 预热后的性能
    print("📊 测试5: 预热后性能（重复查询）")
    start = time.time()
    overview2 = engine.market_overview(trade_date)
    rankings2 = engine.sector_rankings(trade_date)
    print(f"  重复查询耗时: {time.time() - start:.2f}s\n")

    print("✅ 性能测试完成！")
    print("\n💡 优化说明:")
    print("  - 批量加载: 减少API调用次数")
    print("  - 并发查询: 板块成分股并发查询")
    print("  - 缓存预热: 启动时预加载数据")
    print("  - Pivot优化: MA20计算避免循环merge")

if __name__ == "__main__":
    benchmark()
