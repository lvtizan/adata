import tempfile
from pathlib import Path
from my_sectors_store import MySectorsStore


def test_add_and_list():
    with tempfile.TemporaryDirectory() as td:
        store = MySectorsStore(Path(td) / "test.db")
        assert store.list() == []
        store.add("881273", "白酒")
        store.add("881121", "半导体")
        items = store.list()
        assert len(items) == 2
        codes = {x["code"] for x in items}
        assert codes == {"881273", "881121"}


def test_add_replaces_existing():
    with tempfile.TemporaryDirectory() as td:
        store = MySectorsStore(Path(td) / "test.db")
        store.add("881273", "白酒")
        store.add("881273", "白酒2")  # 重复添加，replace
        items = store.list()
        assert len(items) == 1
        assert items[0]["name"] == "白酒2"


def test_remove():
    with tempfile.TemporaryDirectory() as td:
        store = MySectorsStore(Path(td) / "test.db")
        store.add("881273", "白酒")
        store.add("881121", "半导体")
        store.remove("881273")
        assert len(store.list()) == 1
        assert store.list()[0]["code"] == "881121"


def test_contains():
    with tempfile.TemporaryDirectory() as td:
        store = MySectorsStore(Path(td) / "test.db")
        assert not store.contains("881273")
        store.add("881273", "白酒")
        assert store.contains("881273")
        store.remove("881273")
        assert not store.contains("881273")


def test_add_whitespace_ignored():
    with tempfile.TemporaryDirectory() as td:
        store = MySectorsStore(Path(td) / "test.db")
        store.add("  ", "name")
        store.add("881273", "  ")
        assert store.list() == []
