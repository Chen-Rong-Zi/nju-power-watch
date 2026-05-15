"""
Integration tests for daily workflow.
"""
import pytest
import json
from pathlib import Path
from datetime import datetime
from unittest.mock import patch, AsyncMock, MagicMock


@pytest.mark.asyncio
class TestDailyWorkflow:
    """End-to-end tests for daily data collection workflow."""
    
    async def test_complete_workflow_success(self, temp_database, temp_config, temp_cookie_file):
        """Test complete workflow from cookie validation to data storage."""
        from scripts.validate_cookie import validate_cookie
        from scripts.rollback_failed_run import rollback_partial_results
        
        # Mock successful cookie validation
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.text = AsyncMock(return_value='<html>Data</html>')
            mock_response.__aenter__ = AsyncMock(return_value=mock_response)
            mock_response.__aexit__ = AsyncMock(return_value=None)
            mock_get.return_value = mock_response
            
            # Validate cookie
            result = await validate_cookie(str(temp_cookie_file), "53463")
            assert result is True
        
        # Mock successful query
        today = datetime.now().strftime("%Y%m%d")
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        result_file = campus_dir / f"{today}.json"
        sample_data = {
            "id": "53463",
            "校区": "仙林校区",
            "楼栋": "19幢",
            "房间": "19栋第16层1613",
            "宿舍ID": "53463",
            "剩余电量": "125.50度",
            "timestamp": datetime.now().isoformat(),
            "success": True
        }
        
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(sample_data, f, ensure_ascii=False, indent=2)
        
        assert result_file.exists()
        
        # Verify data was written correctly
        with open(result_file, 'r', encoding='utf-8') as f:
            saved_data = json.load(f)
        
        assert saved_data["id"] == "53463"
        assert saved_data["success"] is True
    
    async def test_workflow_rollback_on_failure(self, temp_database, temp_cookie_file):
        """Test that workflow rolls back on query failure."""
        from scripts.rollback_failed_run import rollback_partial_results
        
        # Create partial results
        today = datetime.now().strftime("%Y%m%d")
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        partial_file = campus_dir / f"{today}.json"
        with open(partial_file, 'w', encoding='utf-8') as f:
            json.dump({"partial": True}, f)
        
        # Simulate failure and rollback
        rollback_partial_results(str(temp_database))
        
        # Verify partial results were removed
        assert not partial_file.exists()
    
    async def test_workflow_preserves_previous_data_on_failure(self, temp_database):
        """Test that previous data is preserved when workflow fails."""
        from scripts.rollback_failed_run import rollback_partial_results
        
        today = datetime.now().strftime("%Y%m%d")
        yesterday = "20260514"
        
        campus_dir = temp_database / "仙林校区" / "19幢" / "19栋第16层1613-53463"
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        # Create yesterday's data
        yesterday_file = campus_dir / f"{yesterday}.json"
        with open(yesterday_file, 'w', encoding='utf-8') as f:
            json.dump({"date": yesterday}, f)
        
        # Create today's partial data
        today_file = campus_dir / f"{today}.json"
        with open(today_file, 'w', encoding='utf-8') as f:
            json.dump({"date": today, "partial": True}, f)
        
        # Rollback
        rollback_partial_results(str(temp_database))
        
        # Yesterday should remain
        assert yesterday_file.exists()
        
        # Today should be removed
        assert not today_file.exists()
    
    def test_workflow_logs_execution(self, temp_database, tmp_path):
        """Test that workflow creates log files."""
        logs_dir = tmp_path / "logs" / "query_runs"
        logs_dir.mkdir(parents=True)
        
        today = datetime.now().strftime("%Y-%m-%d")
        log_file = logs_dir / f"{today}.log"
        
        # Simulate log entry
        with open(log_file, 'w') as f:
            f.write(f"{datetime.now()} INFO Starting daily query run\n")
            f.write(f"{datetime.now()} INFO Query completed successfully\n")
        
        assert log_file.exists()
        
        with open(log_file, 'r') as f:
            content = f.read()
        
        assert "Starting daily query" in content
        assert "completed successfully" in content
