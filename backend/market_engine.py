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
        self._stock_sector_map: dict[str, dict[str, str]] = {}  # {ts_code: {sectorCode, sectorName}}
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
            lookback_days = max(220, int(need * 2.4))
            try:
                cal = self.pro.trade_cal(
                    exchange="SSE",
                    start_date=(pd.Timestamp(end_date) - pd.Timedelta(days=lookback_days)).strftime("%Y%m%d"),
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
        return self._cached(f"stock_metrics::{trade_date}", 300, lambda: self._compute_stock_metrics(trade_date))

    def _compute_stock_metrics(self, trade_date: str) -> pd.DataFrame:
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
        s["ret1"] = s["pct_change"] if "pct_change" in s.columns else 0.0
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
        sort_col = {"1d": "ret1", "5d": "ret5", "10d": "ret10", "rps": "rps10", "rps10": "rps10"}.get(sort_by, "rps10")
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
                    "pctChange1d": round(float(r.get("ret1", 0)), 2),
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

        sort_col = {"1d": "pct_chg", "5d": "ret5", "10d": "ret10", "rps": "rps20", "rps10": "rps10"}.get(sort_by, "rps20")
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

    def search_market(self, query: str, trade_date: str, limit: int = 12) -> dict[str, list[dict[str, Any]]]:
        keyword = str(query or "").strip()
        if not keyword:
            return {"stocks": [], "sectors": []}

        safe_limit = max(1, min(int(limit), 50))
        lower = keyword.lower()

        # 板块搜索：直接从内存缓存匹配板块名，不走 sector_rankings 的重计算
        sectors: list[dict[str, Any]] = []
        try:
            _, sector_names = self._ensure_ths_member_cache()
            matched_sectors = [
                (code, name) for code, name in sector_names.items()
                if lower in name.lower() or lower in code.lower()
            ]
            # 按 RPS 排序（如果已缓存则用，否则跳过）
            sector_rps: dict[str, float] = {}
            rps_cached = self._cache.get(f"sector_metrics::{trade_date}")
            if rps_cached and rps_cached[1] is not None:
                try:
                    sdf = rps_cached[1]
                    for _, r in sdf.iterrows():
                        sector_rps[str(r["ts_code"])] = float(r.get("rps10", 0))
                except Exception:
                    pass
            matched_sectors.sort(key=lambda x: sector_rps.get(x[0], 0), reverse=True)
            for code, name in matched_sectors[:safe_limit]:
                sectors.append({
                    "type": "sector",
                    "sectorCode": code,
                    "sectorName": name,
                    "rps10": sector_rps.get(code),
                    "pctChange5d": None,
                })
        except Exception:
            pass

        # 股票搜索：优先走预计算快照（毫秒级），降级到实时计算
        stocks: list[dict[str, Any]] = []
        precomputed = self._precomputed.get_search_snapshot(trade_date)

        if precomputed:
            # 预计算路径：纯内存匹配，零计算零网络
            matches = [
                s for s in precomputed
                if lower in s.get("stockName", "").lower() or lower in s.get("tsCode", "").lower()
            ]
            # 按前缀匹配 + rps20 + 成交额排序
            matches.sort(
                key=lambda s: (
                    s.get("stockName", "").lower().startswith(lower) or s.get("tsCode", "").lower().startswith(lower),
                    s.get("rps20", 0),
                    s.get("amount", 0),
                ),
                reverse=True,
            )
            for s in matches[:safe_limit]:
                stocks.append({
                    "type": "stock",
                    "tsCode": s["tsCode"],
                    "stockName": s["stockName"],
                    "sectorCode": s.get("sectorCode", ""),
                    "sectorName": s.get("sectorName", ""),
                    "close": s.get("close", 0),
                    "pctChange1d": s.get("pctChange1d", 0),
                    "pctChange5d": s.get("pctChange5d", 0),
                    "pctChange10d": s.get("pctChange10d", 0),
                    "rps20": s.get("rps20", 0),
                    "amount": s.get("amount", 0),
                })
        else:
            # 降级路径：实时计算（首次或预计算未完成时）
            try:
                snapshot = self.compute_stock_metrics(trade_date)
            except Exception as exc:
                logger.warning(f"搜索股票时计算快照失败: {exc}")
                snapshot = pd.DataFrame()

            if snapshot is not None and not snapshot.empty:
                sector_map = self._get_stock_sector_map(trade_date)

                df = snapshot.copy()
                df["name"] = df["name"].fillna(df["ts_code"]).astype(str)
                df["ts_code"] = df["ts_code"].astype(str)
                mask = df["name"].str.lower().str.contains(lower, na=False) | df["ts_code"].str.lower().str.contains(lower, na=False)
                matches_df = df.loc[mask].copy()

                if not matches_df.empty:
                    matches_df["_starts"] = matches_df["name"].str.lower().str.startswith(lower) | matches_df["ts_code"].str.lower().str.startswith(lower)
                    matches_df = matches_df.sort_values(by=["_starts", "rps20", "amount_yuan"], ascending=[False, False, False]).head(safe_limit)

                    for _, row in matches_df.iterrows():
                        ts_code = str(row.get("ts_code", ""))
                        sector = sector_map.get(ts_code, {"sectorCode": "", "sectorName": ""})
                        stocks.append({
                            "type": "stock",
                            "tsCode": ts_code,
                            "stockName": str(row.get("name", ts_code)),
                            "sectorCode": sector.get("sectorCode", ""),
                            "sectorName": sector.get("sectorName", ""),
                            "close": round(float(row.get("close", 0) or 0), 2),
                            "pctChange1d": round(float(row.get("pct_chg", 0) or 0), 2),
                            "pctChange5d": round(float(row.get("ret5", 0) or 0), 2),
                            "pctChange10d": round(float(row.get("ret10", 0) or 0), 2),
                            "rps20": round(float(row.get("rps20", 0) or 0), 1),
                            "amount": round(float(row.get("amount_yuan", 0) or 0), 2),
                        })

        return {"stocks": stocks[:safe_limit], "sectors": sectors[:safe_limit]}

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

    def hh_scan(self, trade_date: str) -> dict[str, Any]:
        """扫描牛股集中营中的HH（更高高点）买入信号，按板块分组"""
        def _load() -> dict[str, Any]:
            # 获取牛股集中营的股票列表
            bull_items = self.bull_camp(trade_date)
            if not bull_items:
                return {
                    "tradeDate": trade_date,
                    "totalSignals": 0,
                    "sectors": []
                }

            # 获取股票列表和交易日期信息
            ts_codes = [str(item.get("tsCode", "")) for item in bull_items if item.get("tsCode")]
            if not ts_codes:
                return {
                    "tradeDate": trade_date,
                    "totalSignals": 0,
                    "sectors": []
                }

            # 获取K线数据和HH信号检测
            dates = self.trade_dates(trade_date, need=260)
            start = dates[-250] if len(dates) >= 250 else dates[0]

            def _detect_hh_one(ts_code: str) -> tuple[str, list[dict[str, Any]]]:
                """检测单个股票的HH信号"""
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

                    # 检测HH信号
                    from pattern_detector import detect_hh_signals
                    hh_result = detect_hh_signals(df)
                    signals = hh_result.get("signals", [])

                    # 过滤最近10个交易日内的信号
                    recent_signals = []
                    if signals and len(df) > 0:
                        recent_dates = df["trade_date"].tail(10).tolist() if "trade_date" in df.columns else []
                        for sig in signals:
                            sig_date = sig.get("date")
                            if sig_date and sig_date in recent_dates:
                                recent_signals.append(sig)

                    return ts_code, recent_signals
                except Exception as exc:
                    logger.debug(f"HH信号检测失败 {ts_code}: {exc}")
                    return ts_code, []

            # 并发检测（最多4线程）
            hh_map: dict[str, list[dict[str, Any]]] = {}
            with ThreadPoolExecutor(max_workers=4) as pool:
                futures = {pool.submit(_detect_hh_one, code): code for code in ts_codes}
                for future in as_completed(futures):
                    try:
                        code, signals = future.result(timeout=30)
                        if signals:
                            hh_map[code] = signals
                    except Exception:
                        pass

            # 构建结果，按板块分组
            sector_groups: dict[str, dict[str, Any]] = {}

            for item in bull_items:
                ts_code = str(item.get("tsCode", ""))
                if ts_code not in hh_map or not hh_map[ts_code]:
                    continue

                # 获取股票的板块信息
                sector_info = self.stock_sector_lookup(ts_code, trade_date)
                sector_code = sector_info.get("sectorCode", "")
                sector_name = sector_info.get("sectorName", "")

                if not sector_code:
                    sector_code = "未分类"
                    sector_name = "未分类"

                if sector_code not in sector_groups:
                    sector_groups[sector_code] = {
                        "sectorCode": sector_code,
                        "sectorName": sector_name,
                        "stocks": []
                    }

                # 为每个信号添加股票和板块信息
                for sig in hh_map[ts_code]:
                    stock_data = {
                        "tsCode": ts_code,
                        "stockName": item.get("stockName", ""),
                        "close": item.get("close", 0),
                        "pctChange1d": item.get("pctChange1d", 0),
                        "pctChange5d": item.get("pctChange5d", 0),
                        "rps20": item.get("rps20", 0),
                        "campScore": item.get("campScore", 0),
                        "amount": item.get("amount", 0),
                        "signalDate": sig.get("date", ""),
                        "signalType": sig.get("type", ""),
                        "signalPrice": sig.get("price", 0),
                    }
                    sector_groups[sector_code]["stocks"].append(stock_data)

            # 构建最终响应
            result_sectors = []
            for sector_code, sector_data in sector_groups.items():
                # 按campScore降序排序
                stocks = sorted(
                    sector_data["stocks"],
                    key=lambda x: x.get("campScore", 0),
                    reverse=True
                )
                result_sectors.append({
                    "sectorCode": sector_data["sectorCode"],
                    "sectorName": sector_data["sectorName"],
                    "signalCount": len(stocks),
                    "stocks": stocks
                })

            # 按signalCount降序排序
            result_sectors.sort(key=lambda x: x["signalCount"], reverse=True)

            total_signals = sum(len(sector["stocks"]) for sector in result_sectors)

            return {
                "tradeDate": trade_date,
                "totalSignals": total_signals,
                "sectors": result_sectors
            }

        return self._cached(f"hh_scan:{trade_date}", 900, _load)

    def double_bottom_scan(self, trade_date: str) -> dict[str, Any]:
        """扫描全市场双底（W底）形态，按板块分组返回"""
        def _load() -> dict[str, Any]:
            from pattern_detector import detect_feng_signals

            # 获取当日有成交的股票快照
            snapshot = self.compute_stock_metrics(trade_date)
            if snapshot is None or snapshot.empty:
                return {"tradeDate": trade_date, "totalSignals": 0, "sectors": []}

            df = snapshot.copy()
            df["name"] = df["name"].fillna(df["ts_code"]).astype(str)
            df["ts_code"] = df["ts_code"].astype(str)
            # 只扫描成交额 >= 3 亿的股票（减少噪音）
            df = df[df["amount_yuan"] >= 3_0000_0000]
            # 按 RPS20 降序，优先扫描强势股
            df = df.sort_values("rps20", ascending=False)

            ts_codes = df["ts_code"].tolist()
            if not ts_codes:
                return {"tradeDate": trade_date, "totalSignals": 0, "sectors": []}

            dates = self.trade_dates(trade_date, need=260)
            start = dates[-120] if len(dates) >= 120 else dates[0]

            # 快照中名字和成交额的映射
            name_map = dict(zip(df["ts_code"], df["name"]))
            close_map = dict(zip(df["ts_code"], df["close"]))
            pct1d_map = dict(zip(df["ts_code"], df["pct_chg"]))
            amount_map = dict(zip(df["ts_code"], df["amount_yuan"]))

            # 计算 5 日涨幅
            ret5_map: dict[str, float] = {}
            if "ret5" in df.columns:
                ret5_map = dict(zip(df["ts_code"], df["ret5"].astype(float)))

            rps20_map: dict[str, float] = {}
            if "rps20" in df.columns:
                rps20_map = dict(zip(df["ts_code"], df["rps20"].astype(float)))

            def _scan_one(ts_code: str) -> dict[str, Any] | None:
                try:
                    kdf = ts.pro_bar(
                        pro_api=self.pro,
                        ts_code=ts_code,
                        adj="qfq",
                        start_date=start,
                        end_date=trade_date,
                        asset="E",
                    )
                    if kdf is None or len(kdf) < 30:
                        return None

                    result = detect_feng_signals(kdf)
                    buy_signals = result.get("buySignals", [])
                    signals = result.get("signals", [])

                    # 必须有 W 底信号（h2_w 类型）或买入信号
                    w_signals = [s for s in signals if s.get("type") == "h2_w"]
                    if not w_signals and not buy_signals:
                        return None

                    # 取最近的 W 底信号
                    latest_w = w_signals[-1] if w_signals else None
                    latest_buy = buy_signals[-1] if buy_signals else None

                    signal_date = ""
                    signal_type = "W底"
                    signal_price = 0.0
                    stop_loss = None
                    take_profit = None

                    if latest_buy:
                        signal_date = latest_buy.get("date", "")
                        signal_price = latest_buy.get("price", 0)
                        stop_loss = latest_buy.get("stopLoss")
                        take_profit = latest_buy.get("takeProfit")
                    elif latest_w:
                        signal_date = latest_w.get("date", "")
                        signal_price = latest_w.get("price", 0)

                    if not signal_date:
                        return None

                    return {
                        "tsCode": ts_code,
                        "stockName": name_map.get(ts_code, ts_code),
                        "close": float(close_map.get(ts_code, 0)),
                        "pctChange1d": float(pct1d_map.get(ts_code, 0)),
                        "pctChange5d": float(ret5_map.get(ts_code, 0)),
                        "rps20": float(rps20_map.get(ts_code, 0)),
                        "amount": float(amount_map.get(ts_code, 0)),
                        "signalDate": signal_date,
                        "signalType": signal_type,
                        "signalPrice": round(signal_price, 2),
                        "stopLoss": stop_loss,
                        "takeProfit": take_profit,
                        "signalCount": len(w_signals),
                    }
                except Exception as exc:
                    logger.debug(f"双底扫描失败 {ts_code}: {exc}")
                    return None

            # 并发扫描（最多 6 线程）
            found_stocks: list[dict[str, Any]] = []
            with ThreadPoolExecutor(max_workers=6) as pool:
                futures = {pool.submit(_scan_one, code): code for code in ts_codes}
                for future in as_completed(futures):
                    try:
                        result = future.result(timeout=30)
                        if result:
                            found_stocks.append(result)
                    except Exception:
                        pass

            if not found_stocks:
                return {"tradeDate": trade_date, "totalSignals": 0, "sectors": []}

            # 按板块分组
            sector_groups: dict[str, dict[str, Any]] = {}
            for stock in found_stocks:
                sector_info = self.stock_sector_lookup(stock["tsCode"], trade_date)
                sector_code = sector_info.get("sectorCode", "") or "未分类"
                sector_name = sector_info.get("sectorName", "") or "未分类"

                if sector_code not in sector_groups:
                    sector_groups[sector_code] = {
                        "sectorCode": sector_code,
                        "sectorName": sector_name,
                        "stocks": [],
                    }
                sector_groups[sector_code]["stocks"].append(stock)

            # 排序：板块内按 signalCount 降序，板块间按信号数降序
            result_sectors = []
            for sector_data in sector_groups.values():
                stocks = sorted(sector_data["stocks"], key=lambda x: x.get("signalCount", 0), reverse=True)
                result_sectors.append({
                    "sectorCode": sector_data["sectorCode"],
                    "sectorName": sector_data["sectorName"],
                    "signalCount": len(stocks),
                    "stocks": stocks,
                })
            result_sectors.sort(key=lambda x: x["signalCount"], reverse=True)

            total = sum(s["signalCount"] for s in result_sectors)
            return {"tradeDate": trade_date, "totalSignals": total, "sectors": result_sectors}

        return self._cached(f"double_bottom_scan:{trade_date}", 600, _load)

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

    def _ensure_ths_member_cache(self) -> tuple[dict[str, list[str]], dict[str, str]]:
        """确保同花顺概念板块成分股映射已缓存到 SQLite，返回 (sector→[stocks], sector→name)"""
        # 先查内存缓存
        cached = self._cache.get("_ths_members")
        if cached and time.time() - cached[0] < 86400:  # 24 小时
            return cached[1]

        # 查 SQLite
        stored = self._data_store.get_json("ths_members", "all", max_age_hours=24)
        if stored:
            mapping = stored["mapping"]  # {sector_code: [stock_codes]}
            names = stored["names"]      # {sector_code: name}
            result = (mapping, names)
            self._cache["_ths_members"] = (time.time(), result)
            logger.info(f"同花顺成分股映射从缓存加载: {len(mapping)} 个板块")
            return result

        # 全量拉取
        logger.info("拉取同花顺概念板块成分股映射（首次约 55 秒）...")
        names: dict[str, str] = {}
        for idx_type in ["N", "I", "S", "R"]:  # 概念、行业、风格、地域
            try:
                idx = self.pro.ths_index(exchange="A", type=idx_type)
                if idx is not None and not idx.empty:
                    names.update(dict(zip(idx["ts_code"], idx["name"])))
            except Exception:
                pass
        logger.info(f"同花顺板块名称: {len(names)} 个")

        frames = []
        offset = 0
        while True:
            try:
                df = self.pro.ths_member(offset=offset, limit=6000)
            except Exception:
                break
            if df is None or df.empty:
                break
            frames.append(df)
            offset += len(df)
            if len(df) < 6000:
                break

        mapping: dict[str, list[str]] = {}
        if frames:
            all_df = pd.concat(frames, ignore_index=True)
            for sector_code, group in all_df.groupby("ts_code"):
                mapping[str(sector_code)] = group["con_code"].dropna().unique().tolist()
            logger.info(f"同花顺成分股映射拉取完成: {len(mapping)} 个板块, {len(all_df)} 行")

        # 存入 SQLite
        self._data_store.set_json("ths_members", "all", {"mapping": mapping, "names": names})
        result = (mapping, names)
        self._cache["_ths_members"] = (time.time(), result)
        return result

    def _get_stock_sector_map(self, trade_date: str) -> dict[str, dict[str, str]]:
        """构建 stock→sector 反向映射（基于板块 RPS 选最强板块），缓存到内存"""
        cache_key = f"_stock_sector_map:{trade_date}"
        cached = self._cache.get(cache_key)
        if cached and time.time() - cached[0] < 3600:
            return cached[1]

        mapping, names = self._ensure_ths_member_cache()

        # 计算每个板块的 RPS10，用于选最强板块
        sector_rps: dict[str, float] = {}
        try:
            sector_df = self.compute_sector_metrics(trade_date)
            if sector_df is not None and not sector_df.empty:
                for _, row in sector_df.iterrows():
                    sector_rps[str(row["ts_code"])] = float(row.get("rps10", 0))
        except Exception:
            pass

        # 反转：stock → (sectorCode, sectorName, rps10)
        stock_best: dict[str, dict[str, str]] = {}
        for sector_code, stock_codes in mapping.items():
            rps = sector_rps.get(sector_code, 0)
            sector_name = names.get(sector_code, "")
            for ts_code in stock_codes:
                existing = stock_best.get(ts_code)
                if existing is None or rps > float(existing.get("_rps", 0)):
                    stock_best[ts_code] = {
                        "sectorCode": sector_code,
                        "sectorName": sector_name,
                        "_rps": str(rps),
                    }

        # 清理内部字段
        result = {
            k: {"sectorCode": v["sectorCode"], "sectorName": v["sectorName"]}
            for k, v in stock_best.items()
        }
        self._cache[cache_key] = (time.time(), result)
        logger.info(f"stock→sector 反向映射构建完成: {len(result)} 只股票")
        return result

    def _fetch_all_realtime_quotes(self) -> dict[str, float]:
        """新浪 API 并发拉全市场实时涨跌幅，返回 {ts_code: pct_change}，缓存 30 秒"""
        cached = self._cache.get("_all_realtime")
        if cached and time.time() - cached[0] < 30:
            return cached[1]

        import ssl
        import urllib.request
        from concurrent.futures import ThreadPoolExecutor

        # 从成分股映射中提取所有股票代码（不依赖 Tushare stock_basic）
        mapping, _ = self._ensure_ths_member_cache()
        code_set: set[str] = set()
        for codes in mapping.values():
            code_set.update(codes)
        if not code_set:
            # fallback: 尝试 Tushare
            try:
                basic = self.pro.stock_basic(exchange="", list_status="L", fields="ts_code")
                code_set = set(basic["ts_code"].tolist())
            except Exception:
                pass
        all_codes = list(code_set)

        sina_codes: list[str] = []
        code_map: dict[str, str] = {}
        for tc in all_codes:
            parts = tc.split(".")
            pure, suffix = parts[0], (parts[1] if len(parts) > 1 else "")
            prefix = "sh" if suffix == "SH" else "sz"
            sc = prefix + pure
            sina_codes.append(sc)
            code_map[sc] = tc

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        def _fetch_batch(batch: list[str]) -> str:
            url = f"https://hq.sinajs.cn/list={','.join(batch)}"
            req = urllib.request.Request(url, headers={"Referer": "https://finance.sina.com.cn"})
            try:
                return urllib.request.urlopen(req, timeout=10, context=ctx).read().decode("gb2312", errors="replace")
            except Exception:
                return ""

        batches = [sina_codes[i:i + 80] for i in range(0, len(sina_codes), 80)]
        result: dict[str, float] = {}

        with ThreadPoolExecutor(max_workers=15) as pool:
            raw_list = list(pool.map(_fetch_batch, batches))

        for raw in raw_list:
            for line in raw.strip().split("\n"):
                if "=" not in line or '"' not in line:
                    continue
                sina_code = line.split("=")[0].split("_")[-1]
                fields = line.split('"')[1].split(",")
                if len(fields) < 4:
                    continue
                try:
                    price = float(fields[3])
                    prev_close = float(fields[2])
                except (ValueError, IndexError):
                    continue
                if price <= 0 or prev_close <= 0:
                    continue
                ts_code = code_map.get(sina_code)
                if ts_code:
                    result[ts_code] = round((price - prev_close) / prev_close * 100, 2)

        self._cache["_all_realtime"] = (time.time(), result)
        logger.info(f"全市场实时行情: {len(result)} 只股票")
        return result

    def intraday_sector_rankings(self, trade_date: str) -> dict[str, Any]:
        """同花顺概念板块实时涨跌排行（盘中观察用）"""
        def _load():
            mapping, names = self._ensure_ths_member_cache()
            if not mapping:
                return {"tradeDate": trade_date, "items": []}

            quotes = self._fetch_all_realtime_quotes()
            if not quotes:
                return {"tradeDate": trade_date, "items": []}

            # 聚合：每个板块的成分股平均涨跌幅
            sectors: list[dict[str, Any]] = []
            for sector_code, stock_codes in mapping.items():
                name = names.get(sector_code)
                if not name:
                    continue  # 跳过没有名称的板块
                pcts = [quotes[c] for c in stock_codes if c in quotes]
                if len(pcts) < self.rules.intraday_sector_min_stocks:
                    continue
                avg_pct = sum(pcts) / len(pcts)
                up_count = sum(1 for p in pcts if p > 0)
                sectors.append({
                    "sectorCode": sector_code,
                    "sectorName": name,
                    "pctChange1d": round(avg_pct, 2),
                    "stockCount": len(pcts),
                    "upCount": up_count,
                    "downCount": len(pcts) - up_count,
                })

            sectors.sort(key=lambda x: x["pctChange1d"], reverse=True)
            items = []
            for i, s in enumerate(sectors):
                items.append({
                    "rank": i + 1,
                    "rankChange": None,
                    "prevRank": None,
                    "sectorCode": s["sectorCode"],
                    "sectorName": s["sectorName"],
                    "pctChange1d": s["pctChange1d"],
                    "pctChange5d": 0,
                    "pctChange10d": 0,
                    "rps10": 0,
                    "amount": s["stockCount"],
                    "limitUpCount": s["upCount"],
                })
            return {"tradeDate": trade_date, "items": items}

        return self._cached(f"intraday_sectors:{trade_date}", 30, _load)

    def intraday_sector_stocks(self, sector_code: str, trade_date: str) -> list[dict[str, Any]]:
        """同花顺概念板块成分股 + 实时行情"""
        def _load():
            mapping, _ = self._ensure_ths_member_cache()
            stock_codes = mapping.get(sector_code, [])
            if not stock_codes:
                # fallback: 单独查
                try:
                    members = self.pro.ths_member(ts_code=sector_code)
                    if members is not None and not members.empty:
                        stock_codes = members["con_code"].dropna().unique().tolist()
                except Exception:
                    pass
            if not stock_codes:
                return []

            quotes = {q["tsCode"]: q for q in self._fetch_sina_quotes(stock_codes)}
            items: list[dict[str, Any]] = []
            for code in stock_codes:
                q = quotes.get(code, {})
                if not q:
                    continue
                items.append({
                    "tsCode": code,
                    "stockName": q.get("name", code),
                    "close": q.get("price", 0),
                    "pctChange1d": q.get("pctChange", 0),
                    "pctChange5d": 0,
                    "pctChange10d": 0,
                    "rps5": 0,
                    "rps10": 0,
                    "rps20": 0,
                    "amount": q.get("amount", 0),
                    "ma20": 0,
                    "dataMode": "realtime",
                })
            items.sort(key=lambda x: x["pctChange1d"], reverse=True)
            return items

        return self._cached(f"intraday_stocks:{sector_code}:{trade_date}", 30, _load)

    def realtime_quotes(self, ts_codes: list[str] | None = None) -> dict[str, Any]:
        """用新浪财经 API 获取实时行情，返回 {items: [{tsCode, name, price, pctChange, ...}]}"""
        def _load():
            if not ts_codes:
                return {"items": []}
            return {"items": self._fetch_sina_quotes(ts_codes)}

        cache_key = ",".join(sorted(ts_codes)) if ts_codes else "__none__"
        return self._cached(f"realtime_quotes:{cache_key}", 15, _load)

    @staticmethod
    def _fetch_sina_quotes(ts_codes: list[str]) -> list[dict[str, Any]]:
        """通过新浪财经 hq API 批量获取实时行情（无需认证，延迟 <1s）"""
        import ssl
        import urllib.request

        # ts_code 600519.SH → sh600519
        sina_codes: list[str] = []
        sina_to_ts: dict[str, str] = {}
        for tc in ts_codes:
            parts = tc.split(".")
            pure = parts[0]
            suffix = parts[1] if len(parts) > 1 else ""
            prefix = "sh" if suffix == "SH" else "sz" if suffix == "SZ" else ("sh" if pure.startswith(("6", "9")) else "sz")
            sina_code = prefix + pure
            sina_codes.append(sina_code)
            sina_to_ts[sina_code] = tc

        # 每批最多 80 个（避免 URL 过长）
        items: list[dict[str, Any]] = []
        for i in range(0, len(sina_codes), 80):
            batch = sina_codes[i:i + 80]
            url = f"https://hq.sinajs.cn/list={','.join(batch)}"
            req = urllib.request.Request(url, headers={"Referer": "https://finance.sina.com.cn"})
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            try:
                resp = urllib.request.urlopen(req, timeout=10, context=ctx)
                data = resp.read().decode("gb2312", errors="replace")
            except Exception as exc:
                logger.warning(f"新浪实时行情获取失败: {exc}")
                continue

            for line in data.strip().split("\n"):
                if "=" not in line or '"' not in line:
                    continue
                var_part = line.split("=")[0]  # var hq_str_sh600519
                sina_code = var_part.split("_")[-1]
                fields = line.split('"')[1].split(",")
                if len(fields) < 4:
                    continue
                ts_code = sina_to_ts.get(sina_code, sina_code)
                try:
                    price = float(fields[3])
                    prev_close = float(fields[2])
                except (ValueError, IndexError):
                    continue
                if price <= 0 or prev_close <= 0:
                    continue
                pct = round((price - prev_close) / prev_close * 100, 2)
                items.append({
                    "tsCode": ts_code,
                    "name": fields[0],
                    "price": round(price, 2),
                    "pctChange": pct,
                    "change": round(price - prev_close, 2),
                    "volume": float(fields[8]) if len(fields) > 8 else 0,
                    "amount": float(fields[9]) if len(fields) > 9 else 0,
                })
        return items

    def stock_kline_ashare(self, ts_code: str, frequency: str = "1d", bars: int = 180) -> dict[str, Any]:
        """用 Ashare 获取日/周/月线（支持盘中实时），5 分钟缓存"""
        cache_key = f"kline_ashare:{ts_code}:{frequency}:{bars}"
        local_cache_key = f"{ts_code}:{frequency}:{bars}"
        minute_mode = bool(re.match(r"^\d+m$", frequency))

        def _load() -> dict[str, Any]:
            cached_df = self._data_store.get_frame("stock_kline_ashare", local_cache_key)
            if (
                cached_df is not None
                and not cached_df.empty
                and minute_mode
                and "trade_date" in cached_df.columns
                and cached_df["trade_date"].astype(str).str.len().max() <= 8
            ):
                # 历史缓存里分钟线时间被截断为 YYYYMMDD，判定为脏缓存并强制刷新
                cached_df = None
            if cached_df is not None and not cached_df.empty:
                df_norm = cached_df.copy()
            else:
                try:
                    from ashare import get_price
                except ImportError:
                    logger.warning("Ashare 未安装")
                    return {"code": ts_code, "name": ts_code, "points": []}
                # ts_code 格式: 600519.SH → sh600519
                pure = ts_code.split(".")[0]
                suffix = ts_code.split(".")[-1] if "." in ts_code else ""
                prefix = "sh" if suffix == "SH" else "sz" if suffix == "SZ" else ""
                ashare_code = prefix + pure
                try:
                    df = get_price(ashare_code, frequency=frequency, count=bars)
                except Exception as exc:
                    logger.warning(f"Ashare 获取失败: {ts_code} {frequency}, {exc}")
                    df = None

                if (df is None or df.empty) and frequency == "1d":
                    local_daily = self._stock_kline_daily_from_snapshots(ts_code, bars=bars)
                    if local_daily is not None and not local_daily.empty:
                        logger.info(f"个股日K回退本地快照成功: {ts_code}, bars={bars}")
                        df_norm = local_daily
                    else:
                        return {"code": ts_code, "name": ts_code, "points": []}
                elif df is None or df.empty:
                    return {"code": ts_code, "name": ts_code, "points": []}

                if df is not None and not df.empty:
                    def _fmt_idx(idx: Any) -> str:
                        if hasattr(idx, "strftime"):
                            return idx.strftime("%Y%m%d%H%M") if minute_mode else idx.strftime("%Y%m%d")
                        s = str(idx).replace("-", "").replace(":", "").replace(" ", "")
                        return s[:12] if minute_mode else s[:8]

                    df_norm = pd.DataFrame(
                        {
                            "trade_date": [_fmt_idx(idx) for idx in df.index],
                            "open": pd.to_numeric(df["open"], errors="coerce"),
                            "high": pd.to_numeric(df["high"], errors="coerce"),
                            "low": pd.to_numeric(df["low"], errors="coerce"),
                            "close": pd.to_numeric(df["close"], errors="coerce"),
                            "volume": pd.to_numeric(df["volume"], errors="coerce"),
                            "amount": 0.0,
                        }
                    ).dropna(subset=["trade_date", "open", "high", "low", "close", "volume"])
                if not df_norm.empty:
                    self._data_store.set_frame("stock_kline_ashare", local_cache_key, df_norm)

            name = self.stock_name_map().get(ts_code, ts_code)
            points = []
            for _, r in df_norm.iterrows():
                points.append({
                    "time": str(r["trade_date"]),
                    "open": float(r["open"]),
                    "high": float(r["high"]),
                    "low": float(r["low"]),
                    "close": float(r["close"]),
                    "volume": float(r["volume"]),
                    "amount": float(r["amount"]) if "amount" in r else 0.0,
                })

            # 日线：追加今天的实时 bar（新浪行情）
            if frequency == "1d" and points:
                today_bar = self._fetch_today_bar(ts_code)
                if today_bar:
                    last_date = points[-1]["time"]
                    if today_bar["time"] > last_date:
                        points.append(today_bar)
                    elif today_bar["time"] == last_date:
                        points[-1] = today_bar

            return {"code": ts_code, "name": name, "points": points, "frequency": frequency}

        return self._cached(cache_key, 300, _load)

    def _stock_kline_daily_from_snapshots(self, ts_code: str, bars: int = 180) -> pd.DataFrame:
        """当在线源不可用时，使用本地 stock_snapshot 重建个股日K."""
        all_dates = self._cached_snapshot_dates("stock_snapshot")
        if not all_dates:
            return pd.DataFrame()

        lookback_dates = all_dates[-max(int(bars * 2), 320) :]
        snapshots = self.stock_snapshot_batch(lookback_dates)
        rows: list[dict[str, Any]] = []
        for d in lookback_dates:
            frame = snapshots.get(d)
            if frame is None or frame.empty or "ts_code" not in frame.columns:
                continue
            hit = frame[frame["ts_code"] == ts_code]
            if hit.empty:
                continue
            row = hit.iloc[0]
            try:
                o = float(row.get("open", 0) or 0)
                h = float(row.get("high", 0) or 0)
                l = float(row.get("low", 0) or 0)
                c = float(row.get("close", 0) or 0)
            except (TypeError, ValueError):
                continue
            if o <= 0 or h <= 0 or l <= 0 or c <= 0:
                continue
            rows.append(
                {
                    "trade_date": str(d),
                    "open": o,
                    "high": h,
                    "low": l,
                    "close": c,
                    "volume": float(row.get("vol", 0) or 0),
                    "amount": float(row.get("amount", 0) or 0),
                }
            )
        if not rows:
            return pd.DataFrame()
        out = pd.DataFrame(rows).drop_duplicates(subset=["trade_date"], keep="last").sort_values("trade_date")
        return out.tail(max(1, int(bars))).reset_index(drop=True)

    def _fetch_today_bar(self, ts_code: str) -> dict[str, Any] | None:
        """从新浪获取今日实时 OHLCV bar"""
        quotes = self._fetch_sina_quotes([ts_code])
        if not quotes:
            return None
        q = quotes[0]
        # 新浪字段需要完整的 OHLCV，用 _fetch_sina_quotes 只有 price/pctChange
        # 需要单独解析完整字段
        import ssl
        import urllib.request
        parts = ts_code.split(".")
        pure, suffix = parts[0], (parts[1] if len(parts) > 1 else "")
        prefix = "sh" if suffix == "SH" else "sz"
        sina_code = prefix + pure

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        url = f"https://hq.sinajs.cn/list={sina_code}"
        req = urllib.request.Request(url, headers={"Referer": "https://finance.sina.com.cn"})
        try:
            resp = urllib.request.urlopen(req, timeout=5, context=ctx)
            data = resp.read().decode("gb2312", errors="replace")
        except Exception:
            return None

        fields = data.split('"')[1].split(",") if '"' in data else []
        if len(fields) < 31:
            return None
        try:
            open_p = float(fields[1])
            close_p = float(fields[3])
            high_p = float(fields[4])
            low_p = float(fields[5])
            volume = float(fields[8])
            amount = float(fields[9])
            date_str = fields[30].replace("-", "")
        except (ValueError, IndexError):
            return None
        if open_p <= 0 or close_p <= 0:
            return None
        return {
            "time": date_str,
            "open": round(open_p, 2),
            "high": round(high_p, 2),
            "low": round(low_p, 2),
            "close": round(close_p, 2),
            "volume": volume,
            "amount": amount,
        }

    def stock_kline(self, ts_code: str, trade_date: str, bars: int = 180) -> dict[str, Any]:
        cache_key = f"kline:{ts_code}:{trade_date}:{bars}"
        local_cache_key = f"{ts_code}:{trade_date}:{bars}"

        def _load() -> dict[str, Any]:
            cached_df = self._data_store.get_frame("stock_kline_qfq", local_cache_key)
            if cached_df is not None and not cached_df.empty:
                df = cached_df.copy()
            else:
                dates = self.trade_dates(trade_date, need=max(bars + 30, 220))
                start = dates[-bars] if len(dates) >= bars else dates[0]
                try:
                    df = ts.pro_bar(
                        ts_code=ts_code,
                        api=self.pro,
                        adj="qfq",
                        start_date=start,
                        end_date=trade_date,
                        asset="E",
                    )
                except Exception as exc:
                    logger.warning(f"前复权日线加载失败，降级原始日线: {ts_code}, 错误: {exc}")
                    df = self.pro.daily(ts_code=ts_code, start_date=start, end_date=trade_date)
                if df is not None and not df.empty:
                    self._data_store.set_frame("stock_kline_qfq", local_cache_key, df)
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
            # 冯总交易信号检测
            feng_signals = {}
            try:
                from pattern_detector import detect_feng_signals
                feng_signals = detect_feng_signals(df)
            except Exception as exc:
                logger.debug(f"冯总信号检测异常: {exc}")

            return {"code": ts_code, "name": name, "points": points, "fengSignals": feng_signals}

        return self._cached(cache_key, 300, _load)

    def _detect_5m_patterns(self, points: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """从5分钟K中检测最近一个双底和双顶信号，用于图上标注"""
        signals: list[dict[str, Any]] = []
        n = len(points)
        if n < 40:
            return signals

        low_arr = np.array([float(x.get("low", 0) or 0) for x in points], dtype=float)
        high_arr = np.array([float(x.get("high", 0) or 0) for x in points], dtype=float)
        if np.any(low_arr <= 0) or np.any(high_arr <= 0):
            return signals

        local_lows: list[int] = []
        local_highs: list[int] = []
        for i in range(2, n - 2):
            if low_arr[i] <= float(np.min(low_arr[i - 2 : i + 3])):
                local_lows.append(i)
            if high_arr[i] >= float(np.max(high_arr[i - 2 : i + 3])):
                local_highs.append(i)

        found_w = False
        for j in range(len(local_lows) - 1, 0, -1):
            i2 = local_lows[j]
            for i in range(j - 1, -1, -1):
                i1 = local_lows[i]
                span = i2 - i1
                if span < 12 or span > 140:
                    continue
                p1, p2 = low_arr[i1], low_arr[i2]
                base = (p1 + p2) / 2.0
                if base <= 0 or abs(p1 - p2) / base > 0.025:
                    continue
                mid_high = float(np.max(high_arr[i1 : i2 + 1]))
                if (mid_high - max(p1, p2)) / max(p1, p2) < 0.015:
                    continue
                signals.append(
                    {
                        "date": str(points[i2].get("time", "")),
                        "type": "h2_w",
                        "label": "W",
                        "price": round(float(p2), 2),
                        "highPrice": round(mid_high, 2),
                    }
                )
                found_w = True
                break
            if found_w:
                break

        found_top = False
        for j in range(len(local_highs) - 1, 0, -1):
            i2 = local_highs[j]
            for i in range(j - 1, -1, -1):
                i1 = local_highs[i]
                span = i2 - i1
                if span < 12 or span > 140:
                    continue
                p1, p2 = high_arr[i1], high_arr[i2]
                base = (p1 + p2) / 2.0
                if base <= 0 or abs(p1 - p2) / base > 0.025:
                    continue
                valley = float(np.min(low_arr[i1 : i2 + 1]))
                if valley <= 0 or (min(p1, p2) - valley) / valley < 0.015:
                    continue
                signals.append(
                    {
                        "date": str(points[i2].get("time", "")),
                        "type": "doubleTop",
                        "label": "双顶",
                        "price": round(float(p2), 2),
                        "lowPrice": round(valley, 2),
                    }
                )
                found_top = True
                break
            if found_top:
                break

        return signals

    def stock_kline_5m_synthetic(self, ts_code: str, trade_date: str, bars: int = 240) -> dict[str, Any]:
        """上证5分钟：优先真实分钟线，失败时回退日K合成"""
        cache_key = f"kline_5m_synth:{ts_code}:{trade_date}:{bars}"

        def _load() -> dict[str, Any]:
            try:
                # 1) 优先用真实5分钟
                real_5m = self.stock_kline_ashare(ts_code, "5m", bars=bars)
                real_points = list(real_5m.get("points", [])) if isinstance(real_5m, dict) else []
                if real_points and any(len(str(p.get("time", ""))) >= 12 for p in real_points):
                    signals = self._detect_5m_patterns(real_points)
                    return {
                        "code": real_5m.get("code", ts_code),
                        "name": real_5m.get("name", ts_code),
                        "points": real_points[-bars:],
                        "signals": signals,
                        "frequency": "5m",
                        "synthetic": False,
                        "sourceFrequency": "5m",
                    }

                # 2) 回退为日K合成5分钟
                day_bars = max(int(bars / 48) + 12, 30)
                daily = self.stock_kline_ashare(ts_code, "1d", bars=day_bars)
                daily_points = list(daily.get("points", [])) if isinstance(daily, dict) else []

                if not daily_points:
                    # 上证指数是指数代码，优先走 index 日线，避免走个股接口导致异常
                    daily_fallback: dict[str, Any]
                    try:
                        if ts_code == "000001.SH":
                            daily_fallback = self.index_kline(ts_code, trade_date, bars=day_bars)
                        else:
                            daily_fallback = self.stock_kline(ts_code, trade_date, bars=day_bars)
                    except Exception as exc:
                        logger.warning(f"5m合成日线回退失败: {ts_code}, 错误: {exc}")
                        daily_fallback = {"code": ts_code, "name": ts_code, "points": []}

                    daily_points = list(daily_fallback.get("points", [])) if isinstance(daily_fallback, dict) else []
                    if not daily_points:
                        return {"code": ts_code, "name": ts_code, "points": [], "frequency": "5m", "synthetic": True}

                daily_points = [p for p in daily_points if str(p.get("time", "")) <= trade_date][-day_bars:]
                if not daily_points:
                    return {
                        "code": daily.get("code", ts_code),
                        "name": daily.get("name", ts_code),
                        "points": [],
                        "frequency": "5m",
                        "synthetic": True,
                    }
            except Exception as exc:
                logger.warning(f"5m合成异常: {ts_code}, 错误: {exc}")
                return {"code": ts_code, "name": ts_code, "points": [], "frequency": "5m", "synthetic": True}

            out: list[dict[str, Any]] = []

            def _session_times(d: str) -> list[str]:
                morning = [f"{d}{h:02d}{m:02d}" for h, m in (
                    (9, 35), (9, 40), (9, 45), (9, 50), (9, 55),
                    (10, 0), (10, 5), (10, 10), (10, 15), (10, 20), (10, 25), (10, 30),
                    (10, 35), (10, 40), (10, 45), (10, 50), (10, 55),
                    (11, 0), (11, 5), (11, 10), (11, 15), (11, 20), (11, 25), (11, 30),
                )]
                afternoon = [f"{d}{h:02d}{m:02d}" for h, m in (
                    (13, 5), (13, 10), (13, 15), (13, 20), (13, 25), (13, 30), (13, 35), (13, 40),
                    (13, 45), (13, 50), (13, 55), (14, 0), (14, 5), (14, 10), (14, 15), (14, 20),
                    (14, 25), (14, 30), (14, 35), (14, 40), (14, 45), (14, 50), (14, 55), (15, 0),
                )]
                return morning + afternoon

            for d in daily_points:
                day = str(d.get("time", ""))
                if len(day) < 8:
                    continue
                day = day[:8]
                o = float(d.get("open", 0) or 0)
                h = float(d.get("high", 0) or 0)
                l = float(d.get("low", 0) or 0)
                c = float(d.get("close", 0) or 0)
                v = float(d.get("volume", 0) or 0)
                if h <= 0 or l <= 0 or o <= 0 or c <= 0:
                    continue
                if h < l:
                    h, l = l, h

                # 先构造“收盘轨迹”：经过 O/H/L/C，保持每日日K一致
                if c >= o:
                    low_slot, high_slot = 6, 36
                    anchors = [(0, o), (low_slot, l), (high_slot, h), (47, c)]
                else:
                    high_slot, low_slot = 6, 36
                    anchors = [(0, o), (high_slot, h), (low_slot, l), (47, c)]

                close_path = np.zeros(48, dtype=float)
                for i in range(len(anchors) - 1):
                    s_idx, s_val = anchors[i]
                    e_idx, e_val = anchors[i + 1]
                    if e_idx <= s_idx:
                        continue
                    seg = np.linspace(s_val, e_val, e_idx - s_idx + 1)
                    close_path[s_idx : e_idx + 1] = seg

                # 轻微波动，避免生成“机械直线”
                amp = max((h - l) * 0.02, 0.001)
                noise = np.sin(np.linspace(0, np.pi * 2, 48)) * amp
                close_path = np.clip(close_path + noise, l, h)
                close_path[0] = o
                close_path[low_slot] = l
                close_path[high_slot] = h
                close_path[-1] = c

                # 分配成交量：开盘、收盘及极值附近更活跃
                idx = np.arange(48, dtype=float)
                weights = (
                    1.0
                    + 1.6 * np.exp(-((idx - 0) / 6.0) ** 2)
                    + 1.6 * np.exp(-((idx - 47) / 6.0) ** 2)
                    + 0.9 * np.exp(-((idx - low_slot) / 7.0) ** 2)
                    + 0.9 * np.exp(-((idx - high_slot) / 7.0) ** 2)
                )
                weights = weights / weights.sum()
                vols = v * weights

                prev_close = o
                for i, t in enumerate(_session_times(day)):
                    ci = float(close_path[i])
                    oi = float(prev_close)
                    span = max(abs(ci - oi), (h - l) * 0.003)
                    hi = min(h, max(oi, ci) + span * 0.45)
                    lo = max(l, min(oi, ci) - span * 0.45)
                    if i == high_slot:
                        hi = h
                    if i == low_slot:
                        lo = l
                    if lo > hi:
                        lo, hi = hi, lo
                    vol_i = float(vols[i])
                    out.append(
                        {
                            "time": t,
                            "open": round(oi, 2),
                            "high": round(hi, 2),
                            "low": round(lo, 2),
                            "close": round(ci, 2),
                            "volume": max(vol_i, 0.0),
                            "amount": round(max(vol_i, 0.0) * ((oi + ci) / 2.0), 2),
                        }
                    )
                    prev_close = ci

            points_out = out[-bars:]
            signals = self._detect_5m_patterns(points_out)
            if points_out:
                first_time = str(points_out[0]["time"])
                signals = [s for s in signals if str(s.get("date", "")) >= first_time]

            return {
                "code": daily.get("code", ts_code),
                "name": daily.get("name", ts_code),
                "points": points_out,
                "signals": signals,
                "frequency": "5m",
                "synthetic": True,
                "sourceFrequency": "1d",
            }

        return self._cached(cache_key, 60, _load)

    def index_kline(self, ts_code: str, trade_date: str, bars: int = 180) -> dict[str, Any]:
        """获取指数K线数据，支持 A 股指数 (.SH/.SZ/.CSI) 和同花顺指数 (.TI)"""
        cache_key = f"index_kline:{ts_code}:{trade_date}:{bars}"

        def _load() -> dict[str, Any]:
            dates = self.trade_dates(trade_date, need=max(bars + 30, 220))
            start = dates[-bars] if len(dates) >= bars else dates[0]

            # 指数名称映射
            from index_risk_analyzer import TRACKED_INDICES
            name_map = {idx["ts_code"]: idx["name"] for idx in TRACKED_INDICES}
            name = name_map.get(ts_code, ts_code)

            df = None
            if ts_code.endswith(".TI"):
                # 同花顺指数
                try:
                    df = self.pro.ths_daily(ts_code=ts_code, start_date=start, end_date=trade_date)
                except Exception as exc:
                    logger.warning(f"同花顺指数加载失败 {ts_code}: {exc}")
            elif ts_code.endswith(".HI"):
                # 港股指数 — 尝试 ths_daily
                try:
                    df = self.pro.ths_daily(ts_code=ts_code, start_date=start, end_date=trade_date)
                except Exception:
                    pass
            else:
                # 标准 A 股指数
                try:
                    df = self.pro.index_daily(ts_code=ts_code, start_date=start, end_date=trade_date)
                except Exception as exc:
                    logger.warning(f"指数加载失败 {ts_code}: {exc}")

            if df is None or df.empty:
                return {"code": ts_code, "name": name, "points": []}

            df = df.sort_values("trade_date").reset_index(drop=True)
            df["ma5"] = df["close"].rolling(5).mean()
            df["ma10"] = df["close"].rolling(10).mean()
            df["ma20"] = df["close"].rolling(20).mean()

            points = []
            for _, r in df.iterrows():
                points.append({
                    "time": str(r["trade_date"]),
                    "open": float(r["open"]),
                    "high": float(r["high"]),
                    "low": float(r["low"]),
                    "close": float(r["close"]),
                    "volume": float(r.get("vol", 0)),
                    "ma5": float(r["ma5"]) if pd.notna(r["ma5"]) else None,
                    "ma10": float(r["ma10"]) if pd.notna(r["ma10"]) else None,
                    "ma20": float(r["ma20"]) if pd.notna(r["ma20"]) else None,
                })
            return {"code": ts_code, "name": name, "points": points}

        return self._cached(cache_key, 300, _load)

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
                "market": {"name": "沪深300", "rpsSeries": []},
                "summary": {"relativeStrength5d": 0, "relativeStrength10d": 0, "relativeStrength20d": 0, "label": "同步"},
            }

        s = pd.DataFrame(sk["points"])[["time", "close"]].rename(columns={"close": "s_close"})
        b = pd.DataFrame(bk["points"])[["time", "close"]].rename(columns={"close": "b_close"})
        m = s.merge(b, on="time", how="inner")

        # 大盘（沪深300）— 指数用 index_daily
        try:
            dates = self.trade_dates(trade_date, need=max(bars + 10, 80))
            idx_start = dates[-bars] if len(dates) >= bars else dates[0]
            mdf_raw = self.pro.index_daily(ts_code="000300.SH", start_date=idx_start, end_date=trade_date)
            if mdf_raw is not None and not mdf_raw.empty:
                mdf_raw = mdf_raw.sort_values("trade_date").reset_index(drop=True)
                mdf = mdf_raw[["trade_date", "close"]].rename(columns={"trade_date": "time", "close": "m_close"})
                m = m.merge(mdf, on="time", how="left")
        except Exception as exc:
            logger.debug(f"大盘指数加载失败: {exc}")
        if "m_close" not in m.columns:
            m["m_close"] = np.nan

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
        m_first = m["m_close"].dropna().iloc[0] if m["m_close"].notna().any() else None
        m["m_norm"] = (m["m_close"] / m_first - 1) * 100 if m_first else np.nan

        market_series = []
        if m["m_norm"].notna().any():
            market_series = [{"time": x["time"], "value": round(float(x["m_norm"]), 2)} for _, x in m.iterrows() if pd.notna(x["m_norm"])]

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
            "market": {
                "name": "沪深300",
                "rpsSeries": market_series,
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
        # ── SQLite 缓存（24 小时有效）──
        cached = self._data_store.get_json("financials", ts_code, max_age_hours=24)
        if cached and len(cached.get("periods", [])) >= periods:
            return cached

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

        result = {"code": ts_code, "name": name, "periods": results}
        # 有数据时写入缓存
        if results:
            self._data_store.set_json("financials", ts_code, result)
        return result

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
                logger.warning(f"板块归因失败: {ts_code}, {exc}", exc_info=self.config.server.debug)

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
                logger.warning(f"财务归因失败: {ts_code}, {exc}", exc_info=self.config.server.debug)

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
                logger.warning(f"资金归因失败: {ts_code}, {exc}", exc_info=self.config.server.debug)

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
                logger.warning(f"新闻归因失败: {ts_code}, {exc}", exc_info=self.config.server.debug)

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

    # ══════════════════════════════════════════════════════════════
    #  HH 信号成功率统计
    # ══════════════════════════════════════════════════════════════

    def stock_hh_stats(self, ts_code: str, trade_date: str) -> dict[str, Any]:
        """
        统计个股 HH 信号的历史成功率。

        方法：
        1. 取约 500 根 K 线的历史数据
        2. 用 detect_hh_signals 找到所有历史 HH 信号
        3. 对每个信号计算 5日/10日/20日 后的涨幅
        4. 统计成功率（成功 = 后续 N 日最高价相对信号价有正收益）

        返回:
        {
            "tsCode": str,
            "totalSignals": int,
            "signals": [ {date, type, price, ret5d, ret10d, ret20d, maxGain20d, success} ],
            "statsByType": { "H1": {count, winRate5d, winRate10d, winRate20d, avgRet10d}, "H2": ... },
            "overall": { winRate5d, winRate10d, winRate20d, avgMaxGain20d }
        }
        """
        def _load():
            import tushare as ts
            from pattern_detector import detect_hh_signals

            # 取 500 根 K 线
            bars = 500
            dates = self.trade_dates(trade_date, need=bars + 30)
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
            except Exception:
                df = self.pro.daily(ts_code=ts_code, start_date=start, end_date=trade_date)

            if df is None or df.empty:
                return {"tsCode": ts_code, "totalSignals": 0, "signals": [], "statsByType": {}, "overall": {}}

            df = df.sort_values("trade_date").reset_index(drop=True)

            # 运行 HH 检测（用全量数据）
            hh_result = detect_hh_signals(df, lookback=len(df))
            raw_signals = hh_result.get("signals", [])

            if not raw_signals:
                return {"tsCode": ts_code, "totalSignals": 0, "signals": [], "statsByType": {}, "overall": {}}

            # 构建日期→索引映射
            date_to_idx = {str(d): i for i, d in enumerate(df["trade_date"].values)}
            close_arr = df["close"].values.astype(float)
            high_arr = df["high"].values.astype(float)
            n = len(close_arr)

            signal_details = []
            for sig in raw_signals:
                sig_date = sig.get("date", "")
                sig_type = sig.get("type", "")
                sig_price = sig.get("price", 0)

                if not sig_date or sig_date not in date_to_idx:
                    continue

                idx = date_to_idx[sig_date]
                # 用收盘价作为基准（比 low 更准确反映入场价）
                entry_price = float(close_arr[idx])
                if entry_price <= 0:
                    continue

                # 计算 5/10/20 日后的收益率
                def _forward_return(days):
                    end_idx = min(idx + days, n - 1)
                    if end_idx <= idx:
                        return None
                    future_close = float(close_arr[end_idx])
                    return round((future_close - entry_price) / entry_price * 100, 2)

                def _max_gain(days):
                    end_idx = min(idx + days, n - 1)
                    if end_idx <= idx:
                        return None
                    future_highs = high_arr[idx + 1 : end_idx + 1]
                    if len(future_highs) == 0:
                        return None
                    max_high = float(future_highs.max())
                    return round((max_high - entry_price) / entry_price * 100, 2)

                ret5 = _forward_return(5)
                ret10 = _forward_return(10)
                ret20 = _forward_return(20)
                mg20 = _max_gain(20)

                detail = {
                    "date": sig_date,
                    "type": sig_type,
                    "price": round(entry_price, 2),
                    "supportPrice": sig.get("supportPrice"),
                    "volumeRatio": sig.get("volumeRatio"),
                    "buySignal": sig.get("buySignal", False),
                    "ret5d": ret5,
                    "ret10d": ret10,
                    "ret20d": ret20,
                    "maxGain20d": mg20,
                    "success": (mg20 is not None and mg20 > 3),  # 20日内最大涨幅 > 3%
                }
                signal_details.append(detail)

            # 按类型统计
            from collections import defaultdict
            type_groups = defaultdict(list)
            for d in signal_details:
                type_groups[d["type"]].append(d)

            stats_by_type = {}
            for t, items in sorted(type_groups.items()):
                cnt = len(items)
                def _win_rate(key):
                    valid = [x for x in items if x[key] is not None]
                    if not valid:
                        return None
                    wins = sum(1 for x in valid if x[key] > 0)
                    return round(wins / len(valid) * 100, 1)

                def _avg(key):
                    valid = [x[key] for x in items if x[key] is not None]
                    if not valid:
                        return None
                    return round(sum(valid) / len(valid), 2)

                stats_by_type[t] = {
                    "count": cnt,
                    "winRate5d": _win_rate("ret5d"),
                    "winRate10d": _win_rate("ret10d"),
                    "winRate20d": _win_rate("ret20d"),
                    "avgRet5d": _avg("ret5d"),
                    "avgRet10d": _avg("ret10d"),
                    "avgRet20d": _avg("ret20d"),
                    "avgMaxGain20d": _avg("maxGain20d"),
                }

            # 总体统计
            total = len(signal_details)
            def _overall_wr(key):
                valid = [x for x in signal_details if x[key] is not None]
                if not valid:
                    return None
                wins = sum(1 for x in valid if x[key] > 0)
                return round(wins / len(valid) * 100, 1)

            def _overall_avg(key):
                valid = [x[key] for x in signal_details if x[key] is not None]
                if not valid:
                    return None
                return round(sum(valid) / len(valid), 2)

            overall = {
                "winRate5d": _overall_wr("ret5d"),
                "winRate10d": _overall_wr("ret10d"),
                "winRate20d": _overall_wr("ret20d"),
                "avgRet5d": _overall_avg("ret5d"),
                "avgRet10d": _overall_avg("ret10d"),
                "avgRet20d": _overall_avg("ret20d"),
                "avgMaxGain20d": _overall_avg("maxGain20d"),
            }

            return {
                "tsCode": ts_code,
                "totalSignals": total,
                "signals": signal_details,
                "statsByType": stats_by_type,
                "overall": overall,
            }

        return self._cached(f"hh_stats:{ts_code}:{trade_date}", 600, _load)

    def market_recap(self, trade_date: str) -> dict[str, Any]:
        """盘前纪要：涨停热点 / 机构买卖 / 游资动向 / 新高股票 / 异动预警"""
        # 优先查预计算数据（<1ms）
        cached = self._precomputed.get_market_recap(trade_date)
        if cached:
            return cached

        def _load() -> dict[str, Any]:
            result = {
                "tradeDate": trade_date,
                "limitUpHotspots": self._recap_limit_up_hotspots(trade_date),
                "institutional": self._recap_institutional(trade_date),
                "hotMoney": self._recap_hot_money(trade_date),
                "newHighs": self._recap_new_highs(trade_date),
                "alerts": self._recap_alerts(trade_date),
            }
            # 计算完存入预计算库供下次使用
            try:
                self._precomputed.set_market_recap(trade_date, result)
            except Exception:
                pass
            return result

        return self._cached(f"market_recap:{trade_date}", 900, _load)

    def _recap_limit_up_hotspots(self, trade_date: str) -> dict[str, Any]:
        """涨停/跌停热点及连板统计"""
        try:
            stocks = self.compute_stock_metrics(trade_date)
            if stocks.empty:
                return {
                    "limitUpCount": 0,
                    "limitDownCount": 0,
                    "byBoard": [],
                    "bySector": []
                }

            # 识别涨停和跌停股票
            limit_up_stocks = stocks[stocks["pct_chg"] >= 9.8].copy()
            limit_down_stocks = stocks[stocks["pct_chg"] <= -9.8].copy()

            limit_up_count = len(limit_up_stocks)
            limit_down_count = len(limit_down_stocks)

            # 计算连板数（consecutive limit-up days）
            if not limit_up_stocks.empty:
                # 获取最近7个交易日
                dates = self.trade_dates(trade_date, need=7)
                dates_desc = list(reversed(dates))  # 最新的日期在前

                # 为每个涨停股票计算连板数
                def _count_consecutive_boards(ts_code):
                    count = 0
                    for i, d in enumerate(dates_desc):
                        try:
                            day_metrics = self.compute_stock_metrics(d)
                            if day_metrics.empty:
                                break
                            day_stock = day_metrics[day_metrics["ts_code"] == ts_code]
                            if day_stock.empty or day_stock["pct_chg"].iloc[0] < 9.8:
                                break
                            count += 1
                        except Exception:
                            break
                    return count

                limit_up_stocks["consecutive_boards"] = limit_up_stocks["ts_code"].apply(_count_consecutive_boards)

                # 分组显示：按连板数分组
                board_groups = {}
                for _, row in limit_up_stocks.iterrows():
                    boards = int(row["consecutive_boards"])
                    if boards not in board_groups:
                        board_groups[boards] = []
                    board_groups[boards].append({
                        "tsCode": row["ts_code"],
                        "stockName": row.get("name", row["ts_code"]),
                        "sectorName": row.get("sector_name", "未分类"),
                        "close": round(float(row["close"]), 2),
                        "pctChg": round(float(row["pct_chg"]), 2)
                    })

                # 生成 byBoard 列表（按连板数降序）
                by_board = []
                for boards in sorted(board_groups.keys(), reverse=True):
                    board_label = f"{boards}连板" if boards > 1 else "首板"
                    by_board.append({
                        "board": board_label,
                        "count": len(board_groups[boards]),
                        "stocks": board_groups[boards]
                    })

                # 按板块分组统计
                sector_count = {}
                for _, row in limit_up_stocks.iterrows():
                    sector = row.get("sector_name", "未分类")
                    if sector not in sector_count:
                        sector_count[sector] = {"count": 0, "stocks": []}
                    sector_count[sector]["count"] += 1
                    sector_count[sector]["stocks"].append({
                        "tsCode": row["ts_code"],
                        "stockName": row.get("name", row["ts_code"]),
                        "close": round(float(row["close"]), 2),
                        "pctChg": round(float(row["pct_chg"]), 2),
                        "consecutiveBoards": int(row["consecutive_boards"])
                    })

                by_sector = sorted(
                    [{"sectorName": k, "count": v["count"], "stocks": v["stocks"]}
                     for k, v in sector_count.items()],
                    key=lambda x: x["count"],
                    reverse=True
                )
            else:
                by_board = []
                by_sector = []

            return {
                "limitUpCount": limit_up_count,
                "limitDownCount": limit_down_count,
                "byBoard": by_board,
                "bySector": by_sector
            }

        except Exception as exc:
            logger.warning(f"计算涨跌停热点失败: {exc}")
            return {
                "limitUpCount": 0,
                "limitDownCount": 0,
                "byBoard": [],
                "bySector": []
            }

    def _recap_institutional(self, trade_date: str) -> dict[str, Any]:
        """机构买卖席位统计"""
        try:
            # 获取股票名称映射
            stock_names = self.stock_name_map()

            # 当日机构数据
            daily_data = []
            try:
                top_inst = self.pro.top_inst(trade_date=trade_date)
                if top_inst is not None and not top_inst.empty:
                    # 过滤机构席位（包含"机构"或"基金"）
                    inst_rows = top_inst[
                        top_inst["exalter"].fillna("").str.contains("机构|基金", regex=True)
                    ]

                    if not inst_rows.empty:
                        # 按ts_code分组，求和买卖金额
                        grouped = inst_rows.groupby("ts_code").agg({
                            "buy": "sum",
                            "sell": "sum",
                        }).reset_index()
                        grouped["net_buy"] = grouped["buy"] - grouped["sell"]
                        grouped["name"] = grouped["ts_code"].map(stock_names).fillna(grouped["ts_code"])

                        # 获取股票今日收盘价和涨幅
                        metrics = self.compute_stock_metrics(trade_date)
                        if not metrics.empty:
                            grouped = grouped.merge(
                                metrics[["ts_code", "close", "pct_chg"]],
                                on="ts_code",
                                how="left"
                            )

                        daily_data = grouped.to_dict("records")
            except Exception as exc:
                logger.debug(f"获取当日机构数据失败: {exc}")

            # 3日机构数据
            three_day_data_buy = []
            three_day_data_sell = []
            try:
                d3_ago = self.trade_dates(trade_date, need=3)[0]
                top_inst_3d = self.pro.top_inst(start_date=d3_ago, end_date=trade_date)
                if top_inst_3d is not None and not top_inst_3d.empty:
                    inst_rows_3d = top_inst_3d[
                        top_inst_3d["exalter"].fillna("").str.contains("机构|基金", regex=True)
                    ]

                    if not inst_rows_3d.empty:
                        grouped_3d = inst_rows_3d.groupby("ts_code").agg({
                            "buy": "sum",
                            "sell": "sum",
                        }).reset_index()
                        grouped_3d["net_buy"] = grouped_3d["buy"] - grouped_3d["sell"]
                        grouped_3d["name"] = grouped_3d["ts_code"].map(stock_names).fillna(grouped_3d["ts_code"])

                        # 获取股票信息
                        metrics = self.compute_stock_metrics(trade_date)
                        if not metrics.empty:
                            grouped_3d = grouped_3d.merge(
                                metrics[["ts_code", "close", "pct_chg"]],
                                on="ts_code",
                                how="left"
                            )

                        # 按净买入排序
                        buy_list = grouped_3d[grouped_3d["net_buy"] > 0].sort_values("net_buy", ascending=False)
                        sell_list = grouped_3d[grouped_3d["net_buy"] < 0].sort_values("net_buy", ascending=True)

                        three_day_data_buy = [
                            {
                                "tsCode": row["ts_code"],
                                "stockName": row.get("name", row["ts_code"]),
                                "close": round(float(row["close"]), 2) if pd.notna(row["close"]) else 0,
                                "pctChg": round(float(row["pct_chg"]), 2) if pd.notna(row["pct_chg"]) else 0,
                                "buyAmount": round(float(row["buy"] or 0), 2),
                                "sellAmount": round(float(row["sell"] or 0), 2),
                                "netAmount": round(float(row["net_buy"] or 0), 2)
                            }
                            for _, row in buy_list.iterrows()
                        ]

                        three_day_data_sell = [
                            {
                                "tsCode": row["ts_code"],
                                "stockName": row.get("name", row["ts_code"]),
                                "close": round(float(row["close"]), 2) if pd.notna(row["close"]) else 0,
                                "pctChg": round(float(row["pct_chg"]), 2) if pd.notna(row["pct_chg"]) else 0,
                                "buyAmount": round(float(row["buy"] or 0), 2),
                                "sellAmount": round(float(row["sell"] or 0), 2),
                                "netAmount": round(float(row["net_buy"] or 0), 2)
                            }
                            for _, row in sell_list.iterrows()
                        ]
            except Exception as exc:
                logger.debug(f"获取3日机构数据失败: {exc}")

            # 处理当日数据
            daily_net_buy = []
            daily_net_sell = []
            if daily_data:
                daily_df = pd.DataFrame(daily_data)
                buy_df = daily_df[daily_df["net_buy"] > 0].sort_values("net_buy", ascending=False)
                sell_df = daily_df[daily_df["net_buy"] < 0].sort_values("net_buy", ascending=True)

                daily_net_buy = [
                    {
                        "tsCode": row["ts_code"],
                        "stockName": row.get("name", row["ts_code"]),
                        "close": round(float(row["close"]), 2) if pd.notna(row["close"]) else 0,
                        "pctChg": round(float(row["pct_chg"]), 2) if pd.notna(row["pct_chg"]) else 0,
                        "buyCount": 1,
                        "sellCount": 0,
                        "buyAmount": round(float(row["buy"] or 0), 2),
                        "sellAmount": round(float(row["sell"] or 0), 2),
                        "netAmount": round(float(row["net_buy"] or 0), 2)
                    }
                    for _, row in buy_df.iterrows()
                ]

                daily_net_sell = [
                    {
                        "tsCode": row["ts_code"],
                        "stockName": row.get("name", row["ts_code"]),
                        "close": round(float(row["close"]), 2) if pd.notna(row["close"]) else 0,
                        "pctChg": round(float(row["pct_chg"]), 2) if pd.notna(row["pct_chg"]) else 0,
                        "buyCount": 0,
                        "sellCount": 1,
                        "buyAmount": round(float(row["buy"] or 0), 2),
                        "sellAmount": round(float(row["sell"] or 0), 2),
                        "netAmount": round(float(row["net_buy"] or 0), 2)
                    }
                    for _, row in sell_df.iterrows()
                ]

            return {
                "dailyNetBuy": daily_net_buy[:10],  # 限制前10个
                "dailyNetSell": daily_net_sell[:10],
                "threeDay": {
                    "netBuy": three_day_data_buy[:10],
                    "netSell": three_day_data_sell[:10]
                }
            }

        except Exception as exc:
            logger.warning(f"计算机构买卖数据失败: {exc}")
            return {
                "dailyNetBuy": [],
                "dailyNetSell": [],
                "threeDay": {"netBuy": [], "netSell": []}
            }

    def _recap_hot_money(self, trade_date: str) -> dict[str, Any]:
        """游资（热钱）动向统计"""
        try:
            stock_names = self.stock_name_map()
            desk_data = {}

            # 从 top_inst 获取游资数据（非机构席位）
            try:
                top_inst = self.pro.top_inst(trade_date=trade_date)
                if top_inst is not None and not top_inst.empty:
                    # 过滤非机构席位（不包含"机构"和"基金"）
                    hot_rows = top_inst[
                        ~top_inst["exalter"].fillna("").str.contains("机构|基金", regex=True)
                    ]

                    if not hot_rows.empty:
                        # 按营业部（exalter）分组
                        for _, row in hot_rows.iterrows():
                            desk = row.get("exalter", "未知营业部")
                            ts_code = row.get("ts_code", "")

                            if desk not in desk_data:
                                desk_data[desk] = {"buy": 0, "sell": 0, "stocks": {}}

                            buy_amt = float(row.get("buy", 0) if pd.notna(row.get("buy")) else 0)
                            sell_amt = float(row.get("sell", 0) if pd.notna(row.get("sell")) else 0)
                            net_amt = buy_amt - sell_amt

                            desk_data[desk]["buy"] += buy_amt
                            desk_data[desk]["sell"] += sell_amt

                            if ts_code not in desk_data[desk]["stocks"]:
                                desk_data[desk]["stocks"][ts_code] = {
                                    "buy": 0,
                                    "sell": 0
                                }
                            desk_data[desk]["stocks"][ts_code]["buy"] += buy_amt
                            desk_data[desk]["stocks"][ts_code]["sell"] += sell_amt

                    # 获取股票信息
                    metrics = self.compute_stock_metrics(trade_date)

                    # 构建净买入和净卖出列表
                    net_buy_desks = []
                    net_sell_desks = []

                    for desk, data in desk_data.items():
                        net_total = data["buy"] - data["sell"]
                        stocks_list = []

                        for ts_code, amounts in data["stocks"].items():
                            net_amt = amounts["buy"] - amounts["sell"]
                            stock_name = stock_names.get(ts_code, ts_code)

                            # 获取股票当前价格和涨幅
                            if not metrics.empty:
                                stock_row = metrics[metrics["ts_code"] == ts_code]
                                if not stock_row.empty:
                                    close = float(stock_row["close"].iloc[0])
                                    pct_chg = float(stock_row["pct_chg"].iloc[0])
                                else:
                                    close = 0
                                    pct_chg = 0
                            else:
                                close = 0
                                pct_chg = 0

                            stocks_list.append({
                                "tsCode": ts_code,
                                "stockName": stock_name,
                                "close": round(close, 2),
                                "pctChg": round(pct_chg, 2),
                                "netAmount": round(net_amt, 2),
                                "direction": "buy" if net_amt > 0 else "sell"
                            })

                        # 按净额排序
                        stocks_list.sort(key=lambda x: abs(x["netAmount"]), reverse=True)

                        desk_item = {
                            "desk": desk,
                            "netAmount": round(net_total, 2),
                            "stocks": stocks_list[:5]  # 限制每个营业部5个股票
                        }

                        if net_total > 0:
                            net_buy_desks.append(desk_item)
                        else:
                            net_sell_desks.append(desk_item)

                    # 排序
                    net_buy_desks.sort(key=lambda x: x["netAmount"], reverse=True)
                    net_sell_desks.sort(key=lambda x: x["netAmount"], reverse=False)

            except Exception as exc:
                logger.debug(f"获取游资数据失败: {exc}")

            return {
                "netBuy": net_buy_desks[:5],
                "netSell": net_sell_desks[:5]
            }

        except Exception as exc:
            logger.warning(f"计算游资动向失败: {exc}")
            return {"netBuy": [], "netSell": []}

    def _recap_new_highs(self, trade_date: str) -> dict[str, Any]:
        """创新高股票统计"""
        try:
            stocks = self.compute_stock_metrics(trade_date)
            if stocks.empty:
                return {
                    "count": 0,
                    "trend": {"today": 0, "yesterday": 0, "dayBefore": 0},
                    "stocks": []
                }

            # 获取历史日期
            dates = self.trade_dates(trade_date, need=250)
            pos = dates.index(trade_date)
            yesterday = dates[pos - 1] if pos > 0 else trade_date
            day_before = dates[pos - 2] if pos > 1 else trade_date

            # 获取近期快照以计算250日最高价
            snapshots = self.stock_snapshot_batch([dates[pos - 249]] if pos >= 249 else [dates[0]] + dates)

            new_highs = []

            # 对于有较强势头的股票（rps20 > 70 或 pct_chg > 0），检查是否创新高
            candidates = stocks[
                (stocks.get("rps20", pd.Series(0, index=stocks.index)) > 70) |
                (stocks["pct_chg"] > 0)
            ].copy()

            if not candidates.empty:
                # 获取250日数据以检查最高价
                try:
                    d250_idx = pos - 250 if pos >= 250 else 0
                    d250 = dates[d250_idx]

                    # 加载250日数据
                    hist_data = []
                    for i in range(d250_idx, pos + 1):
                        try:
                            snap = snapshots.get(dates[i])
                            if snap is not None and not snap.empty and "high" in snap.columns:
                                hist_data.append(snap[["ts_code", "high"]].copy())
                        except Exception:
                            pass

                    if hist_data:
                        hist_df = pd.concat(hist_data, ignore_index=True)
                        max_highs = hist_df.groupby("ts_code")["high"].max().reset_index()
                        max_highs.columns = ["ts_code", "max_high_250"]

                        candidates = candidates.merge(max_highs, on="ts_code", how="left")
                        candidates["is_new_high"] = candidates["close"] >= candidates.get("max_high_250", candidates["close"])
                    else:
                        # 降级：使用 close_250 作为近似
                        candidates["is_new_high"] = candidates["close"] >= (candidates.get("close_250", candidates["close"]) * 1.01)

                except Exception as exc:
                    logger.debug(f"计算250日最高价失败，使用降级方案: {exc}")
                    candidates["is_new_high"] = candidates["close"] >= (candidates.get("close_250", candidates["close"]) * 1.01)

                # 过滤创新高的股票
                high_stocks = candidates[candidates.get("is_new_high", False)].copy()

                if not high_stocks.empty:
                    new_highs = [
                        {
                            "tsCode": row["ts_code"],
                            "stockName": row.get("name", row["ts_code"]),
                            "close": round(float(row["close"]), 2),
                            "pctChg": round(float(row["pct_chg"]), 2),
                            "sectorName": row.get("sector_name", "未分类"),
                            "highlights": f"创250日新高，RPS20={round(float(row.get('rps20', 0)), 1)}"
                        }
                        for _, row in high_stocks.iterrows()
                    ]

            # 计算趋势数据（与历史对比）
            try:
                yesterday_stocks = self.compute_stock_metrics(yesterday)
                day_before_stocks = self.compute_stock_metrics(day_before)

                def _count_new_highs(stocks_df):
                    if stocks_df.empty:
                        return 0
                    # 简化版：以pct_chg > 9% 作为近似新高判断
                    return len(stocks_df[stocks_df["pct_chg"] > 9.0])

                today_count = len(new_highs)
                yesterday_count = _count_new_highs(yesterday_stocks)
                day_before_count = _count_new_highs(day_before_stocks)
            except Exception:
                today_count = len(new_highs)
                yesterday_count = 0
                day_before_count = 0

            return {
                "count": today_count,
                "trend": {
                    "today": today_count,
                    "yesterday": yesterday_count,
                    "dayBefore": day_before_count
                },
                "stocks": new_highs[:20]
            }

        except Exception as exc:
            logger.warning(f"计算创新高股票失败: {exc}")
            return {
                "count": 0,
                "trend": {"today": 0, "yesterday": 0, "dayBefore": 0},
                "stocks": []
            }

    def _recap_alerts(self, trade_date: str) -> dict[str, Any]:
        """异动预警：30日平均线偏离值"""
        try:
            stocks = self.compute_stock_metrics(trade_date)
            if stocks.empty:
                return {"items": []}

            alerts = []

            # 计算所有股票的 ma30（前19个交易日 + 今日）
            dates = self.trade_dates(trade_date, need=30)
            pos = dates.index(trade_date)
            ma30_dates = dates[pos - 19 : pos + 1]

            if len(ma30_dates) < 20:
                return {"items": []}

            # 批量加载30日数据
            snapshots = self.stock_snapshot_batch(ma30_dates)
            ma30_data = []
            for d in ma30_dates:
                snap = snapshots.get(d)
                if snap is not None and not snap.empty:
                    snap_copy = snap[["ts_code", "close"]].copy()
                    snap_copy["date"] = d
                    ma30_data.append(snap_copy)

            if not ma30_data:
                return {"items": []}

            ma30_df = pd.concat(ma30_data, ignore_index=True)
            ma30_pivot = ma30_df.pivot(index="ts_code", columns="date", values="close")
            ma30_series = ma30_pivot.mean(axis=1).reset_index()
            ma30_series.columns = ["ts_code", "ma30"]

            # 计算偏离值
            stocks = stocks.merge(ma30_series, on="ts_code", how="left")
            stocks["deviation"] = np.where(
                stocks["ma30"] > 0,
                (stocks["close"] - stocks["ma30"]) / stocks["ma30"] * 100,
                0
            )

            # 过滤严重偏离的股票（abs(deviation) > 20%）
            alert_stocks = stocks[abs(stocks["deviation"]) > 20].copy()

            if not alert_stocks.empty:
                alert_stocks = alert_stocks.sort_values("deviation", ascending=False)

                for _, row in alert_stocks.iterrows():
                    deviation = float(row["deviation"] or 0)
                    alert_type = f"30天涨幅偏离值{abs(deviation):.0f}%" if abs(deviation) > 0 else "30天平均线偏离"

                    alerts.append({
                        "tsCode": row["ts_code"],
                        "stockName": row.get("name", row["ts_code"]),
                        "close": round(float(row["close"]), 2),
                        "pctChg": round(float(row["pct_chg"]), 2),
                        "deviation": round(deviation, 1),
                        "sectorName": row.get("sector_name", "未分类"),
                        "alertType": alert_type
                    })

            return {"items": alerts[:20]}

        except Exception as exc:
            logger.warning(f"计算异动预警失败: {exc}")
            return {"items": []}
