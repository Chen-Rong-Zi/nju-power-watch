"""
Tests for validate_cookie.py script.
"""
import pytest
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock
from scripts.validate_cookie import validate_cookie


@pytest.mark.asyncio
class TestValidateCookie:
    """Test cases for cookie validation."""
    
    async def test_valid_cookie_returns_true(self, sample_cookie_json, tmp_path):
        """Test that valid cookie returns True."""
        cookie_file = tmp_path / "cookie.json"
        with open(cookie_file, 'w') as f:
            json.dump(sample_cookie_json, f)
        
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.text = AsyncMock(return_value='<html>Electricity Data</html>')
            mock_response.__aenter__ = AsyncMock(return_value=mock_response)
            mock_response.__aexit__ = AsyncMock(return_value=None)
            mock_get.return_value = mock_response
            
            result = await validate_cookie(str(cookie_file), "53463")
            assert result is True
    
    async def test_expired_cookie_raises_error(self, sample_cookie_json, tmp_path):
        """Test that expired cookie raises ValueError."""
        cookie_file = tmp_path / "cookie.json"
        with open(cookie_file, 'w') as f:
            json.dump(sample_cookie_json, f)
        
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = AsyncMock()
            mock_response.status = 401
            mock_response.__aenter__ = AsyncMock(return_value=mock_response)
            mock_response.__aexit__ = AsyncMock(return_value=None)
            mock_get.return_value = mock_response
            
            with pytest.raises(ValueError, match="Cookie expired or invalid"):
                await validate_cookie(str(cookie_file), "53463")
    
    async def test_cookie_file_not_found_raises_error(self, tmp_path):
        """Test that missing cookie file raises FileNotFoundError."""
        non_existent_file = tmp_path / "nonexistent.json"
        
        with pytest.raises(FileNotFoundError):
            await validate_cookie(str(non_existent_file), "53463")
    
    async def test_invalid_json_cookie_raises_error(self, tmp_path):
        """Test that invalid JSON in cookie file raises JSONDecodeError."""
        cookie_file = tmp_path / "invalid.json"
        with open(cookie_file, 'w') as f:
            f.write("{ invalid json }")
        
        with pytest.raises(json.JSONDecodeError):
            await validate_cookie(str(cookie_file), "53463")
    
    async def test_redirect_to_login_raises_error(self, sample_cookie_json, tmp_path):
        """Test that redirect to login page raises ValueError."""
        cookie_file = tmp_path / "cookie.json"
        with open(cookie_file, 'w') as f:
            json.dump(sample_cookie_json, f)
        
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.text = AsyncMock(return_value='<html><title>登录页面</title></html>')
            mock_response.__aenter__ = AsyncMock(return_value=mock_response)
            mock_response.__aexit__ = AsyncMock(return_value=None)
            mock_get.return_value = mock_response
            
            with pytest.raises(ValueError, match="Session redirected to login"):
                await validate_cookie(str(cookie_file), "53463")
    
    async def test_forbidden_response_raises_error(self, sample_cookie_json, tmp_path):
        """Test that 403 Forbidden response raises ValueError."""
        cookie_file = tmp_path / "cookie.json"
        with open(cookie_file, 'w') as f:
            json.dump(sample_cookie_json, f)
        
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = AsyncMock()
            mock_response.status = 403
            mock_response.__aenter__ = AsyncMock(return_value=mock_response)
            mock_response.__aexit__ = AsyncMock(return_value=None)
            mock_get.return_value = mock_response
            
            with pytest.raises(ValueError, match="Cookie expired or invalid"):
                await validate_cookie(str(cookie_file), "53463")
