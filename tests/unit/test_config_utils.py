"""Tests for config_utils.py"""
import json
import pytest
from pathlib import Path
from scripts.config_utils import (
    load_mapping,
    save_mapping,
    extract_ids,
    is_room_known,
    update_id,
    CampusMapping,
)

SAMPLE_MAPPING: CampusMapping = {
    "仙林校区": {
        "19幢": {
            "19栋第16层1613": "103407",
            "19栋第16层1614": "102385",
        },
    },
    "苏州校区": {
        "仁园-戊": {
            "戊504": "99876",
        },
    },
}


class TestLoadMapping:
    def test_load_existing_file(self, tmp_path: Path):
        f = tmp_path / "test.json"
        f.write_text(json.dumps(SAMPLE_MAPPING, ensure_ascii=False), encoding="utf-8")
        result = load_mapping(f)
        assert result == SAMPLE_MAPPING

    def test_file_not_exists(self, tmp_path: Path):
        result = load_mapping(tmp_path / "nonexistent.json")
        assert result == {}

    def test_invalid_json(self, tmp_path: Path):
        f = tmp_path / "bad.json"
        f.write_text("{invalid", encoding="utf-8")
        result = load_mapping(f)
        assert result == {}


class TestSaveMapping:
    def test_save_and_reload(self, tmp_path: Path):
        f = tmp_path / "output.json"
        save_mapping(SAMPLE_MAPPING, f)
        assert f.exists()
        with open(f, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        assert data == SAMPLE_MAPPING


class TestExtractIds:
    def test_extract_all_ids(self):
        ids = extract_ids(SAMPLE_MAPPING)
        assert sorted(ids) == ["102385", "103407", "99876"]

    def test_empty_mapping(self):
        assert extract_ids({}) == []

    def test_deduplicates(self):
        dup = {
            "仙林校区": {
                "19幢": {"1613": "12345"},
                "20幢": {"201": "12345"},
            }
        }
        assert extract_ids(dup) == ["12345"]


class TestIsRoomKnown:
    def test_known_room(self):
        assert is_room_known(SAMPLE_MAPPING, "仙林校区", "19幢", "19栋第16层1613") is True

    def test_unknown_campus(self):
        assert is_room_known(SAMPLE_MAPPING, "鼓楼校区", "1幢", "101") is False

    def test_unknown_building(self):
        assert is_room_known(SAMPLE_MAPPING, "仙林校区", "99幢", "101") is False

    def test_unknown_room(self):
        assert is_room_known(SAMPLE_MAPPING, "仙林校区", "19幢", "9999") is False


class TestUpdateId:
    def test_add_new_room(self):
        m: CampusMapping = {}
        result = update_id(m, "仙林校区", "1幢", "1A101", "101223")
        assert result is True
        assert m["仙林校区"]["1幢"]["1A101"] == "101223"

    def test_replace_existing_id(self):
        m: CampusMapping = {"仙林校区": {"1幢": {"1A101": "old_id"}}}
        result = update_id(m, "仙林校区", "1幢", "1A101", "new_id")
        assert result is False
        assert m["仙林校区"]["1幢"]["1A101"] == "new_id"
