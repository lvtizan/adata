"""板块 RS120 计算测试。"""
import pytest
from ths_sector_strength import compute_sector_rs120


def test_compute_empty():
    assert compute_sector_rs120({}) == {}


def test_compute_single_sector():
    # 单板块 → 50 百分位
    assert compute_sector_rs120({"881A": [100.0, 110.0]}) == {"881A": 50}


def test_compute_two_sectors_extreme():
    # A 涨 50%，B 涨 10%
    result = compute_sector_rs120({
        "881A": [100.0, 150.0],
        "881B": [100.0, 110.0],
    })
    assert result["881A"] == 100
    assert result["881B"] == 0


def test_compute_three_sectors_middle():
    # A 跌 10%, B 涨 5%, C 涨 20%
    result = compute_sector_rs120({
        "881A": [100.0, 90.0],
        "881B": [100.0, 105.0],
        "881C": [100.0, 120.0],
    })
    # 排序后：A < B < C → 百分位 0 / 50 / 100
    assert result["881A"] == 0
    assert result["881B"] == 50
    assert result["881C"] == 100


def test_compute_skip_insufficient_data():
    # 数据不足或异常被跳过
    result = compute_sector_rs120({
        "881A": [100.0, 110.0],
        "881B": [100.0],       # 只有 1 个
        "881C": [0.0, 100.0],  # 起始为 0
    })
    # B 和 C 被跳过，只剩 A → 单板块 50
    assert result == {"881A": 50}


def test_compute_preserves_extremes():
    """4 板块：百分位应该是 0, 33, 67, 100。"""
    result = compute_sector_rs120({
        "881A": [100.0, 90.0],
        "881B": [100.0, 100.0],
        "881C": [100.0, 110.0],
        "881D": [100.0, 130.0],
    })
    values = sorted(result.values())
    assert values[0] == 0
    assert values[-1] == 100
    assert 30 <= values[1] <= 40  # round(1/3*100) = 33
    assert 60 <= values[2] <= 70  # round(2/3*100) = 67
