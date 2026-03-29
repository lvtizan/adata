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
from pattern_detector import detect_all_patterns
from precompute import PrecomputedStore

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
        self._precomputed = PrecomputedStore()
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

            # 检查预计算库是否已有当天数据，没有则后台触发预计算
            if not self._precomputed.has_data(trade_date):
                import threading
                def _run_precompute():
                    try:
                        from precompute import run as precompute_run
                        logger.info(f"后台预计算启动: {trade_date}")
                        precompute_run(trade_date)
                        logger.info(f"后台预计算完成: {trade_date}")
                    except Exception as exc:
                        logger.warning(f"后台预计算失败: {exc}")
                threading.Thread(target=_run_precompute, daemon=True, name="PrecomputeThread").start()
            else:
                logger.info(f"预计算库已有 {trade_date} 数据，跳过")
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
        dates = self.trade_dates(trade_date, need=260)
        pos = dates.index(trade_date)
        d5, d10, d20 = dates[pos - 5], dates[pos - 10], dates[pos - 20]
        d60 = dates[pos - 60] if pos >= 60 else dates[0]
        d120 = dates[pos - 120] if pos >= 120 else dates[0]
        d250 = dates[pos - 250] if pos >= 250 else dates[0]

        # 批量加载所有需要的日期数据
        needed_dates = list(set([trade_date, d5, d10, d20, d60, d120, d250] + dates[pos - 19 : pos + 1]))
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

        # 120日/250日收盘价 (可选，不影响基础指标)
        p120 = snapshots.get(d120)
        if p120 is not None and not p120.empty:
            p120 = p120[["ts_code", "close"]].rename(columns={"close": "close_120"})
            base = base.merge(p120, on="ts_code", how="left")
        else:
            base["close_120"] = np.nan

        p250 = snapshots.get(d250)
        if p250 is not None and not p250.empty:
            p250 = p250[["ts_code", "close"]].rename(columns={"close": "close_250"})
            base = base.merge(p250, on="ts_code", how="left")
        else:
            base["close_250"] = np.nan

        for n in [5, 10, 20]:
            base[f"ret{n}"] = (base["close"] / base[f"close_{n}"] - 1) * 100

        # 120日/250日涨幅
        base["ret120"] = np.where(
            base["close_120"].notna() & (base["close_120"] > 0),
            (base["close"] / base["close_120"] - 1) * 100, np.nan
        )
        base["ret250"] = np.where(
            base["close_250"].notna() & (base["close_250"] > 0),
            (base["close"] / base["close_250"] - 1) * 100, np.nan
        )

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

        # RPS 计算: 5/10/20/120/250
        for n in [5, 10, 20]:
            s = base[["ts_code", f"ret{n}"]].dropna().sort_values(f"ret{n}", ascending=False).reset_index(drop=True)
            s["rank"] = s.index + 1
            s[f"rps{n}"] = (1 - s["rank"] / len(s)) * 100
            base = base.merge(s[["ts_code", f"rps{n}"]], on="ts_code", how="left")

        for n in [120, 250]:
            col = f"ret{n}"
            valid = base[["ts_code", col]].dropna()
            if not valid.empty:
                valid = valid.sort_values(col, ascending=False).reset_index(drop=True)
                valid["rank"] = valid.index + 1
                valid[f"rps{n}"] = (1 - valid["rank"] / len(valid)) * 100
                base = base.merge(valid[["ts_code", f"rps{n}"]], on="ts_code", how="left")
            else:
                base[f"rps{n}"] = np.nan

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

        # ── 多主线 + 星级评分 ──
        mainlines = self._build_mainlines(rec, trade_date, limit_up)

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
            "mainlines": mainlines,
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

    def _build_mainlines(self, rec: list[dict], trade_date: str, total_limit_up: int) -> list[dict[str, Any]]:
        """构建多主线 + 星级评分。
        评分维度:
          1. 板块内涨停数 (limitUpCount)  — 当日板块成分涨停占比
          2. 综合得分 (compositeScore)     — RPS+涨幅+活跃度综合分
          3. 资金活跃度 (amount/activity)  — 成交额大=大资金参与
        每个维度满分 1 星，合计最高 5 星（维度1权重 2 星，维度2 权重 1.5 星，维度3 权重 1.5 星）
        """
        if not rec:
            return []

        # 从 rec 中提取维度
        limit_ups = [r.get("limitUpCount", 0) for r in rec]
        composites = [r.get("compositeScore", 0) for r in rec]
        amounts = [r.get("amount", 0) for r in rec]

        # 如果 rec 没有 limitUpCount，尝试从 sector_rankings 获取
        if all(lu == 0 for lu in limit_ups):
            try:
                rankings = self.sector_rankings(trade_date)
                rank_map = {r["sectorCode"]: r.get("limitUpCount", 0) for r in rankings}
                limit_ups = [rank_map.get(r.get("sectorCode", ""), 0) for r in rec]
            except Exception:
                pass

        max_lu = max(limit_ups) if limit_ups and max(limit_ups) > 0 else 1
        max_comp = max(composites) if composites and max(composites) > 0 else 1
        max_amt = max(amounts) if amounts and max(amounts) > 0 else 1

        mainlines = []
        for i, r in enumerate(rec):
            lu = limit_ups[i]
            comp = composites[i]
            amt = amounts[i]

            # 维度1: 涨停数 → 0~2 星
            lu_star = (lu / max_lu) * 2.0 if max_lu > 0 else 0
            # 维度2: 综合分 → 0~1.5 星
            comp_star = (comp / max_comp) * 1.5 if max_comp > 0 else 0
            # 维度3: 资金量 → 0~1.5 星
            amt_star = (amt / max_amt) * 1.5 if max_amt > 0 else 0

            raw_stars = lu_star + comp_star + amt_star
            # 四舍五入到 0.5
            stars = round(raw_stars * 2) / 2
            stars = max(0.5, min(5.0, stars))

            status = "加强" if comp >= 75 else ("分歧" if comp >= 50 else "衰退")

            mainlines.append({
                "sectorCode": r.get("sectorCode", ""),
                "sectorName": r.get("sectorName", ""),
                "stars": stars,
                "status": status,
                "limitUpCount": lu,
                "compositeScore": round(comp, 2),
                "amount": round(amt, 2),
                "pctChange5d": r.get("pctChange5d", 0),
                "pctChange10d": r.get("pctChange10d", 0),
            })

        # 按星级降序排列
        mainlines.sort(key=lambda x: x["stars"], reverse=True)
        return mainlines

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

        # 查询 top4 板块的涨停个数
        snap = self.stock_snapshot(trade_date)
        limit_up_codes = set(snap[snap["pct_chg"] >= 9.8]["ts_code"].dropna().tolist()) if snap is not None else set()
        top_codes = df["ts_code"].tolist()
        limit_counts = self._batch_query_sector_limits(top_codes, trade_date, limit_up_codes)

        out: list[dict[str, Any]] = []
        for i, r in df.iterrows():
            code = r["ts_code"]
            out.append(
                {
                    "rank": i + 1,
                    "sectorCode": code,
                    "sectorName": r["sector_name"],
                    "compositeScore": round(float(r["composite"]), 2),
                    "rps10": round(float(r["rps10"]), 2),
                    "pctChange5d": round(float(r["ret5"]), 2),
                    "pctChange10d": round(float(r["ret10"]), 2),
                    "activityScore": round(float(r["activity_score"]), 2),
                    "envFitScore": round(float(r["env_fit_score"]), 2),
                    "amount": round(float(r["amount_est"]), 2),
                    "limitUpCount": limit_counts.get(code, 0),
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

        # ── 计算昨日排名，得出排名变化 ──
        prev_rank_map: dict[str, int] = {}
        try:
            dates = self.trade_dates(trade_date, need=5)
            prev_dates = [d for d in dates if d < trade_date]
            if prev_dates:
                prev_date = prev_dates[-1]
                prev_df = self.compute_sector_metrics(prev_date)
                if prev_df is not None and not prev_df.empty:
                    prev_df = prev_df[prev_df["amount_est"] >= self.rules.sector_amount_min].copy()
                    prev_df = prev_df.sort_values(sort_col, ascending=False).reset_index(drop=True)
                    for idx, row in prev_df.iterrows():
                        prev_rank_map[row["ts_code"]] = idx + 1
        except Exception as exc:
            logger.debug(f"昨日排名计算跳过: {exc}")

        # 计算板块涨停个数（基于当日涨停股与板块成分交集）
        snap = self.stock_snapshot(trade_date)
        limit_up_codes = set(snap[snap["pct_chg"] >= 9.8]["ts_code"].dropna().tolist()) if snap is not None else set()

        # 批量并发查询板块涨停数量
        top_codes = top_df.head(limit_count_scope)["ts_code"].tolist()
        limit_counts = self._batch_query_sector_limits(top_codes, trade_date, limit_up_codes)

        out: list[dict[str, Any]] = []
        for i, r in top_df.iterrows():
            code = r["ts_code"]
            today_rank = i + 1
            prev_rank = prev_rank_map.get(code)
            rank_change = (prev_rank - today_rank) if prev_rank is not None else None
            out.append(
                {
                    "rank": today_rank,
                    "rankChange": rank_change,
                    "prevRank": prev_rank,
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

    def _bull_camp_base(self, trade_date: str) -> list[dict[str, Any]]:
        def _load() -> list[dict[str, Any]]:
            """
            入营条件（用户定义）:
              1. 个股 RPS250 > 87 (250日相对强弱排名前13%)
              2. 属于当日主线板块
              3. 日成交额 ≥ 10亿
            """
            # 尝试最近几个交易日，避免周末/假日无数据
            dates_to_try = [trade_date]
            try:
                recent_dates = self.trade_dates(trade_date, need=10)
                dates_to_try = [d for d in reversed(recent_dates) if d <= trade_date][:5]
                if not dates_to_try:
                    dates_to_try = [trade_date]
            except Exception:
                pass

            stocks = None
            sectors = None
            actual_date = trade_date
            for d in dates_to_try:
                try:
                    s = self.compute_stock_metrics(d)
                    sec = self.compute_sector_metrics(d)
                    if s is not None and not s.empty and sec is not None and not sec.empty:
                        stocks = s
                        sectors = sec
                        actual_date = d
                        break
                except Exception as exc:
                    logger.debug(f"牛股集中营尝试日期 {d} 失败: {exc}")
                    continue

            if stocks is None or stocks.empty or sectors is None or sectors.empty:
                logger.warning(f"牛股集中营无数据，已尝试: {dates_to_try}")
                return []

            # ── 条件 1: RPS250 > 87，日成交额 ≥ 10亿 ──
            df = stocks.copy()
            # 如果 rps250 不存在或全 NaN，降级使用 rps120 或 rps20
            rps_col = "rps250"
            if rps_col not in df.columns or df[rps_col].dropna().empty:
                rps_col = "rps120" if ("rps120" in df.columns and not df["rps120"].dropna().empty) else "rps20"
                logger.info(f"牛股集中营: rps250 不可用，降级使用 {rps_col}")

            df = df[
                (df[rps_col] > 87)
                & (df["amount_yuan"] >= 1_000_000_000)
            ].copy()

            if df.empty:
                logger.info(f"牛股集中营: {rps_col}>87 且 amount>=10亿 过滤后无数据")
                return []

            # ── 条件 2: 属于主线板块 ──
            # 获取主线板块列表
            try:
                overview = self.market_overview(actual_date)
                mainlines = overview.get("mainlines", [])
            except Exception as exc:
                logger.warning(f"获取主线板块失败: {exc}")
                mainlines = []

            if not mainlines:
                # 主线为空时，用推荐板块替代
                try:
                    rec = self.recommend_top_sectors(actual_date, "", sectors)
                    mainlines = [{"sectorCode": r.get("sectorCode", ""), "sectorName": r.get("sectorName", "")} for r in rec[:10]]
                except Exception:
                    pass

            if not mainlines:
                logger.info("牛股集中营: 无主线板块数据")
                return []

            mainline_codes = {m["sectorCode"] for m in mainlines if m.get("sectorCode")}
            mainline_name_map = {m["sectorCode"]: m.get("sectorName", "") for m in mainlines}

            # 查询主线板块的成分股
            mainline_members: dict[str, dict[str, Any]] = {}  # ts_code → sector info
            for sector_code in mainline_codes:
                try:
                    if sector_code.endswith(".SI"):
                        members = self.pro.index_member(index_code=sector_code)
                        if members is None or members.empty:
                            continue
                        valid = members["out_date"].isna() | (members["out_date"] == "") | (members["out_date"] > actual_date)
                        codes = members[valid]["con_code"].dropna().unique().tolist()
                    else:
                        members = self.pro.ths_member(ts_code=sector_code)
                        if members is None or members.empty:
                            continue
                        codes = members["con_code"].dropna().unique().tolist()
                except Exception as exc:
                    logger.debug(f"读取主线板块成分失败: {sector_code}, 错误: {exc}")
                    continue

                for code in codes:
                    if code not in mainline_members:
                        mainline_members[code] = {
                            "sectorCode": sector_code,
                            "sectorName": mainline_name_map.get(sector_code, ""),
                        }

            if not mainline_members:
                logger.info("牛股集中营: 主线板块成分查询为空")
                return []

            # 只保留属于主线板块的股票
            df = df[df["ts_code"].isin(mainline_members.keys())].copy()
            if df.empty:
                logger.info("牛股集中营: RPS250>87 且在主线板块的股票为空")
                return []

            df["sectorCode"] = df["ts_code"].map(lambda c: mainline_members[c]["sectorCode"])
            df["sectorName"] = df["ts_code"].map(lambda c: mainline_members[c]["sectorName"])

            # ── 计算综合评分 ──
            def minmax(s: pd.Series) -> pd.Series:
                lo, hi = float(s.min()), float(s.max())
                if hi - lo < 1e-9:
                    return pd.Series(np.full(len(s), 50.0), index=s.index)
                return (s - lo) / (hi - lo) * 100

            df["rpsScore"] = minmax(df[rps_col])
            df["amountScore"] = minmax(df["amount_yuan"])
            df["retScore"] = minmax(df["ret20"].clip(lower=-50, upper=100)) if "ret20" in df.columns else 50.0
            df["campScore"] = df["rpsScore"] * 0.5 + df["amountScore"] * 0.2 + df["retScore"] * 0.3
            df = df.sort_values(["campScore", rps_col], ascending=False).reset_index(drop=True)

            out: list[dict[str, Any]] = []
            for _, row in df.iterrows():
                item: dict[str, Any] = {
                    "tsCode": str(row["ts_code"]),
                    "stockName": str(row["name"]),
                    "sectorCode": str(row["sectorCode"]),
                    "sectorName": str(row["sectorName"]),
                    "close": round(float(row["close"]), 2),
                    "pctChange1d": round(float(row["pct_chg"]), 2),
                    "pctChange5d": round(float(row["ret5"]), 2),
                    "pctChange10d": round(float(row["ret10"]), 2),
                    "rps5": round(float(row["rps5"]), 2) if pd.notna(row.get("rps5")) else 0,
                    "rps10": round(float(row["rps10"]), 2) if pd.notna(row.get("rps10")) else 0,
                    "rps20": round(float(row["rps20"]), 2) if pd.notna(row.get("rps20")) else 0,
                    "rps250": round(float(row[rps_col]), 2),
                    "amount": round(float(row["amount_yuan"]), 2),
                    "ma20": round(float(row["ma20"]), 2) if pd.notna(row.get("ma20")) else 0,
                    "campScore": round(float(row["campScore"]), 2),
                }
                out.append(item)
            return out

        return self._cached(f"bull_camp_base:{trade_date}", 900, _load)

    def _recent_announcement_codes(self, trade_date: str, days: int = 7) -> set[str]:
        def _load() -> set[str]:
            start_date = (pd.Timestamp(trade_date) - pd.Timedelta(days=max(days * 3, 10))).strftime("%Y%m%d")
            threshold = (pd.Timestamp(trade_date) - pd.Timedelta(days=max(days - 1, 0))).strftime("%Y%m%d")
            endpoints = ["anns_d", "anns"]
            for endpoint in endpoints:
                fn = getattr(self.pro, endpoint, None)
                if fn is None:
                    continue
                try:
                    df = fn(start_date=start_date, end_date=trade_date, fields="ts_code,ann_date")
                except Exception:
                    try:
                        df = fn(start_date=start_date, end_date=trade_date)
                    except Exception as exc:
                        logger.debug(f"公告接口调用失败: {endpoint}, 错误: {exc}")
                        continue
                if df is None or df.empty or "ts_code" not in df.columns:
                    continue
                date_col = None
                for candidate in ["ann_date", "pub_date", "trade_date"]:
                    if candidate in df.columns:
                        date_col = candidate
                        break
                if date_col is None:
                    return set(df["ts_code"].dropna().astype(str).unique().tolist())
                recent_df = df[df[date_col].astype(str) >= threshold]
                return set(recent_df["ts_code"].dropna().astype(str).unique().tolist())
            return set()

        return self._cached(f"recent_ann_codes:{trade_date}:{days}", 3600, _load)

    def bull_camp_history(self, trade_date: str, days: int = 20) -> list[dict[str, Any]]:
        safe_days = max(1, min(int(days), 60))

        def _load() -> list[dict[str, Any]]:
            dates = self.trade_dates(trade_date, need=safe_days + 10)
            history_dates = [d for d in dates if d <= trade_date][-safe_days:]
            history: list[dict[str, Any]] = []
            for d in history_dates:
                items = self._bull_camp_base(d)
                history.append(
                    {
                        "tradeDate": d,
                        "count": len(items),
                        "items": items,
                    }
                )
            return history

        return self._cached(f"bull_camp_history:{trade_date}:{safe_days}", 900, _load)

    def _bull_camp_streak_map(self, trade_date: str, lookback_days: int = 20) -> dict[str, int]:
        safe_days = max(1, min(int(lookback_days), 60))
        history = self.bull_camp_history(trade_date, days=safe_days)
        if not history:
            return {}
        date_items = [set(str(item.get("tsCode", "")) for item in day.get("items", [])) for day in history]
        if not date_items:
            return {}
        today_codes = date_items[-1]
        streak_map: dict[str, int] = {}
        for code in today_codes:
            streak = 0
            for codes in reversed(date_items):
                if code in codes:
                    streak += 1
                else:
                    break
            streak_map[code] = streak
        return streak_map

    def _bull_camp_score_history(self, trade_date: str, lookback_days: int = 5) -> dict[str, list[float | None]]:
        """从缓存的 bull_camp_history 中提取每只股票最近 N 天的 campScore，返回 {ts_code: [score_day1, ..., score_dayN]}"""
        history = self.bull_camp_history(trade_date, days=lookback_days)
        if not history:
            return {}
        # 先收集当日所有 ts_code
        today_items = history[-1].get("items", []) if history else []
        today_codes = {str(item.get("tsCode", "")) for item in today_items}
        # 构建 {ts_code: [score_per_day]}
        result: dict[str, list[float | None]] = {code: [] for code in today_codes}
        for day in history:
            day_map = {str(item.get("tsCode", "")): item.get("campScore") for item in day.get("items", [])}
            for code in today_codes:
                result[code].append(day_map.get(code))
        return result

    def _detect_patterns_batch(self, ts_codes: list[str], trade_date: str) -> dict[str, list[str]]:
        """批量检测形态，返回 {ts_code: [pattern_tags]}"""
        result: dict[str, list[str]] = {}
        dates = self.trade_dates(trade_date, need=280)
        start = dates[-270] if len(dates) >= 270 else dates[0]

        def _detect_one(ts_code: str) -> tuple[str, list[str]]:
            try:
                df = ts.pro_bar(
                    pro_api=self.pro,
                    ts_code=ts_code,
                    adj="qfq",
                    start_date=start,
                    end_date=trade_date,
                    asset="E",
                )
                if df is None or df.empty:
                    return ts_code, []
                tags = detect_all_patterns(df)
                return ts_code, tags
            except Exception as exc:
                logger.debug(f"形态检测失败 {ts_code}: {exc}")
                return ts_code, []

        # 并发检测（最多 4 线程，避免 Tushare 限频）
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(_detect_one, code): code for code in ts_codes}
            for future in as_completed(futures):
                try:
                    code, tags = future.result(timeout=30)
                    result[code] = tags
                except Exception:
                    pass

        return result

    def bull_camp(self, trade_date: str) -> list[dict[str, Any]]:
        def _load() -> list[dict[str, Any]]:
            base_items = self._bull_camp_base(trade_date)
            if not base_items:
                return []

            streak_map = self._bull_camp_streak_map(trade_date, lookback_days=20)
            ann_codes = self._recent_announcement_codes(trade_date, days=7)
            score_history_map = self._bull_camp_score_history(trade_date, lookback_days=5)

            # 形态检测
            ts_codes = [str(item.get("tsCode", "")) for item in base_items if item.get("tsCode")]
            try:
                pattern_map = self._detect_patterns_batch(ts_codes, trade_date)
            except Exception as exc:
                logger.warning(f"批量形态检测失败: {exc}")
                pattern_map = {}

            enriched: list[dict[str, Any]] = []
            for item in base_items:
                ts_code = str(item.get("tsCode", ""))
                days_in_camp = max(1, int(streak_map.get(ts_code, 1)))
                next_item = item.copy()
                next_item["daysInCamp"] = days_in_camp
                next_item["isNew"] = days_in_camp <= 1
                next_item["hasRecentAnnouncement"] = ts_code in ann_codes
                next_item["patternTags"] = pattern_map.get(ts_code, [])
                next_item["campScoreHistory"] = score_history_map.get(ts_code, [])
                enriched.append(next_item)
            return enriched

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
        # 优先查预计算库
        pre = self._precomputed.get_stock_rs(ts_code, trade_date)
        if pre:
            return pre
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

    def stock_rise_attribution(self, ts_code: str, trade_date: str) -> dict[str, Any]:
        """
        个股上涨归因分析 — 从基本面维度解释股价上涨的原因。

        归因维度:
          1. 板块驱动 — 所属板块是否为主线，板块涨幅/星级
          2. 业绩驱动 — 营收/净利润同比增速趋势
          3. 盈利质量 — ROE、毛利率变化趋势
          4. 估值修复 — 当前 PE/PB 分位（如有数据）
          5. 资金关注 — 成交额水平、RPS 排名
          6. 近期催化 — 最近的公告/新闻事件
        """
        # ── 优先查预计算库（<10ms）──
        pre = self._precomputed.get_stock_attribution(ts_code, trade_date)
        if pre:
            return pre

        def _load() -> dict[str, Any]:
            attribution: list[dict[str, Any]] = []  # [{dimension, label, detail, sentiment}]
            name = self.stock_name_map().get(ts_code, ts_code)

            # ── 1. 板块驱动 ──
            try:
                overview = self.market_overview(trade_date)
                mainlines = overview.get("mainlines", [])
                sector_info = self.stock_sector_lookup(ts_code, trade_date)
                sector_code = sector_info.get("sectorCode", "")
                sector_name = sector_info.get("sectorName", "")

                mainline_match = next((m for m in mainlines if m.get("sectorCode") == sector_code), None)
                if mainline_match:
                    stars = mainline_match.get("stars", 0)
                    pct5 = mainline_match.get("pctChange5d", 0)
                    status = mainline_match.get("status", "")
                    attribution.append({
                        "dimension": "sector",
                        "label": "主线板块",
                        "detail": f"属于{sector_name}（★{stars}，{status}），板块5日{pct5:+.1f}%",
                        "sentiment": "positive" if stars >= 3 else "neutral",
                    })
                elif sector_name:
                    attribution.append({
                        "dimension": "sector",
                        "label": "板块归属",
                        "detail": f"属于{sector_name}，非当日主线",
                        "sentiment": "neutral",
                    })
            except Exception as exc:
                logger.debug(f"板块归因失败: {ts_code}, {exc}")

            # ── 2. 业绩驱动 ──
            try:
                fin = self.stock_financials(ts_code, periods=8)
                periods = fin.get("periods", [])
                if periods:
                    # 最近有同比数据的季度
                    recent_with_yoy = [p for p in periods if p.get("revenueYoY") is not None][:4]
                    if recent_with_yoy:
                        latest = recent_with_yoy[0]
                        rev_yoy = latest.get("revenueYoY", 0)
                        ni_yoy = latest.get("netIncomeYoY")
                        end_date = latest.get("endDate", "")
                        q_label = f"{end_date[:4]}Q{int(end_date[4:6])//3 or 4}" if len(end_date) >= 6 else end_date

                        # 营收趋势
                        rev_trend = [p.get("revenueYoY") for p in recent_with_yoy if p.get("revenueYoY") is not None]
                        if rev_yoy > 20:
                            sentiment = "positive"
                            detail = f"{q_label}营收同比+{rev_yoy:.0f}%"
                        elif rev_yoy > 0:
                            sentiment = "neutral"
                            detail = f"{q_label}营收同比+{rev_yoy:.0f}%"
                        else:
                            sentiment = "negative"
                            detail = f"{q_label}营收同比{rev_yoy:.0f}%"

                        # 加速/减速判断
                        if len(rev_trend) >= 2:
                            if rev_trend[0] > rev_trend[1]:
                                detail += "（加速增长）"
                            elif rev_trend[0] < rev_trend[1] and rev_trend[0] > 0:
                                detail += "（增速放缓）"

                        attribution.append({
                            "dimension": "revenue",
                            "label": "营收增长",
                            "detail": detail,
                            "sentiment": sentiment,
                        })

                        # 净利润
                        if ni_yoy is not None:
                            ni_label = f"{q_label}净利润同比{ni_yoy:+.0f}%"
                            attribution.append({
                                "dimension": "profit",
                                "label": "利润增长",
                                "detail": ni_label,
                                "sentiment": "positive" if ni_yoy > 20 else ("neutral" if ni_yoy > 0 else "negative"),
                            })

                    # ── 3. 盈利质量 ──
                    latest_fin = periods[0]
                    roe = latest_fin.get("roe")
                    gm = latest_fin.get("grossMargin")
                    if roe is not None:
                        attribution.append({
                            "dimension": "roe",
                            "label": "ROE",
                            "detail": f"ROE {roe:.1f}%",
                            "sentiment": "positive" if roe > 15 else ("neutral" if roe > 8 else "negative"),
                        })
                    if gm is not None:
                        attribution.append({
                            "dimension": "margin",
                            "label": "毛利率",
                            "detail": f"毛利率 {gm:.1f}%",
                            "sentiment": "positive" if gm > 40 else ("neutral" if gm > 20 else "negative"),
                        })
            except Exception as exc:
                logger.debug(f"财务归因失败: {ts_code}, {exc}")

            # ── 5. 资金关注 ──
            try:
                stocks = self.compute_stock_metrics(trade_date)
                if stocks is not None and not stocks.empty:
                    row = stocks[stocks["ts_code"] == ts_code]
                    if not row.empty:
                        r = row.iloc[0]
                        rps20 = float(r.get("rps20", 0)) if pd.notna(r.get("rps20")) else 0
                        rps250_val = float(r.get("rps250", 0)) if pd.notna(r.get("rps250")) else None
                        amount = float(r.get("amount_yuan", 0))

                        rps_detail = f"RPS20={rps20:.0f}"
                        if rps250_val is not None:
                            rps_detail += f"，RPS250={rps250_val:.0f}"

                        attribution.append({
                            "dimension": "momentum",
                            "label": "动量排名",
                            "detail": rps_detail,
                            "sentiment": "positive" if rps20 > 80 else ("neutral" if rps20 > 50 else "negative"),
                        })

                        if amount > 0:
                            amt_yi = amount / 1e8
                            attribution.append({
                                "dimension": "volume",
                                "label": "成交额",
                                "detail": f"日成交{amt_yi:.1f}亿",
                                "sentiment": "positive" if amount >= 1e9 else "neutral",
                            })
            except Exception as exc:
                logger.debug(f"资金归因失败: {ts_code}, {exc}")

            # ── 6. 近期催化 ──
            try:
                news = self.stock_news(ts_code, trade_date, limit=3)
                if news:
                    titles = [n.get("title", "") for n in news[:3] if n.get("title")]
                    if titles:
                        attribution.append({
                            "dimension": "catalyst",
                            "label": "近期公告",
                            "detail": " | ".join(titles[:2]),
                            "sentiment": "neutral",
                        })
            except Exception as exc:
                logger.debug(f"新闻归因失败: {ts_code}, {exc}")

            return {
                "tsCode": ts_code,
                "stockName": name,
                "attribution": attribution,
            }

        return self._cached(f"rise_attr:{ts_code}:{trade_date}", 600, _load)

    def stock_sector_lookup(self, ts_code: str, trade_date: str) -> dict[str, str]:
        """查询个股所属的最强板块（RPS 最高的那个）"""
        def _load() -> dict[str, str]:
            try:
                sectors = self.compute_sector_metrics(trade_date)
                if sectors is None or sectors.empty:
                    return {"sectorCode": "", "sectorName": ""}
            except Exception:
                return {"sectorCode": "", "sectorName": ""}

            best: dict[str, str] = {"sectorCode": "", "sectorName": ""}
            best_rps = -999.0

            for _, row in sectors.iterrows():
                sector_code = str(row["ts_code"])
                try:
                    members = self.pro.ths_member(ts_code=sector_code)
                    if members is None or members.empty:
                        continue
                    codes = members["con_code"].dropna().unique().tolist()
                    if ts_code in codes:
                        rps = float(row.get("rps10", 0))
                        if rps > best_rps:
                            best_rps = rps
                            best = {
                                "sectorCode": sector_code,
                                "sectorName": str(row.get("sector_name", "")),
                            }
                except Exception:
                    continue
            return best

        return self._cached(f"stock_sector:{ts_code}:{trade_date}", 3600, _load)

    def stock_news(self, ts_code: str, trade_date: str, limit: int = 20) -> list[dict[str, Any]]:
        """获取个股最近的公告列表"""
        safe_limit = max(1, min(int(limit), 50))

        def _load() -> list[dict[str, Any]]:
            start_date = (pd.Timestamp(trade_date) - pd.Timedelta(days=90)).strftime("%Y%m%d")
            items: list[dict[str, Any]] = []

            # 尝试获取公告
            for endpoint in ["anns_d", "anns"]:
                fn = getattr(self.pro, endpoint, None)
                if fn is None:
                    continue
                try:
                    df = fn(
                        ts_code=ts_code,
                        start_date=start_date,
                        end_date=trade_date,
                    )
                except Exception as exc:
                    logger.debug(f"公告接口调用失败: {endpoint}, 错误: {exc}")
                    continue

                if df is None or df.empty:
                    continue

                # 根据实际列名适配
                date_col = None
                for c in ["ann_date", "pub_date", "trade_date"]:
                    if c in df.columns:
                        date_col = c
                        break

                title_col = None
                for c in ["title", "ann_title", "content"]:
                    if c in df.columns:
                        title_col = c
                        break

                if date_col:
                    df = df.sort_values(date_col, ascending=False)

                for _, row in df.head(safe_limit).iterrows():
                    item: dict[str, Any] = {
                        "date": str(row[date_col]) if date_col and pd.notna(row.get(date_col)) else "",
                        "title": str(row[title_col]) if title_col and pd.notna(row.get(title_col)) else "公告",
                    }
                    # 可选字段
                    if "url" in df.columns and pd.notna(row.get("url")):
                        item["url"] = str(row["url"])
                    items.append(item)

                if items:
                    break  # 有数据就不尝试下一个 endpoint

            return items

        return self._cached(f"stock_news:{ts_code}:{trade_date}:{safe_limit}", 1800, _load)

    def stock_tags(self, ts_code: str, trade_date: str) -> dict[str, Any]:
        """
        个股标签：概念题材 + 资金属性（游资/基金）+ 同题材关联股。
        优先从预计算库读（<10ms），fallback 到实时计算。

        返回:
          {
            tsCode, stockName,
            concepts: [{code, name, rps10}],      # 所属概念板块（按 RPS 排序）
            capitalType: "游资主导" | "基金重仓" | "混合" | "未知",
            capitalDetail: str,                     # 判断依据说明
            relatedStocks: [{tsCode, name, ret5}],  # 同题材强势关联股
          }
        """
        # ── 优先查预计算库（<10ms）──
        pre = self._precomputed.get_stock_tags(ts_code, trade_date)
        if pre:
            return pre

        def _load() -> dict[str, Any]:
            name = self.stock_name_map().get(ts_code, ts_code)
            result: dict[str, Any] = {
                "tsCode": ts_code,
                "stockName": name,
                "concepts": [],
                "capitalType": "未知",
                "capitalDetail": "",
                "relatedStocks": [],
            }

            # ── 1. 所属概念题材 ──
            try:
                sectors = self.compute_sector_metrics(trade_date)
                if sectors is not None and not sectors.empty:
                    matched_sectors: list[dict] = []
                    for _, row in sectors.iterrows():
                        sector_code = str(row["ts_code"])
                        try:
                            members = self.pro.ths_member(ts_code=sector_code)
                            if members is None or members.empty:
                                continue
                            codes = members["con_code"].dropna().unique().tolist()
                            if ts_code in codes:
                                matched_sectors.append({
                                    "code": sector_code,
                                    "name": str(row.get("sector_name", "")),
                                    "rps10": round(float(row.get("rps10", 0)), 1),
                                    "ret5": round(float(row.get("ret5", 0)), 1),
                                    "_members": codes,  # 暂存，用于关联股
                                })
                        except Exception:
                            continue

                    # 按 RPS 排序，取前 8 个概念
                    matched_sectors.sort(key=lambda x: x["rps10"], reverse=True)
                    top_concepts = matched_sectors[:8]
                    result["concepts"] = [
                        {"code": c["code"], "name": c["name"], "rps10": c["rps10"]}
                        for c in top_concepts
                    ]

                    # ── 3. 关联股票（从最强概念板块中提取同题材强势股）──
                    if top_concepts:
                        best_concept = top_concepts[0]
                        peer_codes = [c for c in best_concept["_members"] if c != ts_code]
                        # 获取这些股票的指标
                        try:
                            stock_metrics = self.compute_stock_metrics(trade_date)
                            if stock_metrics is not None and not stock_metrics.empty:
                                peers = stock_metrics[stock_metrics["ts_code"].isin(peer_codes)].copy()
                                if not peers.empty:
                                    peers = peers.sort_values("ret5", ascending=False).head(8)
                                    name_map = self.stock_name_map()
                                    result["relatedStocks"] = [
                                        {
                                            "tsCode": str(r["ts_code"]),
                                            "name": name_map.get(str(r["ts_code"]), str(r["ts_code"])),
                                            "ret5": round(float(r.get("ret5", 0)), 1),
                                            "pctChg": round(float(r.get("pct_chg", 0)), 2),
                                            "concept": best_concept["name"],
                                        }
                                        for _, r in peers.iterrows()
                                    ]
                        except Exception as exc:
                            logger.debug(f"关联股查询失败: {exc}")
            except Exception as exc:
                logger.debug(f"概念题材查询失败: {ts_code}, {exc}")

            # ── 2. 资金属性（游资 vs 基金）──
            try:
                capital_signals: list[str] = []
                fund_score = 0  # 正分=基金，负分=游资

                # (a) 龙虎榜检查 — 近30天是否上过龙虎榜
                start_dt = (pd.Timestamp(trade_date) - pd.Timedelta(days=60)).strftime("%Y%m%d")
                try:
                    top_df = self.pro.top_list(
                        ts_code=ts_code,
                        start_date=start_dt,
                        end_date=trade_date,
                    )
                    if top_df is not None and not top_df.empty:
                        capital_signals.append(f"近期{len(top_df)}次登龙虎榜")
                        fund_score -= 2  # 龙虎榜偏游资

                        # 检查机构席位
                        try:
                            top_inst_df = self.pro.top_inst(
                                ts_code=ts_code,
                                start_date=start_dt,
                                end_date=trade_date,
                            )
                            if top_inst_df is not None and not top_inst_df.empty:
                                # 有机构专用席位
                                inst_rows = top_inst_df[
                                    top_inst_df["exalter"].fillna("").str.contains("机构|基金", regex=True)
                                ] if "exalter" in top_inst_df.columns else pd.DataFrame()
                                if not inst_rows.empty:
                                    net_buy = inst_rows["buy"].sum() - inst_rows["sell"].sum() if {"buy", "sell"}.issubset(inst_rows.columns) else 0
                                    if net_buy > 0:
                                        capital_signals.append("机构席位净买入")
                                        fund_score += 3
                                    else:
                                        capital_signals.append("机构席位净卖出")
                                        fund_score -= 1
                                # 知名游资席位
                                hot_money_kw = ["华鑫", "东方财富", "国金", "天风", "国泰君安"]
                                if "exalter" in top_inst_df.columns:
                                    hot_rows = top_inst_df[
                                        top_inst_df["exalter"].fillna("").str.contains("|".join(hot_money_kw), regex=True)
                                    ]
                                    if not hot_rows.empty:
                                        capital_signals.append("知名游资席位活跃")
                                        fund_score -= 2
                        except Exception:
                            pass
                except Exception:
                    pass

                # (b) 基金重仓检查 — 最近的十大流通股东
                try:
                    holder_df = self.pro.top10_floatholders(
                        ts_code=ts_code,
                        start_date=(pd.Timestamp(trade_date) - pd.Timedelta(days=180)).strftime("%Y%m%d"),
                        end_date=trade_date,
                    )
                    if holder_df is not None and not holder_df.empty:
                        # 统计基金/机构持股比例
                        if "holder_name" in holder_df.columns:
                            latest_date = holder_df["end_date"].max() if "end_date" in holder_df.columns else None
                            if latest_date:
                                latest = holder_df[holder_df["end_date"] == latest_date]
                            else:
                                latest = holder_df.head(10)
                            fund_holders = latest[
                                latest["holder_name"].fillna("").str.contains(
                                    "基金|社保|保险|QFII|证金|汇金|养老", regex=True
                                )
                            ]
                            fund_count = len(fund_holders)
                            total_count = len(latest)
                            if fund_count >= 4:
                                capital_signals.append(f"十大流通股东中{fund_count}家机构/基金")
                                fund_score += 4
                            elif fund_count >= 2:
                                capital_signals.append(f"十大流通股东中{fund_count}家机构/基金")
                                fund_score += 2
                            elif fund_count == 0 and total_count > 0:
                                capital_signals.append("十大流通股东无机构/基金")
                                fund_score -= 2
                except Exception:
                    pass

                # (c) 成交额 + 换手率特征
                try:
                    stock_metrics = self.compute_stock_metrics(trade_date)
                    if stock_metrics is not None and not stock_metrics.empty:
                        row = stock_metrics[stock_metrics["ts_code"] == ts_code]
                        if not row.empty:
                            amt = float(row.iloc[0].get("amount", 0))
                            # 小盘高换手偏游资
                            if amt < 5e5:  # 成交额 < 5亿
                                capital_signals.append("小盘特征")
                                fund_score -= 1
                            elif amt > 2e6:  # 成交额 > 20亿
                                capital_signals.append("大盘特征")
                                fund_score += 1
                except Exception:
                    pass

                # 综合判断
                if fund_score >= 3:
                    result["capitalType"] = "基金重仓"
                elif fund_score <= -3:
                    result["capitalType"] = "游资主导"
                elif capital_signals:
                    result["capitalType"] = "混合"
                else:
                    result["capitalType"] = "未知"

                result["capitalDetail"] = "；".join(capital_signals) if capital_signals else "暂无数据"

            except Exception as exc:
                logger.debug(f"资金属性分析失败: {ts_code}, {exc}")

            return result

        return self._cached(f"stock_tags:{ts_code}:{trade_date}", 1800, _load)
