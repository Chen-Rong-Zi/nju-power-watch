"""
Tests for rollback_failed_run.py script.
"""
import pytest
import json
from pathlib import Path
from datetime import datetime
from scripts.rollback_failed_run import rollback_partial_results


class TestRollbackFailedRun:
    """Test cases for rollback functionality."""
    
    def test_rollback_removes_partial_files(self, temp_database, tmp_path):
        """Test that rollback removes all partial daily files for today."""
        today = datetime.now().strftime("%Y%m%d")
        
        # Create additional partial file for today
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613"
        partial_file = campus_dir / f"{today}.json"
        
        # Create file for yesterday (should not be removed)
        yesterday_file = campus_dir / "20260514.json"
        with open(yesterday_file, 'w', encoding='utf-8') as f:
            json.dump({"test": "data"}, f)
        
        rollback_partial_results(str(temp_database))
        
        # Today's partial file should be removed
        assert not partial_file.exists()
        
        # Yesterday's file should remain
        assert yesterday_file.exists()
    
    def test_rollback_handles_empty_database(self, tmp_path):
        """Test that rollback handles empty database directory."""
        empty_database = tmp_path / "empty_database"
        empty_database.mkdir()
        
        # Should not raise error
        rollback_partial_results(str(empty_database))
        
        assert True
    
    def test_rollback_preserves_previous_data(self, temp_database):
        """Test that rollback preserves data from previous days."""
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613"
        
        # Create multiple days of data
        dates = ["20260513", "20260514", "20260515"]
        for date in dates:
            file_path = campus_dir / f"{date}.json"
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump({"date": date}, f)
        
        rollback_partial_results(str(temp_database))
        
        # All files should remain (today's date is not 2026-05-15 in test)
        for date in dates:
            file_path = campus_dir / f"{date}.json"
            assert file_path.exists()
    
    def test_rollback_logs_removal(self, temp_database):
        """Test that rollback logs and returns removed files."""
        today = datetime.now().strftime("%Y%m%d")
        
        # Create today's file
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613"
        today_file = campus_dir / f"{today}.json"
        with open(today_file, 'w', encoding='utf-8') as f:
            json.dump({"test": "data"}, f)
        
        removed_count = rollback_partial_results(str(temp_database))
        
        assert removed_count == 1
        assert not today_file.exists()
    
    def test_rollback_handles_nested_directories(self, tmp_path):
        """Test that rollback handles deeply nested directory structure."""
        database = tmp_path / "database"
        
        # Create nested structure
        deep_path = database / "Campus" / "Building1" / "SubBuilding" / "Room-123"
        deep_path.mkdir(parents=True)
        
        today = datetime.now().strftime("%Y%m%d")
        today_file = deep_path / f"{today}.json"
        with open(today_file, 'w') as f:
            json.dump({"test": "data"}, f)
        
        rollback_partial_results(str(database))
        
        assert not today_file.exists()
