# NJUlogin.pwdLogin Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace nju-login-simple with NJUlogin.pwdLogin as primary login method, keep nju-login-simple as fallback, remove cloud-code API.

**Architecture:** Modify `nju_auto_login.py` to try NJUlogin.pwdLogin (OpenCV slider captcha) first, fall back to nju-login-simple (ddddocr text captcha). Remove all cloud-code API code. Remove YUNMA_TOKEN from workflows and test script.

**Tech Stack:** Python 3.11, NJUlogin>=5.0.0, nju-login-simple~=1.1.0, requests

---

### Task 1: Update requirements.txt

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add NJUlogin dependency**

Replace `nju-login-simple~=1.1.0` line ordering so NJUlogin comes first:

```
NJUlogin>=5.0.0
nju-login-simple~=1.1.0
```

- [ ] **Step 2: Install and verify**

Run:
```bash
source .venv/bin/activate
pip install -r requirements.txt
python -c "from NJUlogin import pwdLogin; print('NJUlogin OK')"
```

Expected: `NJUlogin OK`

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "chore: add NJUlogin dependency"
```

---

### Task 2: Rewrite nju_auto_login.py

**Files:**
- Modify: `scripts/nju_auto_login.py`
- Modify: `scripts/validate_cookie.py` (check if needed — no)

This is the core task. The file needs:
1. Remove cloud-code API imports (`BeautifulSoup`, `time`, `random`, `string`, `base64`, `Crypto.Cipher.AES`, `Path`)
2. Remove cloud-code constants (`TOKEN_FILE`, `CAPTCHA_FILE`, `YUNMA_API_URL`, `YUNMA_CAPTCHA_TYPE`, `LOGIN_URL`, `CAPTCHA_URL`)
3. Remove cloud-code functions (`encrypt_password`, `recognize_captcha`, `login_with_captcha`, `_login_fallback`)
4. Modify `load_credentials()` to return only (username, password)
5. Add `login_with_nju_pwdlogin()` function
6. Rewrite `main()` for NJUlogin.pwdLogin primary → nju-login-simple fallback

- [ ] **Step 1: Rewrite the file**

Final file content:

```python
#!/usr/bin/env python3
"""
南京大学统一身份认证自动登录脚本
主：NJUlogin.pwdLogin（滑块验证码）
备：nju-login-simple（文字验证码）
"""
import requests
import sys
import json

USERNAME_FILE = "/tmp/username"
PASSWORD_FILE = "/tmp/password"
COOKIE_OUTPUT_FILE = "/tmp/cookie.json"


def load_credentials():
    """加载用户名和密码"""
    try:
        with open(USERNAME_FILE, "r") as f:
            username = f.read().strip()
        with open(PASSWORD_FILE, "r") as f:
            password = f.read().strip()
        return username, password
    except FileNotFoundError as e:
        print(f"\u2717 配置文件缺失: {e}")
        sys.exit(1)


def login_with_nju_pwdlogin(username: str, password: str, dest: str) -> requests.Session:
    """[主] NJUlogin.pwdLogin 登录，返回携带 auth cookie 的 Session"""
    from NJUlogin import pwdLogin

    print("\n[NJUlogin.pwdLogin]")
    login_obj = pwdLogin(username, password)
    session = login_obj.login(dest=dest)
    if session is None:
        raise ValueError("滑块验证码失败次数过多")
    print("    \u2713 登录成功")
    return session


