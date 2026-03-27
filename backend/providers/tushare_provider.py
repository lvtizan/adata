#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tushare 数据源提供者

实现 BaseDataProvider 接口，封装 Tushare API 调用。
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

import pandas as pd
import tushare as ts

from .base import (
    BaseDataProvider,
    DataError,
    DataNotFoundError,
    NetworkError,
    RateLimitError,
    DailyBar,
    SectorInfo,
    SectorSnapshot,
    StockInfo,
    StockSnapshot,
)

logger = logging.getLogger(__name__)


class TushareProvider(BaseDataProvider):
    """Tushare 数据源提供者"""

    def __init__(self, token: str, http_url: str = ""):
        """初始化 Tushare 提供者

        Args:
            token: Tushare API Token
            http_url: 可选的代理 URL
        """
        self.token = token
        self.pro = ts.pro_api(token)
        # 必须设置这两项以支持代理
        self.pro._DataApi__token = token
        if http_url:
            self.pro._DataApi__http_url = http_url
            logger.info(f"使用 Tushare 代理: {http_url}")

        # 缓存
        self._stock_name_map: dict[str, str] | None = None
        self._sector_meta: dict[str, SectorInfo] | None = None
        self._sw_l3_map: dict[str, str] | None = None

    def _handle_error(self, err: Exception, context: str) -> None:
        """统一处理 Tushare 错误

        Args:
            err: 原始异常
            context: 错误上下文

        Raises:
            DataError: 根据错误类型转换为具体异常
        """
        err_msg = str(err)
        logger.warning(f"Tushare 错误 [{context}]: {err_msg}")

        if "达到请求上限" in err_msg or "请求过于频繁" in err_msg:
            raise RateLimitError(f"请求频率限制: {err_msg}")
        if "连接" in err_msg or "网络" in err_msg or "timeout" in err_msg.lower():
            raise NetworkError(f"网络连接失败: {err_msg}")
        if "没有权限" in err_msg or "积分" in err_msg:
            raise RateLimitError(f"API 权限不足: {err_msg}")

        raise DataError(f"{context}: {err_msg}")

    def get_trade_dates(self, end_date: str, lookback_days: int) -> list[str]:
        """获取交易日历"""
        try:
            start_date = (datetime.strptime(end_date, "%Y%m%d") - timedelta(days=lookback_days * 2)).strftime("%Y%m%d")
            df = self.pro.trade_cal(exchange="SSE", start_date=start_date, end_date=end_date)
            if df is None or df.empty:
                return []
            return df[df["is_open"] == 1]["cal_date"].tolist()[::-1][:lookback_days]
        except (DataError, RateLimitError, NetworkError):
            raise
        except Exception as e:
            self._handle_error(e, "获取交易日历")

    def get_stock_snapshot(self, trade_date: str) -> list[StockSnapshot]:
        """获取股票日线快照"""
        try:
            df = self.pro.daily(trade_date=trade_date)
            if df is None or df.empty:
                return []
            return [
                StockSnapshot(
                    ts_code=row["ts_code"],
                    trade_date=row["trade_date"],
                    open=row.get("open"),
                    high=row.get("high"),
                    low=row.get("low"),
                    close=row.get("close"),
                    volume=row.get("vol"),
                    amount=row.get("amount"),
                )
                for _, row in df.iterrows()
            ]
        except (DataError, RateLimitError, NetworkError):
            raise
        except Exception as e:
            self._handle_error(e, f"获取股票快照[{trade_date}]")

    def get_sector_snapshot(self, trade_date: str) -> list[SectorSnapshot]:
        """获取板块日线快照"""
        # 使用同花顺概念板块指数
        try:
            df = self.pro.thindex_daily(
                trade_date=trade_date,
                fields="ts_code,trade_date,open,high,low,close,vol,amount"
            )
            if df is None or df.empty:
                return []

            # 获取板块名称映射
            if self._sector_meta is None:
                self._sector_meta = self.get_sector_meta()

            return [
                SectorSnapshot(
                    sector_code=row["ts_code"],
                    sector_name=self._sector_meta.get(row["ts_code"], SectorInfo(row["ts_code"], "")).sector_name,
                    trade_date=row["trade_date"],
                    open=row.get("open"),
                    high=row.get("high"),
                    low=row.get("low"),
                    close=row.get("close"),
                    volume=row.get("vol"),
                    amount=row.get("amount"),
                )
                for _, row in df.iterrows()
            ]
        except (DataError, RateLimitError, NetworkError):
            raise
        except Exception as e:
            self._handle_error(e, f"获取板块快照[{trade_date}]")

    def get_stock_name_map(self) -> dict[str, str]:
        """获取股票代码到名称的映射"""
        if self._stock_name_map is not None:
            return self._stock_name_map

        try:
            df = self.pro.stock_basic(
                exchange="", list_status="L", fields="ts_code,name"
            )
            if df is None or df.empty:
                return {}
            self._stock_name_map = dict(zip(df["ts_code"], df["name"]))
            return self._stock_name_map
        except (DataError, RateLimitError, NetworkError):
            raise
        except Exception as e:
            self._handle_error(e, "获取股票名称映射")

    def get_sector_meta(self) -> dict[str, SectorInfo]:
        """获取板块元数据"""
        if self._sector_meta is not None:
            return self._sector_meta

        try:
            df = self.pro.thindex_basic(market="THS", fields="ts_code,name")
            if df is None or df.empty:
                return {}
            self._sector_meta = {
                row["ts_code"]: SectorInfo(row["ts_code"], row["name"])
                for _, row in df.iterrows()
            }
            return self._sector_meta
        except (DataError, RateLimitError, NetworkError):
            raise
        except Exception as e:
            self._handle_error(e, "获取板块元数据")

    def get_sw_l3_map(self) -> dict[str, str]:
        """获取申万三级行业分类映射"""
        if self._sw_l3_map is not None:
            return self._sw_l3_map

        try:
            df = self.pro.index_classify(
                level="L3", src="SW2021", fields="index_code,name"
            )
            if df is None or df.empty:
                return {}
            # 获取成分股映射
            self._sw_l3_map = {}
            for _, row in df.iterrows():
                index_code = row["index_code"]
                try:
                    members = self.pro.index_member(
                        index_code=index_code, fields="ts_code,index_code"
                    )
                    if members is not None and not members.empty:
                        for _, m in members.iterrows():
                            self._sw_l3_map[m["ts_code"]] = row["name"]
                except Exception:
                    continue  # 跳过获取成分股失败的板块
            return self._sw_l3_map
        except (DataError, RateLimitError, NetworkError):
            raise
        except Exception as e:
            self._handle_error(e, "获取申万三级行业映射")

    def get_sector_members(self, sector_code: str, trade_date: str) -> list[str]:
        """获取板块成分股"""
        try:
            # 使用同花顺概念板块成分股
            df = self.pro.ths_member(
                index_code=sector_code, fields="ts_code"
            )
            if df is None or df.empty:
                return []
            return df["ts_code"].tolist()
        except (DataError, RateLimitError, NetworkError):
            raise
        except Exception as e:
            self._handle_error(e, f"获取板块成分股[{sector_code}]")

    def get_stock_daily_bars(
        self, ts_code: str, start_date: str, end_date: str
    ) -> list[DailyBar]:
        """获取股票日线数据"""
        try:
            df = self.pro.daily(
                ts_code=ts_code, start_date=start_date, end_date=end_date
            )
            if df is None or df.empty:
                return []
            return [
                DailyBar(
                    time=row["trade_date"],
                    open=row.get("open"),
                    high=row.get("high"),
                    low=row.get("low"),
                    close=row.get("close"),
                    volume=row.get("vol"),
                    amount=row.get("amount"),
                )
                for _, row in df.iterrows()
            ]
        except (DataError, RateLimitError, NetworkError):
            raise
        except Exception as e:
            self._handle_error(e, f"获取股票日线[{ts_code}]")

    def get_sector_daily_bars(
        self, sector_code: str, start_date: str, end_date: str
    ) -> list[DailyBar]:
        """获取板块日线数据"""
        try:
            # 使用同花顺概念板块指数日线
            df = self.pro.thindex_daily(
                ts_code=sector_code, start_date=start_date, end_date=end_date
            )
            if df is None or df.empty:
                return []
            return [
                DailyBar(
                    time=row["trade_date"],
                    open=row.get("open"),
                    high=row.get("high"),
                    low=row.get("low"),
                    close=row.get("close"),
                    volume=row.get("vol"),
                    amount=row.get("amount"),
                )
                for _, row in df.iterrows()
            ]
        except (DataError, RateLimitError, NetworkError):
            raise
        except Exception as e:
            self._handle_error(e, f"获取板块日线[{sector_code}]")

    def get_latest_trade_date(self) -> str:
        """获取最新交易日期"""
        try:
            today = datetime.now().strftime("%Y%m%d")
            df = self.pro.trade_cal(
                exchange="SSE", start_date="20200101", end_date=today
            )
            if df is None or df.empty:
                return today
            # 找最近的开市日
            open_dates = df[df["is_open"] == 1]["cal_date"].tolist()
            return open_dates[-1] if open_dates else today
        except (DataError, RateLimitError, NetworkError):
            raise
        except Exception as e:
            self._handle_error(e, "获取最新交易日期")
