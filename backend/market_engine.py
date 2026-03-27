#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import tushare as ts

from config import get_config, Config
from market_data_store import MarketDataStore

logger = logging.getLogger(__name__)


class MarketEngine:
    def __init__(self, config: Config | None = None) -> None:
        # 加载配置
        self.config = config or get_config()
        self.rules = self.config.rules

        # 初始化Tushare API
        logger.info("初始化Tushare API...")
        self.pro = ts.pro_api(self.config.tushare_token)
        self.pro._DataApi__token = self.config.tushare_token
        if self.config.tushare_http_url:
            self.pro._DataApi__http_url = self.config.tushare_http_url
            logger.info(f"使用代理: {self.config.tushare_http_url}")

        # 初始化缓存
        cache_config = self.config.cache
        self._cache: dict[str, tuple[float, Any]] = {}
        self._stock_name_map: dict[str, str] = {}
        self._sector_name_map: dict[str, str] = {}
        self._sw_l3_map: dict[str, str] = {}
        self._snapshot_batch_cache: dict[str, dict[str, pd.DataFrame]] = {}
        self._data_store = MarketDataStore(Path(__file__).parent / "data" / "market_cache.db")
        self._warmed = False

        logger.info("MarketEngine初始化完成")

    @staticmethod
    def _is_rate_limit_error(exc: Exception) -> bool:
        msg = str(exc)
        return "每分钟最多访问" in msg or "MaxRetryError" in msg

    def _safe_call(self, fn, *, default=None, context: str = ""):
        try:
            return fn()
        except Exception as exc:
            if self._is_rate_limit_error(exc):
                logger.warning(f"{context or '请求'}触发频率限制，跳过本次预加载")
                return default
            raise

    def warmup(self, trade_date: str | None = None) -> None:
        """轻量预热缓存，避免启动阶段打满 Tushare 频率限制"""
        if self._warmed:
            return
        if trade_date is None:
            trade_date = self.latest_trade_date()
        try:
            # 优先预加载低频、复用高的名称映射
            self._safe_call(self.stock_name_map, default={}, context="股票名称映射预热")
            self._safe_call(self.sector_name_map, default={}, context="板块名称映射预热")
            self._safe_call(self.sw_l3_map, default={}, context="申万三级分类预热")

            # 仅预加载极少量最近快照，避免启动时一次性批量拉 20 天数据
            warmup_days = max(0, int(self.config.cache.warmup_snapshot_days))
            if warmup_days > 0:
                dates = self.trade_dates(trade_date, need=max(warmup_days, 1) + 2)
                recent_dates = dates[-warmup_days:]
                self._safe_call(
                    lambda: self._load_snapshots_batch(recent_dates),
                    default={},
                    context=f"最近{warmup_days}天快照预热",
                )
            self._warmed = True
        except Exception as e:
            logger.warning(f"Warmup warning: {e}")

    def _load_snapshots_batch(self, dates: list[str]) -> dict[str, pd.DataFrame]:
        """优先读本地缓存；缺失时逐日拉取并落库"""
        if not dates:
            return {}

        cache_key = f"batch_snapshots:{dates[0]}:{dates[-1]}:{len(dates)}"
        if cache_key in self._snapshot_batch_cache:
            logger.debug(f"批量缓存命中: {cache_key}")
            return self._snapshot_batch_cache[cache_key]

        snapshot_map = {d: self.stock_snapshot(d) for d in dates}
        self._snapshot_batch_cache[cache_key] = snapshot_map

        max_cache = self.config.cache.max_batch_cache
        if len(self._snapshot_batch_cache) > max_cache:
            removed_key = next(iter(self._snapshot_batch_cache))
            self._snapshot_batch_cache.pop(removed_key)
            logger.debug(f"批量缓存已满，移除: {removed_key}")

        logger.info(f"批量加载完成: {len(snapshot_map)}天")
        return snapshot_map

    def stock_snapshot_batch(self, dates: list[str]) -> dict[str, pd.DataFrame]:
        """获取多个日期的快照 - 使用批量加载"""
        ordered_dates = sorted({d for d in dates if d})
        if len(ordered_dates) <= 1:
            return {d: self.stock_snapshot(d) for d in ordered_dates}

        # 检查是否已有批量缓存
        for cache_key, cached in self._snapshot_batch_cache.items():
            cached_dates = set(cached.keys())
            if set(ordered_dates).issubset(cached_dates):
                return {d: cached[d].copy() for d in ordered_dates}

        # 重新批量加载
        return self._load_snapshots_batch(ordered_dates)

    def _cached(self, key: str, ttl: int, fn):
        """带日志的缓存方法"""
        now = time.time()
        got = self._cache.get(key)
        if got and now - got[0] < ttl:
            logger.debug(f"缓存命中: {key}")
            return got[1]
        logger.debug(f"缓存未命中: {key}, 正在加载...")
        val = fn()
        self._cache[key] = (now, val)
        return val

    def _cached_snapshot_dates(self, kind: str, end_date: str | None = None) -> list[str]:
        dates = self._data_store.list_keys(kind)
        if end_date:
            dates = [d for d in dates if d <= end_date]
        return dates

    @staticmethod
    def _slice_recent_dates(dates: list[str], end_date: str, need: int) -> list[str]:
        if not dates:
            return []
        eligible = [d for d in dates if d <= end_date]
        if not eligible:
            return []
        return eligible[-need:]

    def trade_dates(self, end_date: str, need: int = 80) -> list[str]:
        def _load():
            logger.debug(f"加载交易日历: {end_date}")
            try:
                cal = self.pro.trade_cal(
                    exchange="SSE",
                    start_date=(pd.Timestamp(end_date) - pd.Timedelta(days=220)).strftime("%Y%m%d"),
                    end_date=end_date,
                    fields="cal_date,is_open",
                )
                return cal[cal["is_open"] == 1].sort_values("cal_date")["cal_date"].astype(str).tolist()
            except Exception as exc:
                cached = self._cached_snapshot_dates("stock_snapshot", end_date=end_date)
                if cached:
                    logger.warning(f"交易日历接口失败，改用本地股票快照日期: {exc}")
                    return cached
                raise

        dates = self._cached(f"trade_dates:{end_date}", 3600, _load)
        if len(dates) < need:
            return dates
        return dates[-need:]

    def latest_trade_date(self) -> str:
        today = pd.Timestamp.now().strftime("%Y%m%d")
        dates = self.trade_dates(today, need=30)
        return dates[-1]

    def latest_data_trade_date(self) -> str:
        def _load():
            today = pd.Timestamp.now().strftime("%Y%m%d")
            try:
                dates = self.trade_dates(today, need=40)
            except Exception as exc:
                stock_dates = self._cached_snapshot_dates("stock_snapshot", end_date=today)
                sector_dates = set(self._cached_snapshot_dates("sector_snapshot", end_date=today))
                offline_dates = [d for d in stock_dates if d in sector_dates]
                if offline_dates:
                    logger.warning(f"探测最新行情日期失败，改用本地快照日期: {exc}")
                    return offline_dates[-1]
                raise
            for d in reversed(dates):
                s = self.stock_snapshot(d)
                if s is None or s.empty:
                    continue
                sec = self._safe_call(
                    lambda d=d: self.sector_snapshot(d),
                    default=None,
                    context=f"探测板块行情日期 {d}",
                )
                if sec is None or sec.empty:
                    continue
                return d
            return dates[-1]

        return self._cached(
            "latest_data_trade_date",
            self.config.cache.latest_data_trade_date_ttl,
            _load,
        )

    def stock_snapshot(self, trade_date: str) -> pd.DataFrame:
        """单日快照 - 优先从批量缓存获取"""
        # 检查批量缓存
        for cached in self._snapshot_batch_cache.values():
            if trade_date in cached:
                logger.debug(f"从批量缓存获取快照: {trade_date}")
                return cached[trade_date].copy()

        cached_df = self._data_store.get_frame("stock_snapshot", trade_date)
        if cached_df is not None and not cached_df.empty:
            logger.debug(f"从本地数据库获取股票快照: {trade_date}")
            return cached_df.copy()

        def _load():
            logger.debug(f"从API加载快照: {trade_date}")
            try:
                df = self.pro.daily(trade_date=trade_date)
                if df is not None and not df.empty:
                    self._data_store.set_frame("stock_snapshot", trade_date, df)
                return df
            except Exception as exc:
                logger.warning(f"股票快照接口失败: {trade_date}, 错误: {exc}")
                return pd.DataFrame()

        return self._cached(f"stock_snapshot:{trade_date}", self.config.cache.snapshot_ttl, _load).copy()

    def sector_snapshot(self, trade_date: str) -> pd.DataFrame:
        cached_df = self._data_store.get_frame("sector_snapshot", trade_date)
        if cached_df is not None and not cached_df.empty:
            logger.debug(f"从本地数据库获取板块快照: {trade_date}")
            return cached_df.copy()

        def _load():
            logger.debug(f"从API加载板块快照: {trade_date}")
            try:
                df = self.pro.ths_daily(trade_date=trade_date)
                if df is not None and not df.empty:
                    self._data_store.set_frame("sector_snapshot", trade_date, df)
                return df
            except Exception as exc:
                logger.warning(f"板块快照接口失败: {trade_date}, 错误: {exc}")
                return pd.DataFrame()

        return self._cached(f"sector_snapshot:{trade_date}", self.config.cache.snapshot_ttl, _load).copy()

    def stock_name_map(self) -> dict[str, str]:
        def _load():
            logger.debug("加载股票名称映射")
            try:
                df = self.pro.stock_basic(exchange="", list_status="L", fields="ts_code,name")
                return dict(zip(df["ts_code"], df["name"]))
            except Exception as exc:
                logger.warning(f"股票名称映射加载失败，降级为空映射: {exc}")
                return {}

        if not self._stock_name_map:
            self._stock_name_map = self._cached("stock_name_map", self.config.cache.name_map_ttl, _load)
        return self._stock_name_map

    def sector_name_map(self) -> dict[str, str]:
        def _load():
            logger.debug("加载板块名称映射")
            try:
                df = self.pro.ths_index(fields="ts_code,name")
                return dict(zip(df["ts_code"], df["name"]))
            except Exception as exc:
                logger.warning(f"板块名称映射加载失败，降级为空映射: {exc}")
                return {}

        if not self._sector_name_map:
            self._sector_name_map = self._cached("sector_name_map", self.config.cache.name_map_ttl, _load)
        return self._sector_name_map

    def sw_l3_map(self) -> dict[str, str]:
        def _load():
            logger.debug("加载申万三级分类")
            try:
                df = self.pro.index_classify(
                    src="SW2021", level="L3", fields="index_code,industry_name,level,parent_code"
                )
                return dict(zip(df["index_code"], df["industry_name"]))
            except Exception as exc:
                logger.warning(f"申万三级分类加载失败，降级为空映射: {exc}")
                return {}

        if not self._sw_l3_map:
            self._sw_l3_map = self._cached("sw_l3_map", self.config.cache.name_map_ttl, _load)
        return self._sw_l3_map

    def compute_stock_metrics(self, trade_date: str) -> pd.DataFrame:
        dates = self.trade_dates(trade_date, need=80)
        pos = dates.index(trade_date)
        d5, d10, d20 = dates[pos - 5], dates[pos - 10], dates[pos - 20]
        d60 = dates[pos - 60] if pos >= 60 else dates[0]

        # 批量加载所有需要的日期数据
        needed_dates = [trade_date, d5, d10, d20, d60] + dates[pos - 19 : pos + 1]
        snapshots = self.stock_snapshot_batch(needed_dates)
        required_dates = [trade_date, d5, d10, d20, d60]
        for d in required_dates:
            df = snapshots.get(d)
            if df is None or df.empty or not {"ts_code", "close"}.issubset(df.columns):
                logger.warning(f"股票指标关键快照缺失: {d}")
                return pd.DataFrame()

        t = snapshots[trade_date][["ts_code", "close", "pct_chg", "amount"]]
        p5 = snapshots[d5][["ts_code", "close"]].rename(columns={"close": "close_5"})
        p10 = snapshots[d10][["ts_code", "close"]].rename(columns={"close": "close_10"})
        p20 = snapshots[d20][["ts_code", "close"]].rename(columns={"close": "close_20"})
        p60 = snapshots[d60][["ts_code", "close"]].rename(columns={"close": "close_60"})
        base = (
            t.merge(p5, on="ts_code", how="inner")
            .merge(p10, on="ts_code", how="inner")
            .merge(p20, on="ts_code", how="inner")
            .merge(p60, on="ts_code", how="inner")
        )

        for n in [5, 10, 20]:
            base[f"ret{n}"] = (base["close"] / base[f"close_{n}"] - 1) * 100

        # 优化 MA20 计算：使用 pivot 避免 merge 循环
        ma20_dates = dates[pos - 19 : pos + 1]
        ma20_data = []
        for d in ma20_dates:
            df = snapshots[d][["ts_code", "close"]].copy()
            df["date"] = d
            ma20_data.append(df)
        ma20_df = pd.concat(ma20_data, ignore_index=True)
        ma20_pivot = ma20_df.pivot(index="ts_code", columns="date", values="close")
        ma20_series = ma20_pivot.mean(axis=1).reset_index()
        ma20_series.columns = ["ts_code", "ma20"]
        base = base.merge(ma20_series, on="ts_code", how="left")

        for n in [5, 10, 20]:
            s = base[["ts_code", f"ret{n}"]].dropna().sort_values(f"ret{n}", ascending=False).reset_index(drop=True)
            s["rank"] = s.index + 1
            s[f"rps{n}"] = (1 - s["rank"] / len(s)) * 100
            base = base.merge(s[["ts_code", f"rps{n}"]], on="ts_code", how="left")

        base["name"] = base["ts_code"].map(self.stock_name_map()).fillna(base["ts_code"])
        base["above_ma20"] = base["close"] >= base["ma20"]
        base["amount_yuan"] = base["amount"] * 1000.0
        return base

    def compute_sector_metrics(self, trade_date: str) -> pd.DataFrame:
        dates = self.trade_dates(trade_date, need=30)
        pos = dates.index(trade_date)
        d5, d10 = dates[pos - 5], dates[pos - 10]
        cur = self.sector_snapshot(trade_date)
        if cur is None or cur.empty:
            logger.warning(f"板块当日快照缺失: {trade_date}")
            return pd.DataFrame()
        p5 = self.sector_snapshot(d5)[["ts_code", "close"]].rename(columns={"close": "close_5"})
        p10 = self.sector_snapshot(d10)[["ts_code", "close"]].rename(columns={"close": "close_10"})
        try:
            idx = self.pro.ths_index(fields="ts_code,name,type")
        except Exception as exc:
            logger.warning(f"板块索引元数据加载失败，降级使用快照字段: {exc}")
            idx = pd.DataFrame(columns=["ts_code", "name", "type"])
        s = cur.merge(p5, on="ts_code", how="inner").merge(p10, on="ts_code", how="inner").merge(
            idx, on="ts_code", how="left"
        )
        if s.empty:
            logger.warning(f"板块指标关键快照不足: {trade_date}, d5={d5}, d10={d10}")
            return pd.DataFrame()
        if self.rules.require_sector_above_ma30:
            sector_hist = []
            for d in dates[max(0, pos - 29) : pos + 1]:
                day_df = self.sector_snapshot(d)
                if day_df is None or day_df.empty:
                    continue
                day_df = day_df[["ts_code", "close"]].copy()
                day_df["trade_date"] = d
                sector_hist.append(day_df)
            if sector_hist:
                p30 = pd.concat(sector_hist, ignore_index=True)
                ma30_series = p30.pivot(index="ts_code", columns="trade_date", values="close").mean(axis=1).reset_index()
                ma30_series.columns = ["ts_code", "ma30"]
                s = s.merge(ma30_series, on="ts_code", how="left")
            else:
                s["ma30"] = s["close"]
        else:
            s["ma30"] = s["close"]
        s["ret5"] = (s["close"] / s["close_5"] - 1) * 100
        s["ret10"] = (s["close"] / s["close_10"] - 1) * 100
        s["amount_est"] = s["vol"] * s["avg_price"] * 100
        if "name" not in s.columns:
            s["name"] = s["ts_code"]
        if "type" not in s.columns:
            s["type"] = "N"
        s["sector_name"] = s["name"].fillna(s["ts_code"])
        s["activity_base"] = s.get("turnover_rate", pd.Series(np.zeros(len(s))))
        s["above_ma30"] = s["close"] >= s["ma30"]

        # 细分题材池：优先 N 概念 + 部分 I 行业，过滤统计噪声板块
        noise_keywords = [
            "昨日",
            "连板",
            "打板",
            "表现",
            "涨停",
            "跌停",
            "热股",
            "A股",
            "沪深",
            "三板",
            "二板",
            "非ST",
            "样本股",
            "持股",
            "上证",
            "中证",
            "沪深",
            "同花顺",
        ]
        excluded_keywords = [kw.strip() for kw in self.rules.excluded_sector_keywords if str(kw).strip()]
        keep_type = s["type"].isin(["N", "I"])
        no_noise = ~s["sector_name"].fillna("").str.contains("|".join(noise_keywords), regex=True)
        no_garbage = pd.Series(True, index=s.index)
        if excluded_keywords:
            excluded_pattern = "|".join(re.escape(kw) for kw in excluded_keywords)
            no_garbage = ~s["sector_name"].fillna("").str.contains(excluded_pattern, regex=True)
        not_too_broad = s["sector_name"].fillna("").str.len().between(2, 16)
        above_ma30 = s["above_ma30"] if self.rules.require_sector_above_ma30 else pd.Series(True, index=s.index)
        s = s[keep_type & no_noise & no_garbage & not_too_broad & above_ma30].copy()

        for n in [5, 10]:
            r = s[["ts_code", f"ret{n}"]].sort_values(f"ret{n}", ascending=False).reset_index(drop=True)
            r["rank"] = r.index + 1
            r[f"rps{n}"] = (1 - r["rank"] / len(r)) * 100
            s = s.merge(r[["ts_code", f"rps{n}"]], on="ts_code", how="left")

        s = s.sort_values("rps10", ascending=False).reset_index(drop=True)
        return s

    def market_overview(self, trade_date: str) -> dict[str, Any]:
        try:
            stocks = self.compute_stock_metrics(trade_date)
        except Exception as exc:
            logger.warning(f"计算市场股票指标失败，降级为当日快照视图: {trade_date}, 错误: {exc}")
            snap = self.stock_snapshot(trade_date)
            if snap is None or snap.empty:
                stocks = pd.DataFrame(columns=["ts_code", "pct_chg", "close", "amount", "close_60", "above_ma20"])
            else:
                stocks = snap.copy()
                stocks["above_ma20"] = False
                stocks["close_60"] = stocks["close"]
        if "above_ma20" not in stocks.columns:
            stocks["above_ma20"] = False
        if "close_60" not in stocks.columns:
            stocks["close_60"] = stocks["close"] if "close" in stocks.columns else 0
        try:
            sectors = self.compute_sector_metrics(trade_date)
            sectors = sectors[sectors["amount_est"] >= self.rules.sector_amount_min].copy()
        except Exception as exc:
            logger.warning(f"计算市场板块指标失败，降级为空板块视图: {trade_date}, 错误: {exc}")
            sectors = pd.DataFrame()

        up = int((stocks["pct_chg"] > 0).sum())
        down = int((stocks["pct_chg"] < 0).sum())
        limit_up = int((stocks["pct_chg"] >= 9.8).sum())
        limit_down = int((stocks["pct_chg"] <= -9.8).sum())
        ma20_ratio = float((stocks["above_ma20"]).mean() * 100) if len(stocks) else 0.0
        ma60_ratio = float((stocks["close"] > stocks["close_60"]).mean() * 100) if len(stocks) else 0.0

        score = 0
        if up > down:
            score += 25
        if limit_up > limit_down:
            score += 25
        if ma20_ratio >= 55:
            score += 25
        if ma60_ratio >= 55:
            score += 25

        if score >= 75:
            market_label, risk, light, advice = "进攻", "低", "green", "可积极开仓，优先主线强势股"
        elif score >= 45:
            market_label, risk, light, advice = "震荡", "中", "yellow", "控仓试错，只做分歧转强"
        else:
            market_label, risk, light, advice = "防守", "高", "red", "以卖为主，减少开仓"

        emotion = "正常"
        if limit_up <= 20 and limit_down >= 30:
            emotion = "冰点"
        elif limit_up >= 80 and limit_down <= 5:
            emotion = "狂热"
        elif up < down and limit_up < limit_down:
            emotion = "退潮"
        elif up > down and limit_up > limit_down:
            emotion = "修复"

        rec = self.recommend_top_sectors(trade_date, market_label, sectors)
        mainline = rec[0]["sectorName"] if rec else "暂无"
        mainline_state = "加强" if rec and rec[0]["compositeScore"] >= 75 else ("分歧" if rec else "衰退")
        market_risk = self._build_market_risk_payload(
            score=score,
            up=up,
            down=down,
            limit_up=limit_up,
            limit_down=limit_down,
            ma20_ratio=ma20_ratio,
            ma60_ratio=ma60_ratio,
            emotion=emotion,
        )

        return {
            "tradeDate": trade_date,
            "marketState": {
                "label": market_label,
                "riskLevel": risk,
                "actionAdvice": advice,
                "openPermissionLight": light,
                "score": score,
            },
            "emotionState": {
                "label": emotion,
                "score": round((limit_up - limit_down) * 0.8 + (up - down) / max(up + down, 1) * 20, 2),
                "warnings": [],
            },
            "breadth": {
                "upCount": up,
                "downCount": down,
                "limitUpCount": limit_up,
                "limitDownCount": limit_down,
                "brokenBoardRate": 0.0,
                "newHighCount": 0,
                "newLowCount": 0,
                "aboveMa20Ratio": round(ma20_ratio, 2),
                "aboveMa60Ratio": round(ma60_ratio, 2),
            },
            "mainline": {
                "name": mainline,
                "status": mainline_state,
                "reason": "基于RPS、5/10日涨幅、活跃度与环境匹配综合评分",
            },
            "marketRisk": market_risk,
            "topSectors": rec,
        }

    @staticmethod
    def _build_market_risk_payload(
        *,
        score: int,
        up: int,
        down: int,
        limit_up: int,
        limit_down: int,
        ma20_ratio: float,
        ma60_ratio: float,
        emotion: str,
    ) -> dict[str, Any]:
        if score >= 85:
            label, short_label, tone = "强势", "Risk On", "positive"
        elif score >= 65:
            label, short_label, tone = "偏强", "Constructive", "positive"
        elif score >= 45:
            label, short_label, tone = "中性", "Neutral", "neutral"
        elif score >= 25:
            label, short_label, tone = "风险", "Caution", "warning"
        else:
            label, short_label, tone = "强风险", "Risk Off", "danger"

        breadth_delta = up - down
        limit_delta = limit_up - limit_down
        summary = "市场处于均衡区间，适合观察主线是否进一步集中。"
        if score >= 65:
            summary = "市场环境偏顺风，图表确认优先于题材猜测，可向强势主线集中。"
        elif score < 25:
            summary = "亏钱效应占优，优先控制回撤，弱势反抽不宜给高预期。"
        elif score < 45:
            summary = "环境偏谨慎，只有在主线、量能与价格共振时才值得出手。"

        return {
            "score": score,
            "label": label,
            "shortLabel": short_label,
            "tone": tone,
            "summary": summary,
            "pointerValue": score,
            "emotion": emotion,
            "factors": [
                {
                    "key": "breadth",
                    "label": "涨跌家数差",
                    "value": breadth_delta,
                    "displayValue": f"{breadth_delta:+d}",
                    "tone": "positive" if breadth_delta > 0 else ("danger" if breadth_delta < 0 else "neutral"),
                },
                {
                    "key": "limits",
                    "label": "涨跌停差",
                    "value": limit_delta,
                    "displayValue": f"{limit_delta:+d}",
                    "tone": "positive" if limit_delta > 0 else ("danger" if limit_delta < 0 else "neutral"),
                },
                {
                    "key": "ma20",
                    "label": "站上 MA20",
                    "value": round(ma20_ratio, 2),
                    "displayValue": f"{ma20_ratio:.1f}%",
                    "tone": "positive" if ma20_ratio >= 55 else ("warning" if ma20_ratio >= 45 else "danger"),
                },
                {
                    "key": "ma60",
                    "label": "站上 MA60",
                    "value": round(ma60_ratio, 2),
                    "displayValue": f"{ma60_ratio:.1f}%",
                    "tone": "positive" if ma60_ratio >= 55 else ("warning" if ma60_ratio >= 45 else "danger"),
                },
            ],
        }

    def recommend_top_sectors(self, trade_date: str, market_label: str, sectors: pd.DataFrame | None = None) -> list[dict[str, Any]]:
        df = sectors.copy() if sectors is not None else self.compute_sector_metrics(trade_date)
        required_columns = {"amount_est", "rps10", "ret5", "ret10", "sector_name", "ts_code"}
        if df is None or df.empty or not required_columns.issubset(set(df.columns)):
            return []
        df = df[df["amount_est"] >= self.rules.sector_amount_min].copy()
        if df.empty:
            return []

        def minmax(s: pd.Series) -> pd.Series:
            lo, hi = float(s.min()), float(s.max())
            if hi - lo < 1e-9:
                return pd.Series(np.full(len(s), 50.0), index=s.index)
            return (s - lo) / (hi - lo) * 100

        df["rps_score"] = minmax(df["rps10"])
        df["ret5_score"] = minmax(df["ret5"])
        df["ret10_score"] = minmax(df["ret10"])
        base_col = "activity_base" if "activity_base" in df.columns else ("turnover_rate" if "turnover_rate" in df.columns else "vol")
        df["activity_score"] = minmax(df[base_col])
        if market_label == "进攻":
            df["env_fit_score"] = np.where(df["ret5"] > 0, 90, 40)
        elif market_label == "防守":
            df["env_fit_score"] = np.where(df["ret10"] > 0, 70, 35)
        else:
            df["env_fit_score"] = 60

        df["composite"] = (
            df["rps_score"] * 0.45
            + df["ret5_score"] * 0.20
            + df["ret10_score"] * 0.15
            + df["activity_score"] * 0.10
            + df["env_fit_score"] * 0.10
        )
        df = df.sort_values("composite", ascending=False).head(4).reset_index(drop=True)
        out: list[dict[str, Any]] = []
        for i, r in df.iterrows():
            out.append(
                {
                    "rank": i + 1,
                    "sectorCode": r["ts_code"],
                    "sectorName": r["sector_name"],
                    "compositeScore": round(float(r["composite"]), 2),
                    "rps10": round(float(r["rps10"]), 2),
                    "pctChange5d": round(float(r["ret5"]), 2),
                    "pctChange10d": round(float(r["ret10"]), 2),
                    "activityScore": round(float(r["activity_score"]), 2),
                    "envFitScore": round(float(r["env_fit_score"]), 2),
                    "amount": round(float(r["amount_est"]), 2),
                    "reason": f"RPS强度与趋势延续性较好，且与{market_label}环境匹配",
                }
            )
        return out

    def _batch_query_sector_limits(self, sector_codes: list[str], trade_date: str, limit_up_codes: set[str]) -> dict[str, int]:
        """并发查询多个板块的涨停股数量"""
        def _query_one(code: str) -> tuple[str, int]:
            cache_key = f"limit_cnt:{trade_date}:{code}"
            got = self._cache.get(cache_key)
            if got:
                return code, int(got[1])
            try:
                members = self.pro.index_member(index_code=code) if code.endswith(".SI") else self.pro.ths_member(ts_code=code)
                if members is None or members.empty:
                    self._cache[cache_key] = (time.time(), 0)
                    return code, 0
                mcode_col = "con_code" if "con_code" in members.columns else "ts_code"
                cnt = int(members[mcode_col].isin(limit_up_codes).sum())
                self._cache[cache_key] = (time.time(), cnt)
                return code, cnt
            except Exception:
                return code, 0

        result = {}
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(_query_one, code): code for code in sector_codes}
            for future in as_completed(futures):
                try:
                    code, cnt = future.result()
                    result[code] = cnt
                except Exception:
                    code = futures[future]
                    result[code] = 0
        return result

    def sector_rankings(self, trade_date: str, sort_by: str = "rps10", keyword: str = "") -> list[dict[str, Any]]:
        try:
            df = self.compute_sector_metrics(trade_date)
        except Exception as exc:
            logger.warning(f"计算板块排行失败，返回空列表: {trade_date}, 错误: {exc}")
            return []
        if df is None or df.empty:
            return []
        df = df[df["amount_est"] >= self.rules.sector_amount_min].copy()
        if keyword:
            df = df[df["sector_name"].str.contains(keyword, na=False)].copy()
        sort_col = {"5d": "ret5", "10d": "ret10", "rps": "rps10", "rps10": "rps10"}.get(sort_by, "rps10")
        df = df.sort_values(sort_col, ascending=False).reset_index(drop=True)
        display_limit = 30
        limit_count_scope = 30
        top_df = df.head(display_limit).copy()

        # 计算板块涨停个数（基于当日涨停股与板块成分交集）
        snap = self.stock_snapshot(trade_date)
        limit_up_codes = set(snap[snap["pct_chg"] >= 9.8]["ts_code"].dropna().tolist()) if snap is not None else set()

        # 批量并发查询板块涨停数量
        top_codes = top_df.head(limit_count_scope)["ts_code"].tolist()
        limit_counts = self._batch_query_sector_limits(top_codes, trade_date, limit_up_codes)

        out: list[dict[str, Any]] = []
        for i, r in top_df.iterrows():
            code = r["ts_code"]
            out.append(
                {
                    "rank": i + 1,
                    "sectorCode": code,
                    "sectorName": r["sector_name"],
                    "pctChange5d": round(float(r["ret5"]), 2),
                    "pctChange10d": round(float(r["ret10"]), 2),
                    "rps10": round(float(r["rps10"]), 2),
                    "amount": round(float(r["amount_est"]), 2),
                    "limitUpCount": limit_counts.get(code, 0),
                }
            )
        return out

    def _get_sector_member_codes(self, sector_code: str, trade_date: str) -> list[str]:
        stock_codes: list[str] = []
        if sector_code.endswith(".SI"):
            members = self.pro.index_member(index_code=sector_code)
            if members is not None and not members.empty:
                valid = members["out_date"].isna() | (members["out_date"] == "") | (members["out_date"] > trade_date)
                stock_codes = members[valid]["con_code"].dropna().unique().tolist()
        else:
            members = self.pro.ths_member(ts_code=sector_code)
            if members is not None and not members.empty:
                stock_codes = members["con_code"].dropna().unique().tolist()
        return stock_codes

    def sector_detail(self, sector_code: str, trade_date: str) -> dict[str, Any]:
        try:
            sectors = self.compute_sector_metrics(trade_date)
            stocks = self.compute_stock_metrics(trade_date)
        except Exception as exc:
            logger.warning(f"计算板块详情失败: {sector_code}, 错误: {exc}")
            return {"overview": None, "items": [], "strongItems": []}

        if sectors is None or sectors.empty:
            return {"overview": None, "items": [], "strongItems": []}

        sector_row = sectors[sectors["ts_code"] == sector_code]
        if sector_row.empty:
            return {"overview": None, "items": [], "strongItems": []}

        stock_codes = self._get_sector_member_codes(sector_code, trade_date)
        if not stock_codes:
            return {"overview": None, "items": [], "strongItems": []}

        day_snap = self.stock_snapshot(trade_date)
        if day_snap is None or day_snap.empty:
            return {"overview": None, "items": [], "strongItems": []}

        day_sector = day_snap[day_snap["ts_code"].isin(stock_codes)].copy()
        if day_sector.empty:
            return {"overview": None, "items": [], "strongItems": []}

        day_sector["name"] = day_sector["ts_code"].map(self.stock_name_map()).fillna(day_sector["ts_code"])
        day_sector["amount_yuan"] = day_sector["amount"] * 1000.0

        enriched = day_sector.merge(
            stocks[
                [
                    "ts_code",
                    "ret5",
                    "ret10",
                    "rps5",
                    "rps10",
                    "rps20",
                    "ma20",
                    "above_ma20",
                ]
            ],
            on="ts_code",
            how="left",
        )
        enriched = enriched.sort_values(["pct_chg", "amount_yuan"], ascending=False).reset_index(drop=True)

        dates = self.trade_dates(trade_date, need=25)
        lookback_dates = dates[-20:] if len(dates) >= 20 else dates
        history = self.stock_snapshot_batch(lookback_dates)
        highs_by_code: dict[str, list[float]] = {}
        for date in lookback_dates[:-1]:
            frame = history.get(date)
            if frame is None or frame.empty:
                continue
            scoped = frame[frame["ts_code"].isin(stock_codes)][["ts_code", "high"]].dropna()
            for _, row in scoped.iterrows():
                highs_by_code.setdefault(str(row["ts_code"]), []).append(float(row["high"]))

        strong_items: list[dict[str, Any]] = []
        items: list[dict[str, Any]] = []
        for _, row in enriched.iterrows():
            ts_code = str(row["ts_code"])
            item = {
                "tsCode": ts_code,
                "stockName": str(row["name"]),
                "close": round(float(row["close"]), 2),
                "pctChange1d": round(float(row["pct_chg"]), 2),
                "pctChange5d": round(float(row["ret5"]), 2) if pd.notna(row.get("ret5")) else None,
                "pctChange10d": round(float(row["ret10"]), 2) if pd.notna(row.get("ret10")) else None,
                "rps5": round(float(row["rps5"]), 2) if pd.notna(row.get("rps5")) else None,
                "rps10": round(float(row["rps10"]), 2) if pd.notna(row.get("rps10")) else None,
                "rps20": round(float(row["rps20"]), 2) if pd.notna(row.get("rps20")) else None,
                "amount": round(float(row["amount_yuan"]), 2),
                "aboveMa20": bool(row["above_ma20"]) if pd.notna(row.get("above_ma20")) else False,
            }
            items.append(item)

            previous_highs = highs_by_code.get(ts_code, [])
            hh_threshold = max(previous_highs) if previous_highs else None
            is_hh = (
                hh_threshold is not None
                and float(row["close"]) >= hh_threshold * 0.995
                and float(row["amount_yuan"]) >= self.rules.stock_amount_min
                and pd.notna(row.get("rps20"))
                and float(row["rps20"]) >= self.rules.stock_rps_min
                and bool(row.get("above_ma20", False))
            )
            if is_hh:
                strong_items.append({**item, "hhThreshold": round(float(hh_threshold), 2)})

        sector_data = sector_row.iloc[0]
        limit_up = int((day_sector["pct_chg"] >= 9.8).sum())
        up_count = int((day_sector["pct_chg"] > 0).sum())
        down_count = int((day_sector["pct_chg"] < 0).sum())
        flat_count = int((day_sector["pct_chg"] == 0).sum())
        overview = {
            "sectorCode": sector_code,
            "sectorName": str(sector_data["sector_name"]),
            "tradeDate": trade_date,
            "amount": round(float(sector_data["amount_est"]), 2),
            "pctChange5d": round(float(sector_data["ret5"]), 2),
            "pctChange10d": round(float(sector_data["ret10"]), 2),
            "rps10": round(float(sector_data["rps10"]), 2),
            "limitUpCount": limit_up,
            "upCount": up_count,
            "downCount": down_count,
            "flatCount": flat_count,
            "memberCount": len(stock_codes),
            "strongCount": len(strong_items),
        }
        return {"overview": overview, "items": items[:200], "strongItems": strong_items[:120]}

    def sector_stocks(self, sector_code: str, trade_date: str, sort_by: str = "rps10") -> list[dict[str, Any]]:
        stock_codes: list[str] = []
        if sector_code.endswith(".SI"):
            members = self.pro.index_member(index_code=sector_code)
            if members is not None and not members.empty:
                m = members.copy()
                # 当前交易日有效成分：未剔除或剔除日晚于当前日
                cond = m["out_date"].isna() | (m["out_date"] == "") | (m["out_date"] > trade_date)
                stock_codes = m[cond]["con_code"].dropna().unique().tolist()
        else:
            members = self.pro.ths_member(ts_code=sector_code)
            if members is not None and not members.empty:
                stock_codes = members["con_code"].dropna().unique().tolist()
        if not stock_codes:
            return []
        try:
            stocks = self.compute_stock_metrics(trade_date)
        except Exception as exc:
            logger.warning(f"计算板块强股失败，降级为当日成分股视图: {sector_code}, 错误: {exc}")
            stocks = pd.DataFrame()

        if stocks.empty:
            return self._fallback_sector_stocks(stock_codes, trade_date, sort_by)

        df = stocks[stocks["ts_code"].isin(stock_codes)].copy()
        df = df[df["amount_yuan"] >= self.rules.stock_amount_min]
        if self.rules.require_above_ma20:
            df = df[df["above_ma20"]]
        df = df[df["rps20"] >= self.rules.stock_rps_min]

        if df.empty:
            return self._fallback_sector_stocks(stock_codes, trade_date, sort_by)

        sort_col = {"5d": "ret5", "10d": "ret10", "rps": "rps20", "rps10": "rps10"}.get(sort_by, "rps20")
        df = df.sort_values(sort_col, ascending=False).head(120)
        out: list[dict[str, Any]] = []
        for _, r in df.iterrows():
            out.append(
                {
                    "tsCode": r["ts_code"],
                    "stockName": r["name"],
                    "close": round(float(r["close"]), 2),
                    "pctChange1d": round(float(r["pct_chg"]), 2),
                    "pctChange5d": round(float(r["ret5"]), 2),
                    "pctChange10d": round(float(r["ret10"]), 2),
                    "rps5": round(float(r["rps5"]), 2),
                    "rps10": round(float(r["rps10"]), 2),
                    "rps20": round(float(r["rps20"]), 2),
                    "amount": round(float(r["amount_yuan"]), 2),
                    "ma20": round(float(r["ma20"]), 2),
                    "dataMode": "full",
                }
            )
        return out

    def bull_camp(self, trade_date: str) -> list[dict[str, Any]]:
        def _load() -> list[dict[str, Any]]:
            try:
                stocks = self.compute_stock_metrics(trade_date)
                sectors = self.compute_sector_metrics(trade_date)
            except Exception as exc:
                logger.warning(f"计算牛股集中营失败，返回空列表: {trade_date}, 错误: {exc}")
                return []

            if stocks is None or stocks.empty or sectors is None or sectors.empty:
                return []

            sectors = sectors[sectors["amount_est"] >= self.rules.sector_amount_min].copy()
            if sectors.empty:
                return []

            sector_assignments: dict[str, dict[str, Any]] = {}
            sorted_sectors = sectors.sort_values(["rps10", "ret5"], ascending=False)
            for _, row in sorted_sectors.iterrows():
                sector_code = str(row["ts_code"])
                try:
                    if sector_code.endswith(".SI"):
                        members = self.pro.index_member(index_code=sector_code)
                        if members is None or members.empty:
                            continue
                        valid = members["out_date"].isna() | (members["out_date"] == "") | (members["out_date"] > trade_date)
                        codes = members[valid]["con_code"].dropna().unique().tolist()
                    else:
                        members = self.pro.ths_member(ts_code=sector_code)
                        if members is None or members.empty:
                            continue
                        codes = members["con_code"].dropna().unique().tolist()
                except Exception as exc:
                    logger.debug(f"读取板块成分失败: {sector_code}, 错误: {exc}")
                    continue

                sector_meta = {
                    "sectorCode": sector_code,
                    "sectorName": str(row["sector_name"]),
                    "sectorPctChange5d": float(row["ret5"]),
                    "sectorPctChange10d": float(row["ret10"]),
                    "sectorRps10": float(row["rps10"]),
                }
                for code in codes:
                    if code not in sector_assignments:
                        sector_assignments[code] = sector_meta

            if not sector_assignments:
                return []

            df = stocks[stocks["ts_code"].isin(sector_assignments.keys())].copy()
            if df.empty:
                return []

            df["sectorCode"] = df["ts_code"].map(lambda code: sector_assignments[code]["sectorCode"])
            df["sectorName"] = df["ts_code"].map(lambda code: sector_assignments[code]["sectorName"])
            df["sectorPctChange5d"] = df["ts_code"].map(lambda code: sector_assignments[code]["sectorPctChange5d"])
            df["sectorPctChange10d"] = df["ts_code"].map(lambda code: sector_assignments[code]["sectorPctChange10d"])
            df["sectorRps10"] = df["ts_code"].map(lambda code: sector_assignments[code]["sectorRps10"])

            df = df[
                (df["rps20"] > 87)
                & (df["amount_yuan"] >= 1_000_000_000)
                & (df["pct_chg"] > 0)
                & (df["ret5"] > df["sectorPctChange5d"])
                & (df["rps20"] > df["sectorRps10"])
            ].copy()
            if df.empty:
                return []

            rs_latest_values: dict[str, float] = {}
            rs5_values: dict[str, float] = {}
            rs10_values: dict[str, float] = {}
            rs20_values: dict[str, float] = {}
            keep_codes: list[str] = []

            for _, row in df.iterrows():
                ts_code = str(row["ts_code"])
                sector_code = str(row["sectorCode"])
                try:
                    rs = self.relative_strength(ts_code, sector_code, trade_date, bars=60)
                except Exception as exc:
                    logger.debug(f"相对强弱计算失败: {ts_code}/{sector_code}, 错误: {exc}")
                    continue

                spread_series = rs.get("spreadSeries") or []
                latest = float(spread_series[-1]["value"]) if spread_series else 0.0
                if latest <= 0:
                    continue

                keep_codes.append(ts_code)
                rs_latest_values[ts_code] = latest
                summary = rs.get("summary") or {}
                rs5_values[ts_code] = float(summary.get("relativeStrength5d", 0.0))
                rs10_values[ts_code] = float(summary.get("relativeStrength10d", 0.0))
                rs20_values[ts_code] = float(summary.get("relativeStrength20d", 0.0))

            if not keep_codes:
                return []

            df = df[df["ts_code"].isin(keep_codes)].copy()
            df["relativeStrengthLatest"] = df["ts_code"].map(rs_latest_values)
            df["relativeStrength5d"] = df["ts_code"].map(rs5_values)
            df["relativeStrength10d"] = df["ts_code"].map(rs10_values)
            df["relativeStrength20d"] = df["ts_code"].map(rs20_values)

            def minmax(s: pd.Series) -> pd.Series:
                lo, hi = float(s.min()), float(s.max())
                if hi - lo < 1e-9:
                    return pd.Series(np.full(len(s), 50.0), index=s.index)
                return (s - lo) / (hi - lo) * 100

            df["rpsScore"] = minmax(df["rps20"])
            df["rsScore"] = minmax(df["relativeStrengthLatest"])
            df["amountScore"] = minmax(df["amount_yuan"])
            df["campScore"] = df["rpsScore"] * 0.5 + df["rsScore"] * 0.3 + df["amountScore"] * 0.2
            df = df.sort_values(["campScore", "rps20", "relativeStrengthLatest"], ascending=False).reset_index(drop=True)

            out: list[dict[str, Any]] = []
            for _, row in df.iterrows():
                out.append(
                    {
                        "tsCode": str(row["ts_code"]),
                        "stockName": str(row["name"]),
                        "sectorCode": str(row["sectorCode"]),
                        "sectorName": str(row["sectorName"]),
                        "close": round(float(row["close"]), 2),
                        "pctChange1d": round(float(row["pct_chg"]), 2),
                        "pctChange5d": round(float(row["ret5"]), 2),
                        "pctChange10d": round(float(row["ret10"]), 2),
                        "sectorPctChange5d": round(float(row["sectorPctChange5d"]), 2),
                        "sectorPctChange10d": round(float(row["sectorPctChange10d"]), 2),
                        "rps10": round(float(row["rps10"]), 2),
                        "rps20": round(float(row["rps20"]), 2),
                        "sectorRps10": round(float(row["sectorRps10"]), 2),
                        "amount": round(float(row["amount_yuan"]), 2),
                        "ma20": round(float(row["ma20"]), 2),
                        "relativeStrengthLatest": round(float(row["relativeStrengthLatest"]), 2),
                        "relativeStrength5d": round(float(row["relativeStrength5d"]), 2),
                        "relativeStrength10d": round(float(row["relativeStrength10d"]), 2),
                        "relativeStrength20d": round(float(row["relativeStrength20d"]), 2),
                        "campScore": round(float(row["campScore"]), 2),
                    }
                )
            return out

        return self._cached(f"bull_camp:{trade_date}", 900, _load)

    def _fallback_sector_stocks(self, stock_codes: list[str], trade_date: str, sort_by: str = "rps10") -> list[dict[str, Any]]:
        """RPS/MA链路失败时，至少返回板块当日成分股列表"""
        snap = self.stock_snapshot(trade_date)
        if snap is None or snap.empty:
            return []
        df = snap[snap["ts_code"].isin(stock_codes)].copy()
        if df.empty:
            return []

        df["name"] = df["ts_code"].map(self.stock_name_map()).fillna(df["ts_code"])
        df["amount_yuan"] = df["amount"] * 1000.0
        df = df[df["amount_yuan"] >= self.rules.stock_amount_min]
        sort_col = {"5d": "pct_chg", "10d": "pct_chg", "rps": "pct_chg", "rps10": "pct_chg"}.get(sort_by, "pct_chg")
        df = df.sort_values(sort_col, ascending=False).head(120)

        out: list[dict[str, Any]] = []
        for _, r in df.iterrows():
            out.append(
                {
                    "tsCode": r["ts_code"],
                    "stockName": r["name"],
                    "close": round(float(r["close"]), 2),
                    "pctChange1d": round(float(r["pct_chg"]), 2),
                    "pctChange5d": None,
                    "pctChange10d": None,
                    "rps5": None,
                    "rps10": None,
                    "rps20": None,
                    "amount": round(float(r["amount_yuan"]), 2),
                    "ma20": None,
                    "dataMode": "fallback",
                }
            )
        return out

    def stock_kline(self, ts_code: str, trade_date: str, bars: int = 180) -> dict[str, Any]:
        dates = self.trade_dates(trade_date, need=max(bars + 30, 220))
        start = dates[-bars] if len(dates) >= bars else dates[0]
        try:
            df = ts.pro_bar(
                pro_api=self.pro,
                ts_code=ts_code,
                adj="qfq",
                start_date=start,
                end_date=trade_date,
                asset="E",
            )
        except Exception as exc:
            logger.warning(f"前复权日线加载失败，降级原始日线: {ts_code}, 错误: {exc}")
            df = self.pro.daily(ts_code=ts_code, start_date=start, end_date=trade_date)
        if df is None or df.empty:
            return {"code": ts_code, "name": ts_code, "points": []}
        df = df.sort_values("trade_date").reset_index(drop=True)
        df["ma5"] = df["close"].rolling(5).mean()
        df["ma10"] = df["close"].rolling(10).mean()
        df["ma20"] = df["close"].rolling(20).mean()
        name = self.stock_name_map().get(ts_code, ts_code)
        points = []
        for _, r in df.iterrows():
            points.append(
                {
                    "time": str(r["trade_date"]),
                    "open": float(r["open"]),
                    "high": float(r["high"]),
                    "low": float(r["low"]),
                    "close": float(r["close"]),
                    "volume": float(r["vol"]),
                    "amount": float(r["amount"]) if "amount" in r else 0.0,
                    "ma5": float(r["ma5"]) if pd.notna(r["ma5"]) else None,
                    "ma10": float(r["ma10"]) if pd.notna(r["ma10"]) else None,
                    "ma20": float(r["ma20"]) if pd.notna(r["ma20"]) else None,
                }
            )
        return {"code": ts_code, "name": name, "points": points}

    def sector_kline(self, sector_code: str, trade_date: str, bars: int = 180) -> dict[str, Any]:
        dates = self.trade_dates(trade_date, need=max(bars + 30, 220))
        start = dates[-bars] if len(dates) >= bars else dates[0]
        if sector_code.endswith(".SI"):
            df = self.pro.sw_daily(ts_code=sector_code, start_date=start, end_date=trade_date)
        else:
            df = self.pro.ths_daily(ts_code=sector_code, start_date=start, end_date=trade_date)
        if df is None or df.empty:
            return {"code": sector_code, "name": sector_code, "points": []}
        df = df.sort_values("trade_date").reset_index(drop=True)
        df["ma5"] = df["close"].rolling(5).mean()
        df["ma10"] = df["close"].rolling(10).mean()
        df["ma20"] = df["close"].rolling(20).mean()
        if sector_code.endswith(".SI"):
            name = self.sw_l3_map().get(sector_code, sector_code)
        else:
            name = self.sector_name_map().get(sector_code, sector_code)
        points = []
        for _, r in df.iterrows():
            points.append(
                {
                    "time": str(r["trade_date"]),
                    "open": float(r["open"]),
                    "high": float(r["high"]),
                    "low": float(r["low"]),
                    "close": float(r["close"]),
                    "volume": float(r["vol"]),
                    "ma5": float(r["ma5"]) if pd.notna(r["ma5"]) else None,
                    "ma10": float(r["ma10"]) if pd.notna(r["ma10"]) else None,
                    "ma20": float(r["ma20"]) if pd.notna(r["ma20"]) else None,
                }
            )
        return {"code": sector_code, "name": name, "points": points}

    def relative_strength(self, ts_code: str, sector_code: str, trade_date: str, bars: int = 60) -> dict[str, Any]:
        sk = self.stock_kline(ts_code, trade_date, bars=bars)
        bk = self.sector_kline(sector_code, trade_date, bars=bars)
        if not sk["points"] or not bk["points"]:
            return {
                "stock": {"tsCode": ts_code, "name": sk.get("name", ts_code), "rpsSeries": []},
                "sector": {"sectorCode": sector_code, "name": bk.get("name", sector_code), "rpsSeries": []},
                "summary": {"relativeStrength5d": 0, "relativeStrength10d": 0, "relativeStrength20d": 0, "label": "同步"},
            }

        s = pd.DataFrame(sk["points"])[["time", "close"]].rename(columns={"close": "s_close"})
        b = pd.DataFrame(bk["points"])[["time", "close"]].rename(columns={"close": "b_close"})
        m = s.merge(b, on="time", how="inner")

        def pct_n(series: pd.Series, n: int) -> float:
            if len(series) <= n:
                return 0.0
            return float((series.iloc[-1] / series.iloc[-1 - n] - 1) * 100)

        s5, s10, s20 = pct_n(m["s_close"], 5), pct_n(m["s_close"], 10), pct_n(m["s_close"], 20)
        b5, b10, b20 = pct_n(m["b_close"], 5), pct_n(m["b_close"], 10), pct_n(m["b_close"], 20)
        rs5, rs10, rs20 = s5 - b5, s10 - b10, s20 - b20

        label = "同步"
        if rs10 > 2 and rs20 > 0:
            label = "领先"
        elif rs10 < -2:
            label = "落后"

        m["s_norm"] = (m["s_close"] / m["s_close"].iloc[0] - 1) * 100
        m["b_norm"] = (m["b_close"] / m["b_close"].iloc[0] - 1) * 100

        return {
            "stock": {
                "tsCode": ts_code,
                "name": sk["name"],
                "pctChange5d": round(s5, 2),
                "pctChange10d": round(s10, 2),
                "pctChange20d": round(s20, 2),
                "rpsSeries": [{"time": x["time"], "value": round(float(x["s_norm"]), 2)} for _, x in m.iterrows()],
            },
            "sector": {
                "sectorCode": sector_code,
                "name": bk["name"],
                "pctChange5d": round(b5, 2),
                "pctChange10d": round(b10, 2),
                "pctChange20d": round(b20, 2),
                "rpsSeries": [{"time": x["time"], "value": round(float(x["b_norm"]), 2)} for _, x in m.iterrows()],
            },
            "spreadSeries": [{"time": x["time"], "value": round(float(x["s_norm"] - x["b_norm"]), 2)} for _, x in m.iterrows()],
            "summary": {
                "relativeStrength5d": round(rs5, 2),
                "relativeStrength10d": round(rs10, 2),
                "relativeStrength20d": round(rs20, 2),
                "label": label,
            },
        }

    def stock_financials(self, ts_code: str, periods: int = 8) -> dict[str, Any]:
        """获取个股最近 N 个季度的核心财务数据（营收、净利润、毛利率等）"""
        name = self.stock_name_map().get(ts_code, ts_code)

        # 利润表：营收、净利润
        try:
            income_df = self.pro.income(
                ts_code=ts_code,
                fields="ts_code,ann_date,f_ann_date,end_date,report_type,"
                       "revenue,operate_profit,total_profit,n_income,"
                       "basic_eps,diluted_eps",
            )
        except Exception as exc:
            logger.warning(f"利润表加载失败: {ts_code}, {exc}")
            income_df = pd.DataFrame()

        # 财务指标：毛利率、净利率、ROE 等
        try:
            indicator_df = self.pro.fina_indicator(
                ts_code=ts_code,
                fields="ts_code,ann_date,end_date,grossprofit_margin,"
                       "netprofit_margin,roe,current_ratio,debt_to_assets,"
                       "revenue_ps,extra_item",
            )
        except Exception as exc:
            logger.warning(f"财务指标加载失败: {ts_code}, {exc}")
            indicator_df = pd.DataFrame()

        results: list[dict[str, Any]] = []

        if income_df is not None and not income_df.empty:
            # 只取合并报表（report_type == 1）且去重
            if "report_type" in income_df.columns:
                income_df = income_df[income_df["report_type"].astype(str) == "1"]
            income_df = income_df.drop_duplicates(subset=["end_date"], keep="first")
            income_df = income_df.sort_values("end_date", ascending=False).head(periods)

            # 合并指标
            for _, row in income_df.iterrows():
                end_date = str(row["end_date"])
                item: dict[str, Any] = {
                    "endDate": end_date,
                    "annDate": str(row.get("ann_date", "")),
                    "revenue": float(row["revenue"]) if pd.notna(row.get("revenue")) else None,
                    "operateProfit": float(row["operate_profit"]) if pd.notna(row.get("operate_profit")) else None,
                    "netIncome": float(row["n_income"]) if pd.notna(row.get("n_income")) else None,
                    "basicEps": float(row["basic_eps"]) if pd.notna(row.get("basic_eps")) else None,
                }

                # 从 indicator_df 找同期指标
                if indicator_df is not None and not indicator_df.empty:
                    matched = indicator_df[indicator_df["end_date"] == end_date]
                    if not matched.empty:
                        ind = matched.iloc[0]
                        item["grossMargin"] = float(ind["grossprofit_margin"]) if pd.notna(ind.get("grossprofit_margin")) else None
                        item["netMargin"] = float(ind["netprofit_margin"]) if pd.notna(ind.get("netprofit_margin")) else None
                        item["roe"] = float(ind["roe"]) if pd.notna(ind.get("roe")) else None
                        item["debtToAssets"] = float(ind["debt_to_assets"]) if pd.notna(ind.get("debt_to_assets")) else None

                results.append(item)

        # 计算同比增速（如果有去年同期）
        for item in results:
            end = item["endDate"]
            yoy_end = str(int(end[:4]) - 1) + end[4:]
            prev = next((r for r in results if r["endDate"] == yoy_end), None)
            if prev and item.get("revenue") and prev.get("revenue") and prev["revenue"] != 0:
                item["revenueYoY"] = round((item["revenue"] / prev["revenue"] - 1) * 100, 2)
            if prev and item.get("netIncome") and prev.get("netIncome") and prev["netIncome"] != 0:
                item["netIncomeYoY"] = round((item["netIncome"] / prev["netIncome"] - 1) * 100, 2)

        return {"code": ts_code, "name": name, "periods": results}
