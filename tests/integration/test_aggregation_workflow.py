"""
Integration tests for aggregation workflow.
"""
import pytest
import json
from pathlib import Path
from datetime import datetime, timedelta
from scripts.aggregate_data import generate_summary


class TestAggregationWorkflow:
    """End-to-end tests for data aggregation workflow."""
    
    def test_complete_aggregation_workflow(self, temp_database, tmp_path):
        """Test complete workflow from raw data to summary generation."""
        # Setup: Create realistic dataset
        room_id = "53463"
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        # Create 30 days of realistic data
        initial_balance = 150.0
        daily_consumption = 5.0
        
        for days_ago in range(30):
            date = datetime.now() - timedelta(days=days_ago)
            date_str = date.strftime("%Y%m%d")
            
            file = campus_dir / f"{date_str}.json"
            balance = initial_balance + (days_ago * daily_consumption)
            
            data = {
                "id": room_id,
                "校区": "仙林校区",
                "楼栋": "19幢",
                "房间": "19栋第16层1613",
                "宿舍ID": room_id,
                "剩余电量": f"{balance}度",
                "timestamp": date.isoformat(),
                "success": True
            }
            
            with open(file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        
        # Execute: Generate summary
        summary = generate_summary(str(temp_database))
        
        # Verify: Summary structure
        assert summary is not None
        assert 'generated_at' in summary
        assert 'rooms' in summary
        assert room_id in summary['rooms']
        
        room_stats = summary['rooms'][room_id]
        
        # Verify: Statistics accuracy
        assert room_stats['current_balance'] == initial_balance  # Most recent (today)
        assert room_stats['min_30d'] == initial_balance
        assert room_stats['max_30d'] == initial_balance + (29 * daily_consumption)
        
        # Verify: Trend direction (negative because balance decreasing backwards in time)
        # Note: trend is calculated from oldest to newest, so increasing balance = positive trend
        assert room_stats['trend_30d'] > 0  # Balance increases as we go back in time
        
        # Verify: Metadata
        assert summary['total_rooms'] == 1
        assert summary['query_success_rate'] == 1.0
    
    def test_aggregation_handles_missing_days(self, temp_database):
        """Test that aggregation handles gaps in data."""
        room_id = "53463"
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        # Create sparse data (every other day)
        for days_ago in range(0, 30, 2):
            date = datetime.now() - timedelta(days=days_ago)
            date_str = date.strftime("%Y%m%d")
            
            file = campus_dir / f"{date_str}.json"
            
            with open(file, 'w') as f:
                json.dump({
                    "id": room_id,
                    "剩余电量": f"{100.0 + days_ago}度",
                    "校区": "仙林校区",
                    "楼栋": "19幢",
                    "房间": "19栋第16层1613",
                    "timestamp": date.isoformat(),
                    "success": True
                }, f)
        
        # Should still generate summary
        summary = generate_summary(str(temp_database))
        
        assert summary is not None
        assert room_id in summary['rooms']
        assert summary['rooms'][room_id]['current_balance'] == 100.0
    
    def test_aggregation_performance(self, temp_database):
        """Test that aggregation completes within time limit."""
        import time
        
        # Create data for 100 rooms with 30 days each
        for i in range(100):
            room_id = f"53{str(i).zfill(3)}"
            campus_dir = temp_database / "仙林校区" / "19幢" / f"Room-{room_id}"
            campus_dir.mkdir(parents=True, exist_ok=True)
            
            for days_ago in range(30):
                date = datetime.now() - timedelta(days=days_ago)
                date_str = date.strftime("%Y%m%d")
                
                file = campus_dir / f"{date_str}.json"
                
                with open(file, 'w') as f:
                    json.dump({
                        "id": room_id,
                        "剩余电量": f"{100.0}度",
                        "校区": "仙林校区",
                        "楼栋": "19幢",
                        "房间": f"Room-{room_id}",
                        "timestamp": date.isoformat(),
                        "success": True
                    }, f)
        
        start_time = time.time()
        summary = generate_summary(str(temp_database))
        elapsed = time.time() - start_time
        
        assert summary is not None
        assert summary['total_rooms'] == 100 or summary['total_rooms'] == 101  # May include fixture room
        assert elapsed < 30  # Should complete within 30 seconds
    
    def test_aggregation_schema_validation(self, temp_database, tmp_path):
        """Test that generated summary matches schema."""
        import jsonschema
        
        room_id = "53463"
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        # Create sample data
        for days_ago in range(7):
            date = datetime.now() - timedelta(days=days_ago)
            date_str = date.strftime("%Y%m%d")
            
            file = campus_dir / f"{date_str}.json"
            
            with open(file, 'w') as f:
                json.dump({
                    "id": room_id,
                    "剩余电量": f"{100.0}度",
                    "校区": "仙林校区",
                    "楼栋": "19幢",
                    "房间": "19栋第16层1613",
                    "timestamp": date.isoformat(),
                    "success": True
                }, f)
        
        # Generate summary
        summary = generate_summary(str(temp_database))
        
        # Load schema
        schema_file = Path("tests/schemas/summary.schema.json")
        with open(schema_file, 'r') as f:
            schema = json.load(f)
        
        # Validate
        try:
            jsonschema.validate(instance=summary, schema=schema)
            valid = True
        except jsonschema.ValidationError:
            valid = False
        
        assert valid, "Generated summary does not match schema"