def login_with_nju_login(username: str, password: str) -> requests.Session:
    """[备] nju-login-simple 登录，返回包含完整 auth cookie 的 Session"""
    from nju_login import do_captcha, encrypt, etree

    print("\n[nju-login-simple]")
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.1 Safari/605.1.15",
        "origin": "https://authserver.nju.edu.cn",
        "referer": "https://authserver.nju.edu.cn/authserver/login",
    })

    page = etree.HTML(session.get("https://authserver.nju.edu.cn/authserver/login").text)
    lt = page.xpath('//*[@id="pwdFromId"]/input[@name="lt"]//@value')[0]
    execution = page.xpath('//*[@id="pwdFromId"]/input[@name="execution"]//@value')[0]
    eventid = page.xpath('//*[@id="pwdFromId"]/input[@name="_eventId"]//@value')[0]
    salt_nodes = page.xpath('//*[@id="pwdEncryptSalt"]//@value')
    salt = salt_nodes[0] if salt_nodes else execution[:16]

    import time
    captcha_url = f"https://authserver.nju.edu.cn/authserver/getCaptcha.htl?t={int(time.time() * 1000)}"
    captcha_data = session.get(captcha_url).content
    captcha = do_captcha(captcha_data)

    encrypted_password = encrypt(password, salt)
    data = {
        "username": username,
        "password": encrypted_password,
        "captchaResponse": captcha,
        "lt": lt,
        "dllt": "mobileLogin",
        "execution": execution,
        "_eventId": eventid,
    }
    login_response = session.post(
        "https://authserver.nju.edu.cn/authserver/login",
        data=data,
        allow_redirects=True,
    )

    if "personalInfo" in login_response.url or "accountsecurity" in login_response.url:
        print("    \u2713 登录成功")
    else:
        raise ValueError("登录失败，请检查用户名和密码")
    return session


