"""
Tests for aggregate_data.py script.
"""
import pytest
import json
from pathlib import Path
from datetime import datetime, timedelta
from scripts.aggregate_data import (
    load_room_data,
    compute_statistics,
    generate_summary
)


class TestLoadRoomData:
    """Test cases for loading room data."""
    
    def test_load_single_room_data(self, temp_database):
        """Test loading data for a single room."""
        room_id = "53463"
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        # Create multiple days of data
        for days_ago in range(10):
            date = datetime.now() - timedelta(days=days_ago)
            date_str = date.strftime("%Y%m%d")
            
            file = campus_dir / f"{date_str}.json"
            balance = 100.0 + days_ago
            
            data = {
                "id": room_id,
                "剩余电量": f"{balance}度",
                "timestamp": date.isoformat(),
                "success": True
            }
            
            with open(file, 'w', encoding='utf-8') as f:
                json.dump(data, f)
        
        df = load_room_data(str(temp_database), room_id)
        
        assert df is not None
        assert len(df) == 10
        assert 'balance' in df.columns
    
    def test_load_room_with_no_data_returns_none(self, temp_database):
        """Test that missing room data returns None."""
        df = load_room_data(str(temp_database), "nonexistent")
        assert df is None
    
    def test_load_room_filters_failed_queries(self, temp_database):
        """Test that failed queries are excluded."""
        room_id = "53463"
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        # Create successful query
        success_file = campus_dir / "20260515.json"
        with open(success_file, 'w') as f:
            json.dump({
                "id": room_id,
                "剩余电量": "100.0度",
                "success": True
            }, f)
        
        # Create failed query
        failed_file = campus_dir / "20260514.json"
        with open(failed_file, 'w') as f:
            json.dump({
                "id": room_id,
                "success": False
            }, f)
        
        df = load_room_data(str(temp_database), room_id)
        
        assert df is not None
        assert len(df) == 1  # Only successful query


class TestComputeStatistics:
    """Test cases for computing statistics."""
    
    def test_compute_statistics_full_data(self, temp_database):
        """Test computing statistics with full 30 days of data."""
        import pandas as pd
        import numpy as np
        
        room_id = "53463"
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        # Create 30 days of data with increasing balance
        for days_ago in range(30):
            date = datetime.now() - timedelta(days=days_ago)
            date_str = date.strftime("%Y%m%d")
            
            file = campus_dir / f"{date_str}.json"
            balance = 100.0 + days_ago
            
            with open(file, 'w') as f:
                json.dump({
                    "id": room_id,
                    "剩余电量": f"{balance}度",
                    "校区": "仙林校区",
                    "楼栋": "19幢",
                    "房间": "19栋第16层1613",
                    "timestamp": date.isoformat(),
                    "success": True
                }, f)
        
        df = load_room_data(str(temp_database), room_id)
        stats = compute_statistics(df, room_id, str(temp_database))
        
        assert stats is not None
        assert 'current_balance' in stats
        assert 'avg_7d' in stats
        assert 'avg_30d' in stats
        assert 'trend_30d' in stats
        assert 'min_30d' in stats
        assert 'max_30d' in stats
        
        # Verify current balance is most recent
        assert stats['current_balance'] == 100.0  # Most recent (days_ago=0)
        
        # Verify min/max
        assert stats['min_30d'] == 100.0
        assert stats['max_30d'] == 129.0
    
    def test_compute_statistics_partial_data(self, temp_database):
        """Test computing statistics with partial data (< 30 days)."""
        room_id = "53463"
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        # Create only 5 days of data
        for days_ago in range(5):
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
        
        df = load_room_data(str(temp_database), room_id)
        stats = compute_statistics(df, room_id, str(temp_database))
        
        assert stats is not None
        # Should still compute even with partial data
        assert 'current_balance' in stats
        assert 'avg_7d' in stats
    
    def test_compute_trend_negative(self, temp_database):
        """Test that trend is negative when balance decreases."""
        room_id = "53463"
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        # Create data with decreasing balance
        for days_ago in range(10):
            date = datetime.now() - timedelta(days=days_ago)
            date_str = date.strftime("%Y%m%d")
            
            file = campus_dir / f"{date_str}.json"
            balance = 150.0 - days_ago * 5  # Decreasing
            
            with open(file, 'w') as f:
                json.dump({
                    "id": room_id,
                    "剩余电量": f"{balance}度",
                    "校区": "仙林校区",
                    "楼栋": "19幢",
                    "房间": "19栋第16层1613",
                    "timestamp": date.isoformat(),
                    "success": True
                }, f)
        
        df = load_room_data(str(temp_database), room_id)
        stats = compute_statistics(df, room_id, str(temp_database))
        
        assert stats['trend_30d'] < 0  # Negative trend


class TestGenerateSummary:
    """Test cases for generating complete summary."""
    
    def test_generate_summary_multiple_rooms(self, temp_database):
        """Test generating summary for multiple rooms."""
        # Create data for two rooms
        for room_id in ["53463", "53464"]:
            campus_dir = temp_database / "仙林校区" / "19幢" / f"Room-{room_id}"
            campus_dir.mkdir(parents=True, exist_ok=True)
            
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
                        "房间": f"Room-{room_id}",
                        "timestamp": date.isoformat(),
                        "success": True
                    }, f)
        
        summary = generate_summary(str(temp_database))
        
        assert summary is not None
        assert summary['total_rooms'] == 2
        assert len(summary['rooms']) == 2
        assert '53463' in summary['rooms']
        assert '53464' in summary['rooms']
    
    def test_summary_file_size_under_limit(self, temp_database, tmp_path):
        """Test that summary file size is under 500KB."""
        # Create data for 50 rooms
        for i in range(50):
            room_id = f"53{str(i).zfill(3)}"
            campus_dir = temp_database / "仙林校区" / "19幢" / f"Room-{room_id}"
            campus_dir.mkdir(parents=True, exist_ok=True)
            
            for days_ago in range(10):
                date = datetime.now() - timedelta(days=days_ago)
                date_str = date.strftime("%Y%m%d")
                
                file = campus_dir / f"{date_str}.json"
                
                with open(file, 'w') as f:
                    json.dump({
                        "id": room_id,
                        "剩余电量": f"{100.0 + i}度",
                        "校区": "仙林校区",
                        "楼栋": "19幢",
                        "房间": f"Room-{room_id}",
                        "timestamp": date.isoformat(),
                        "success": True
                    }, f)
        
        summary = generate_summary(str(temp_database))
        
        # Save to file and check size
        output_file = tmp_path / "summary.json"
        with open(output_file, 'w') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        file_size = output_file.stat().st_size
        assert file_size < 500 * 1024  # 500KB
    
    def test_summary_includes_metadata(self, temp_database):
        """Test that summary includes required metadata."""
        summary = generate_summary(str(temp_database))
        
        assert 'generated_at' in summary
        assert 'total_rooms' in summary
        assert 'query_success_rate' in summary
        assert 'rooms' in summary
