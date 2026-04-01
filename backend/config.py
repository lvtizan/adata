#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""配置管理模块"""
from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

DEFAULT_CONFIG_FILE = Path(__file__).parent / "config.yaml"

# 自动加载 .env 文件
ENV_FILE = Path(__file__).parent / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)
    print(f"✅ 已加载配置文件: {ENV_FILE}")


@dataclass
class Rules:
    """选股规则配置"""
    sector_amount_min: float = 80_000_000_000.0  # 800亿
    stock_amount_min: float = 800_000_000.0  # 8亿
    stock_rps_min: float = 80.0
    require_sector_above_ma30: bool = False
    require_above_ma20: bool = True
    intraday_sector_min_stocks: int = 5  # 盘中观察：板块最少成分股数
    excluded_sector_keywords: list[str] = field(
        default_factory=lambda: [
            "ST",
            "退市",
            "养猪",
            "猪肉",
            "猪产业",
            "鸡肉",
            "养鸡",
            "饲料",
            "动物保健",
            "环保",
            "污水处理",
            "垃圾分类",
            "园林",
        ]
    )


@dataclass
class ServerConfig:
    """服务器配置"""
    host: str = "127.0.0.1"
    port: int = 8080
    debug: bool = False


@dataclass
class CacheConfig:
    """缓存配置"""
    snapshot_ttl: int = 600  # 10分钟
    name_map_ttl: int = 86400  # 24小时
    max_batch_cache: int = 5
    max_cache_size: int = 1000
    latest_data_trade_date_ttl: int = 900  # 15分钟
    warmup_snapshot_days: int = 0


@dataclass
class LogConfig:
    """日志配置"""
    level: str = "INFO"
    log_file: str = "logs/app.log"
    max_bytes: int = 10 * 1024 * 1024  # 10MB
    backup_count: int = 3


class Config:
    """全局配置管理器"""

    def __init__(self, config_path: str | None = None):
        resolved_config = Path(config_path) if config_path else DEFAULT_CONFIG_FILE
        self._config_path = str(resolved_config)
        self._raw_config: dict[str, Any] = {}

        # 验证必要的环境变量
        self._validate_env()

        # 加载配置文件
        if resolved_config.exists():
            self._load_yaml(str(resolved_config))

        # 初始化各模块配置
        self.rules = self._load_rules()
        self.server = self._load_server()
        self.cache = self._load_cache()
        self.log = self._load_log()

    def _validate_env(self):
        """验证必要的环境变量"""
        self.tushare_token = os.getenv("TUSHARE_TOKEN")
        if not self.tushare_token:
            raise ValueError(
                "❌ 未设置 TUSHARE_TOKEN 环境变量\n"
                "请设置: export TUSHARE_TOKEN='your_token_here'\n"
                "或在 .env 文件中配置"
            )

        self.tushare_http_url = os.getenv("TUSHARE_HTTP_URL", "")

    def _load_yaml(self, path: str):
        """从YAML文件加载配置"""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                self._raw_config = yaml.safe_load(f) or {}
        except Exception as e:
            logging.warning(f"Failed to load config file {path}: {e}")

    def _load_rules(self) -> Rules:
        """加载规则配置"""
        rules_config = self._raw_config.get("rules", {})
        return Rules(**{k: v for k, v in rules_config.items() if k in Rules.__dataclass_fields__})

    def _load_server(self) -> ServerConfig:
        """加载服务器配置"""
        server_config = self._raw_config.get("server", {})
        # 环境变量优先
        host = os.getenv("HOST") or server_config.get("host", "127.0.0.1")
        port = int(os.getenv("PORT") or server_config.get("port", 8080))
        debug = os.getenv("DEBUG", "").lower() in ("true", "1", "yes")
        return ServerConfig(host=host, port=port, debug=debug)

    def _load_cache(self) -> CacheConfig:
        """加载缓存配置"""
        cache_config = self._raw_config.get("cache", {})
        return CacheConfig(**{k: v for k, v in cache_config.items() if k in CacheConfig.__dataclass_fields__})

    def _load_log(self) -> LogConfig:
        """加载日志配置"""
        log_config = self._raw_config.get("logging", {})
        return LogConfig(**{k: v for k, v in log_config.items() if k in LogConfig.__dataclass_fields__})


def setup_logging(config: LogConfig):
    """配置日志系统"""
    # 确保日志目录存在
    log_path = Path(config.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    # 配置日志格式
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # 文件处理器（带轮转）
    from logging.handlers import RotatingFileHandler
    file_handler = RotatingFileHandler(
        config.log_file,
        maxBytes=config.max_bytes,
        backupCount=config.backup_count,
        encoding='utf-8'
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.DEBUG)

    # 控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(getattr(logging, config.level))

    # 配置根日志器
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    return root_logger


# 全局配置实例
_config: Config | None = None


def get_config(config_path: str | None = None) -> Config:
    """获取全局配置实例"""
    global _config
    if _config is None:
        _config = Config(config_path)
    return _config


def init_logging():
    """初始化日志系统"""
    config = get_config()
    return setup_logging(config.log)