def _save_cookie_dict(cookies_dict: dict) -> None:
    """将 cookie dict 写入 /tmp/cookie.json"""
    cookie_list = []
    for name, value in cookies_dict.items():
        cookie_list.append({
            "name": name,
            "value": value,
            "domain": "epay.nju.edu.cn",
            "path": "/",
            "expires": -1,
            "httpOnly": False,
            "secure": False
        })

    with open(COOKIE_OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(cookie_list, f, indent=2)

    print(f"\n[Cookie已保存]")
    print(f"    文件: {COOKIE_OUTPUT_FILE}")
    print(f"    数量: {len(cookie_list)} 个")
    for cookie in cookie_list:
        name = cookie['name']
        value = cookie['value'][:30] + "..." if len(cookie['value']) > 30 else cookie['value']
        print(f"    - {name}: {value}")


def save_cookies_from_session(session):
    """从 requests.Session 提取 cookies 并保存"""
    _save_cookie_dict(session.cookies.get_dict())


def save_cookies(session):
    """保存cookie到文件 (旧式接口，兼容调用)"""
    _save_cookie_dict(session.cookies.get_dict())


def _validate_cookie() -> None:
    """验证 cookie 有效性"""
    print("\n[验证Cookie]...")
    import subprocess
    result = subprocess.run(
        [sys.executable, "scripts/validate_cookie.py", COOKIE_OUTPUT_FILE],
        capture_output=True,
        text=True
    )
    if result.returncode == 0:
        print("    \u2713 Cookie验证成功")
        print("\n" + "=" * 60)
        print("登录流程完成！Cookie已保存到 /tmp/cookie.json")
        print("=" * 60)
    else:
        print(f"    \u2717 Cookie验证失败: {result.stderr}")
        sys.exit(1)


def main():
    """主函数：先试 NJUlogin.pwdLogin，失败则回退到 nju-login-simple"""
    print("开始自动登录流程...")

    username, password = load_credentials()
    print(f"\n[配置信息]")
    print(f"    用户名: {username}")

    DEST_URL = "https://epay.nju.edu.cn"

    # [主] NJUlogin.pwdLogin 方式
    try:
        print("\n[主] 尝试 NJUlogin.pwdLogin 登录...")
        session = login_with_nju_pwdlogin(username, password, DEST_URL)
        save_cookies_from_session(session)
        print("    \u2713 使用 NJUlogin.pwdLogin 登录成功")
    except ImportError:
        print("    NJUlogin 未安装，跳过")
    except Exception as e:
        print(f"    NJUlogin.pwdLogin 失败: {e}")
    else:
        _validate_cookie()
        return

    # [备] nju-login-simple 方式
    try:
        print("\n[备] 尝试 nju-login-simple 登录...")
        session = login_with_nju_login(username, password)
        save_cookies_from_session(session)
        print("    \u2713 使用 nju-login-simple 登录成功")
    except ImportError:
        print("    nju-login-simple 未安装，跳过")
        print("    \u2717 所有登录方式均不可用")
        sys.exit(1)
    except Exception as e:
        print(f"    nju-login-simple 失败: {e}")
        print("    \u2717 所有登录方式均失败")
        sys.exit(1)

    _validate_cookie()


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Verify syntax**

Run:
```bash
python -c "import ast; ast.parse(open('scripts/nju_auto_login.py').read()); print('Syntax OK')"
```

Expected: `Syntax OK`

- [ ] **Step 3: Commit**

```bash
git add scripts/nju_auto_login.py
git commit -m "feat: migrate login to NJUlogin.pwdLogin, drop cloud-code API"
```

---

### Task 3: Remove YUNMA_TOKEN from all workflows (6 files)

**Files:**
- Modify: `.github/workflows/daily-query.yml`
- Modify: `.github/workflows/manual-query.yml`
- Modify: `.github/workflows/monthly-scan-part-1.yml`
- Modify: `.github/workflows/monthly-scan-part-2.yml`
- Modify: `.github/workflows/monthly-scan-part-3.yml`
- Modify: `.github/workflows/monthly-scan-part-4.yml`

In each file, in the `Auto login to get cookie` step:
- Remove `YUNMA_TOKEN: ${{ secrets.YUNMA_TOKEN }}` from env block
- Remove `echo "$YUNMA_TOKEN" > /tmp/token` from command block

- [ ] **Step 1: Edit daily-query.yml**

Remove lines 51 and 60:
```yaml
          YUNMA_TOKEN: ${{ secrets.YUNMA_TOKEN }}
```
and
```yaml
            echo "$YUNMA_TOKEN" > /tmp/token
```

- [ ] **Step 2: Edit manual-query.yml**

Same changes as step 1.

- [ ] **Step 3: Edit monthly-scan-part-1.yml**

Same changes as step 1.

- [ ] **Step 4: Edit monthly-scan-part-2.yml**

Same changes as step 1.

- [ ] **Step 5: Edit monthly-scan-part-3.yml**

Same changes as step 1.

- [ ] **Step 6: Edit monthly-scan-part-4.yml**

Same changes as step 1.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/
git commit -m "chore: remove YUNMA_TOKEN from workflows"
```

---

### Task 4: Remove YUNMA_TOKEN from test_action_locally.sh

**Files:**
- Modify: `scripts/test_action_locally.sh`

- [ ] **Step 1: Remove the line**

Remove line `echo "$YUNMA_TOKEN" > /tmp/token`

- [ ] **Step 2: Commit**

```bash
git add scripts/test_action_locally.sh
git commit -m "chore: remove YUNMA_TOKEN from local test script"
```

---

### Task 5: Write tests

**Files:**
- Create: `tests/unit/test_nju_auto_login.py`

- [ ] **Step 1: Write the test file**

```python
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

        with patch("scripts.nju_auto_login.pwdLogin") as mock_pwd:
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

        with patch("scripts.nju_auto_login.pwdLogin") as mock_pwd:
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
```

- [ ] **Step 2: Run tests**

Run:
```bash
python -m pytest tests/unit/test_nju_auto_login.py -v
```

Expected: All tests pass.

- [ ] **Step 3: Run lint**

Run:
```bash
ruff check scripts/nju_auto_login.py
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/test_nju_auto_login.py
git commit -m "test: add tests for NJUlogin.pwdLogin migration"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run all existing tests**

Run:
```bash
python -m pytest tests/ -v
```

Expected: All existing tests still pass (no regressions).

- [ ] **Step 2: Verify module import**

Run:
```bash
source .venv/bin/activate
python -c "from scripts.nju_auto_login import login_with_nju_pwdlogin, login_with_nju_login; print('All imports OK')"
```

Expected: `All imports OK`

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final verification fixes"
```
