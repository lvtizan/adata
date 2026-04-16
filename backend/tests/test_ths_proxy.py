"""THS proxy 模块的测试。实际会发起网络请求，失败时可标记 skip。"""
import pytest
from ths_proxy import fetch_ths_sector_list, fetch_ths_sector_members


def test_fetch_ths_sector_list_has_common_sectors():
    """爬取板块列表，至少应包含常见行业如白酒/半导体/银行。"""
    result = fetch_ths_sector_list()
    assert isinstance(result, list)
    assert len(result) >= 50, f"expected >=50 sectors, got {len(result)}"
    # 常见板块应出现
    names = [s["name"] for s in result]
    # 白酒板块的 code 是 881273
    codes = [s["code"] for s in result]
    assert all(c.startswith("881") and len(c) == 6 for c in codes), \
        f"all codes should be 881xxx format"
    assert any("白酒" in n for n in names), f"expected 白酒 in names"
    assert any("半导体" in n for n in names), f"expected 半导体 in names"


def test_fetch_ths_sector_list_schema():
    """返回值 schema 正确。"""
    result = fetch_ths_sector_list()
    if not result:
        pytest.skip("empty result, possibly network issue")
    first = result[0]
    assert "code" in first
    assert "name" in first
    assert first["code"].startswith("881")


def test_fetch_ths_sector_members_baijiu():
    """白酒板块 881273 应有茅台、五粮液等。"""
    result = fetch_ths_sector_members("881273")
    assert isinstance(result, list)
    assert len(result) >= 10, f"expected >=10 members, got {len(result)}"
    codes = [m["code"] for m in result]
    assert "600519" in codes, f"expected 600519 (茅台) in {codes[:20]}"
    first = result[0]
    assert "code" in first and "name" in first and "price" in first
    assert "pctChange" in first and "amount" in first
    # 价格、涨跌幅、成交额应在合理范围
    assert first["price"] > 0, f"price should be positive, got {first['price']}"
    assert -20 <= first["pctChange"] <= 20, f"pctChange out of range: {first['pctChange']}"
    assert first["amount"] >= 0, f"amount should be non-negative, got {first['amount']}"


def test_fetch_ths_sector_members_invalid_code():
    """非法 sector_code 应返回空。"""
    assert fetch_ths_sector_members("") == []
    assert fetch_ths_sector_members("000001") == []  # 非 881
    assert fetch_ths_sector_members("abc") == []


def test_parse_amount():
    """金额单位解析。"""
    from ths_proxy import _parse_amount
    assert _parse_amount("1.23亿") == 1.23e8
    assert _parse_amount("5.6万") == 5.6e4
    assert _parse_amount("--") == 0.0
    assert _parse_amount("") == 0.0
    assert _parse_amount("1,234.5") == 1234.5
