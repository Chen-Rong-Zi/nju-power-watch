import asyncio
import json

from scripts.aggregate_data import (
    build_daily_analysis,
    generate_hierarchical_summaries,
)


def _write_daily_record(room_dir, date_str, balance):
    file_path = room_dir / f"{date_str}.json"
    payload = {
        "id": "28053",
        "校区": "鼓楼校区",
        "楼栋": "西苑留学生楼",
        "房间": "1002房间",
        "宿舍ID": "28053",
        "剩余电量": f"{balance}度",
        "timestamp": f"{date_str}T02:00:00Z",
        "success": True
    }
    with open(file_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)


def test_build_daily_analysis_flags_balance_increase():
    analysis = build_daily_analysis({
        "20260522": 83.99,
        "20260523": 536.23,
        "20260524": 530.79,
    })

    assert analysis["20260522"]["confidence"] == "low"
    assert analysis["20260522"]["anomaly_type"] == "insufficient_history"
    assert analysis["20260522"]["exclude_from_aggregation"] is True

    assert analysis["20260523"]["confidence"] == "low"
    assert analysis["20260523"]["anomaly_type"] == "credit_or_adjustment"
    assert analysis["20260523"]["exclude_from_aggregation"] is True
    assert analysis["20260523"]["inferred_consumption"] is None
    assert analysis["20260523"]["reason_codes"] == ["balance_increase"]

    assert analysis["20260524"]["confidence"] == "high"
    assert analysis["20260524"]["exclude_from_aggregation"] is False
    assert analysis["20260524"]["inferred_consumption"] == 5.44


def test_generate_hierarchical_summaries_persists_daily_analysis(tmp_path):
    database_dir = tmp_path / "database"
    room_dir = database_dir / "鼓楼校区" / "西苑留学生楼" / "1002房间-28053"
    room_dir.mkdir(parents=True, exist_ok=True)

    _write_daily_record(room_dir, "20260522", 83.99)
    _write_daily_record(room_dir, "20260523", 536.23)
    _write_daily_record(room_dir, "20260524", 530.79)

    output_dir = database_dir / "summaries"
    overview = asyncio.run(
        generate_hierarchical_summaries(
            str(database_dir),
            str(output_dir),
            merge_existing=False,
        )
    )

    assert overview["total_rooms"] == 1

    room_summary_path = (
        output_dir
        / "campuses"
        / "鼓楼校区"
        / "buildings"
        / "西苑留学生楼"
        / "rooms"
        / "1002房间-28053.json"
    )
    with open(room_summary_path, "r", encoding="utf-8") as fh:
        room_summary = json.load(fh)

    assert "daily_analysis" in room_summary
    assert room_summary["daily_analysis"]["20260523"]["anomaly_type"] == "credit_or_adjustment"
    assert room_summary["daily_analysis"]["20260523"]["exclude_from_aggregation"] is True
    assert room_summary["daily_analysis"]["20260524"]["inferred_consumption"] == 5.44
