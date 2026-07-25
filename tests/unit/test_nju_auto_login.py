"""
Tests for nju_auto_login.py login module.
"""
import pytest
import json
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock


@pytest.fixture
def temp_cred_files(tmp_path):
    """Create temporary credential files."""
    username_file = tmp_path / "username"
    password_file = tmp_path / "password"
    username_file.write_text("test_user")
    password_file.write_text("test_pass")
    return str(username_file), str(password_file)


class TestLoginWithNjuPwdLogin:
    """Test NJUlogin.pwdLogin primary login path."""

    def test_success_returns_session(self):
        """Test that successful login returns a Session."""
        from scripts.nju_auto_login import login_with_nju_pwdlogin

        mock_session = MagicMock()
        mock_session.cookies.get_dict.return_value = {"CASTGC": "test-ticket"}

        with patch("NJUlogin.pwdLogin") as mock_pwd:
            mock_instance = MagicMock()
            mock_instance.login.return_value = mock_session
            mock_pwd.return_value = mock_instance

            result = login_with_nju_pwdlogin("user", "pass", "https://example.com")

            mock_pwd.assert_called_once_with("user", "pass")
            mock_instance.login.assert_called_once_with(dest="https://example.com")
            assert result is mock_session

    def test_none_return_raises(self):
        """Test that None return from login raises ValueError."""
        from scripts.nju_auto_login import login_with_nju_pwdlogin

        with patch("NJUlogin.pwdLogin") as mock_pwd:
            mock_instance = MagicMock()
            mock_instance.login.return_value = None
            mock_pwd.return_value = mock_instance

            with pytest.raises(ValueError, match="滑块验证码失败次数过多"):
                login_with_nju_pwdlogin("user", "pass", "https://example.com")


class TestLoadCredentials:
    """Test credential loading."""

    def test_loads_username_and_password(self, monkeypatch, tmp_path):
        """Test that both creds are loaded correctly."""
        from scripts.nju_auto_login import load_credentials

        monkeypatch.setattr("scripts.nju_auto_login.USERNAME_FILE", str(tmp_path / "username"))
        monkeypatch.setattr("scripts.nju_auto_login.PASSWORD_FILE", str(tmp_path / "password"))

        (tmp_path / "username").write_text("myuser")
        (tmp_path / "password").write_text("mypass")

        username, password = load_credentials()
        assert username == "myuser"
        assert password == "mypass"

    def test_missing_file_exits(self, monkeypatch, tmp_path):
        """Test that missing credential file causes sys.exit."""
        from scripts.nju_auto_login import load_credentials

        monkeypatch.setattr("scripts.nju_auto_login.USERNAME_FILE", str(tmp_path / "nonexistent"))

        with pytest.raises(SystemExit):
            load_credentials()


class TestSaveCookieDict:
    """Test cookie saving."""

    def test_saves_cookie_json(self, tmp_path):
        """Test that cookies are saved in expected format."""
        from scripts.nju_auto_login import _save_cookie_dict

        cookie_file = tmp_path / "cookie.json"
        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setattr("scripts.nju_auto_login.COOKIE_OUTPUT_FILE", str(cookie_file))

        _save_cookie_dict({"CASTGC": "ticket-123"})

        assert cookie_file.exists()
        data = json.loads(cookie_file.read_text())
        assert len(data) == 1
        assert data[0]["name"] == "CASTGC"
        assert data[0]["value"] == "ticket-123"
        assert data[0]["domain"] == "epay.nju.edu.cn"


class TestMainFallback:
    """Test main() fallback logic."""

    def test_primary_success_no_fallback(self):
        """Test that successful primary login skips fallback."""
        from scripts.nju_auto_login import main

        with patch("scripts.nju_auto_login.load_credentials", return_value=("u", "p")):
            with patch("scripts.nju_auto_login.login_with_nju_pwdlogin") as mock_primary:
                with patch("scripts.nju_auto_login.save_cookies_from_session"):
                    with patch("scripts.nju_auto_login._validate_cookie"):
                        mock_session = MagicMock()
                        mock_primary.return_value = mock_session
                        main()

        mock_primary.assert_called_once()

    def test_primary_failure_triggers_fallback(self):
        """Test that primary failure triggers nju-login-simple fallback."""
        from scripts.nju_auto_login import main

        with patch("scripts.nju_auto_login.load_credentials", return_value=("u", "p")):
            with patch("scripts.nju_auto_login.login_with_nju_pwdlogin") as mock_primary:
                mock_primary.side_effect = ValueError("failed")
                with patch("scripts.nju_auto_login.login_with_nju_login") as mock_fallback:
                    with patch("scripts.nju_auto_login.save_cookies_from_session"):
                        with patch("scripts.nju_auto_login._validate_cookie"):
                            mock_session = MagicMock()
                            mock_fallback.return_value = mock_session
                            main()

        mock_fallback.assert_called_once_with("u", "p")

    def test_both_fail_exits(self):
        """Test that when both methods fail, script exits."""
        from scripts.nju_auto_login import main

        with patch("scripts.nju_auto_login.load_credentials", return_value=("u", "p")):
            with patch("scripts.nju_auto_login.login_with_nju_pwdlogin", side_effect=ValueError("fail")):
                with patch("scripts.nju_auto_login.login_with_nju_login", side_effect=ValueError("fail")):
                    with pytest.raises(SystemExit):
                        main()
