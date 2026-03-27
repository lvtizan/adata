#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数据源抽象接口

定义所有数据源提供者必须实现的接口，使业务层不依赖具体实现。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from typing import Any


class DataError(Exception):
    """数据获取错误基类"""
    pass


class DataNotFoundError(DataError):
    """数据不存在"""
    pass


class NetworkError(DataError):
    """网络连接错误"""
    pass


class RateLimitError(DataError):
    """请求频率限制"""
    pass


@dataclass
class TradeDate:
    """交易日"""
    trade_date: str  # YYYYMMDD 格式


@dataclass
class StockSnapshot:
    """股票日线快照"""
    ts_code: str  # 股票代码
    trade_date: str  # 交易日期 YYYYMMDD
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: float | None
    amount: float | None


@dataclass
class SectorSnapshot:
    """板块日线快照"""
    sector_code: str  # 板块代码
    sector_name: str  # 板块名称
    trade_date: str  # 交易日期
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: float | None
    amount: float | None


@dataclass
class DailyBar:
    """日线数据"""
    time: str  # YYYYMMDD
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: float | None
    amount: float | None


@dataclass
class StockInfo:
    """股票基本信息"""
    ts_code: str
    stock_name: str


@dataclass
class SectorInfo:
    """板块基本信息"""
    sector_code: str
    sector_name: str


class BaseDataProvider(ABC):
    """数据源提供者抽象基类

    所有数据源实现必须继承此类并实现所有抽象方法。
    业务层只依赖此接口，不关心具体数据来源。
    """

    @abstractmethod
    def get_trade_dates(
        self, end_date: str, lookback_days: int
    ) -> list[str]:
        """获取交易日历

        Args:
            end_date: 结束日期 YYYYMMDD
            lookback_days: 向前查找的天数

        Returns:
            交易日期列表，按时间升序排列

        Raises:
            DataError: 数据获取失败
        """
        pass

    @abstractmethod
    def get_stock_snapshot(self, trade_date: str) -> list[StockSnapshot]:
        """获取股票日线快照

        Args:
            trade_date: 交易日期 YYYYMMDD

        Returns:
            股票快照列表

        Raises:
            DataError: 数据获取失败
        """
        pass

    @abstractmethod
    def get_sector_snapshot(self, trade_date: str) -> list[SectorSnapshot]:
        """获取板块日线快照

        Args:
            trade_date: 交易日期 YYYYMMDD

        Returns:
            板块快照列表

        Raises:
            DataError: 数据获取失败
        """
        pass

    @abstractmethod
    def get_stock_name_map(self) -> dict[str, str]:
        """获取股票代码到名称的映射

        Returns:
            {ts_code: stock_name} 字典
        """
        pass

    @abstractmethod
    def get_sector_meta(self) -> dict[str, SectorInfo]:
        """获取板块元数据

        Returns:
            {sector_code: SectorInfo} 字典
        """
        pass

    @abstractmethod
    def get_sw_l3_map(self) -> dict[str, str]:
        """获取申万三级行业分类映射

        Returns:
            {ts_code: sw_l3_name} 字典
        """
        pass

    @abstractmethod
    def get_sector_members(
        self, sector_code: str, trade_date: str
    ) -> list[str]:
        """获取板块成分股

        Args:
            sector_code: 板块代码
            trade_date: 交易日期

        Returns:
            股票代码列表
        """
        pass

    @abstractmethod
    def get_stock_daily_bars(
        self, ts_code: str, start_date: str, end_date: str
    ) -> list[DailyBar]:
        """获取股票日线数据

        Args:
            ts_code: 股票代码
            start_date: 开始日期 YYYYMMDD
            end_date: 结束日期 YYYYMMDD

        Returns:
            日线数据列表，按时间升序
        """
        pass

    @abstractmethod
    def get_sector_daily_bars(
        self, sector_code: str, start_date: str, end_date: str
    ) -> list[DailyBar]:
        """获取板块日线数据

        Args:
            sector_code: 板块代码
            start_date: 开始日期 YYYYMMDD
            end_date: 结束日期 YYYYMMDD

        Returns:
            日线数据列表，按时间升序
        """
        pass

    @abstractmethod
    def get_latest_trade_date(self) -> str:
        """获取最新交易日期

        Returns:
            最新交易日期 YYYYMMDD
        """
        pass
