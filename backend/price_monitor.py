"""盘中价格监控 — 轮询实时价格，到价发微信通知（PushPlus / 企业微信）"""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime
from typing import Any, Callable

import requests

logger = logging.getLogger(__name__)


def _is_trading_hours() -> bool:
    """判断当前是否为A股交易时段（工作日 9:30-11:30, 13:00-15:00）"""
    now = datetime.now()
    if now.weekday() >= 5:  # 周六日
        return False
    t = now.hour * 100 + now.minute
    return (930 <= t <= 1130) or (1300 <= t <= 1500)


def _fetch_realtime_prices(ts_codes: list[str]) -> dict[str, float]:
    """用 AKShare 批量获取实时价格，返回 {ts_code: current_price}"""
    try:
        import akshare as ak
        df = ak.stock_zh_a_spot_em()
        if df is None or df.empty:
            return {}
        # AKShare 返回的代码是纯数字，需要转换
        # ts_code 格式: 000001.SZ → 代码 000001
        code_map: dict[str, str] = {}
        for tc in ts_codes:
            pure_code = tc.split(".")[0]
            code_map[pure_code] = tc

        result: dict[str, float] = {}
        for _, row in df.iterrows():
            code = str(row.get("代码", ""))
            if code in code_map:
                price = row.get("最新价")
                if price and float(price) > 0:
                    result[code_map[code]] = float(price)
        return result
    except Exception as exc:
        logger.warning(f"获取实时价格失败: {exc}")
        return {}


def _check_alert(alert: dict[str, Any], current_price: float) -> str | None:
    """检查价格是否触发预警，返回触发类型或 None"""
    sl = alert.get("stopLoss")
    tp = alert.get("takeProfit")
    entry = alert.get("entryPrice")

    # 止损最优先
    if sl and current_price <= sl:
        return "sl"
    # 止盈
    if tp and current_price >= tp:
        return "tp"
    # 到达入场价
    if entry and current_price <= entry:
        return "entry"
    return None


def _build_message(alert: dict[str, Any], triggered_type: str, current_price: float) -> tuple[str, str]:
    type_labels = {"entry": "到达入场价", "sl": "触发止损", "tp": "触发止盈"}
    label = type_labels.get(triggered_type, triggered_type)
    stock_name = alert.get("stockName", "")
    ts_code = alert.get("tsCode", "")
    entry = alert.get("entryPrice", 0)
    sl = alert.get("stopLoss", 0)
    tp = alert.get("takeProfit", 0)
    title = f"价格预警 · {label}"
    content = (
        f"**{title}**\n"
        f"> 股票: {stock_name}（{ts_code}）\n"
        f"> 当前价: <font color=\"warning\">{current_price}</font>\n"
        f"> 入场价: {entry}\n"
        f"> 止损价: {sl}\n"
        f"> 止盈价: {tp}\n"
        f"> 时间: {datetime.now().strftime('%H:%M:%S')}"
    )
    return title, content


def _send_wechat(webhook_url: str, alert: dict[str, Any], triggered_type: str, current_price: float) -> bool:
    """发送企业微信群机器人消息"""
    title, content = _build_message(alert, triggered_type, current_price)

    try:
        resp = requests.post(
            webhook_url,
            json={"msgtype": "markdown", "markdown": {"content": content}},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("errcode") == 0:
                logger.info(f"企业微信通知发送成功: {title}")
                return True
            logger.warning(f"企业微信返回错误: {data}")
        else:
            logger.warning(f"企业微信请求失败: HTTP {resp.status_code}")
    except Exception as exc:
        logger.warning(f"发送通知异常: {exc}")
    return False


def _send_pushplus(token: str, alert: dict[str, Any], triggered_type: str, current_price: float) -> bool:
    """发送 PushPlus 微信通知"""
    title, content = _build_message(alert, triggered_type, current_price)
    try:
        resp = requests.post(
            "https://www.pushplus.plus/send",
            json={
                "token": token,
                "title": title,
                "content": content,
                "template": "markdown",
            },
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("code") == 200:
                logger.info(f"PushPlus 通知发送成功: {title}")
                return True
            logger.warning(f"PushPlus 返回错误: {data}")
        else:
            logger.warning(f"PushPlus 请求失败: HTTP {resp.status_code}")
    except Exception as exc:
        logger.warning(f"PushPlus 发送异常: {exc}")
    return False


class PriceMonitor:
    """盘中价格监控线程"""

    def __init__(
        self,
        alert_store: Any,
        notify_config_getter: Callable[[], dict[str, str]],
        enabled_getter: Callable[[], bool] | None = None,
        interval: int = 10,
    ) -> None:
        self.alert_store = alert_store
        self.get_notify_config = notify_config_getter
        self.get_enabled = enabled_getter or (lambda: True)
        self.interval = interval
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="PriceMonitor")
        self._thread.start()
        logger.info("价格监控线程已启动")

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("价格监控线程已停止")

    @property
    def alive(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def _loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                if _is_trading_hours():
                    self._check_once()
            except Exception as exc:
                logger.error(f"价格监控异常: {exc}", exc_info=True)
            self._stop_event.wait(self.interval)

    def _check_once(self) -> None:
        if not self.get_enabled():
            return
        alerts = self.alert_store.get_active_alerts()
        if not alerts:
            return

        ts_codes = list({a["tsCode"] for a in alerts})
        prices = _fetch_realtime_prices(ts_codes)
        if not prices:
            return

        notify_cfg = self.get_notify_config()
        pushplus_token = notify_cfg.get("pushplus_token", "")
        webhook_url = notify_cfg.get("webhook_url", "")

        for alert in alerts:
            price = prices.get(alert["tsCode"])
            if price is None:
                continue
            triggered = _check_alert(alert, price)
            if not triggered:
                continue

            # 更新状态
            status = f"triggered_{triggered}"
            self.alert_store.update_status(alert["id"], status, triggered)
            logger.info(f"预警触发: {alert['stockName']} {triggered} @ {price}")

            # 发通知
            if pushplus_token:
                _send_pushplus(pushplus_token, alert, triggered, price)
                continue
            if webhook_url:
                _send_wechat(webhook_url, alert, triggered, price)
                continue
            logger.warning("未配置 PushPlus Token / 企业微信 Webhook，跳过通知")
