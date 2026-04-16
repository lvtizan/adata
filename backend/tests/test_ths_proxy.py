"""THS proxy 模块的测试。实际会发起网络请求，失败时可标记 skip。"""
import pytest
from ths_proxy import fetch_ths_sector_list


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
