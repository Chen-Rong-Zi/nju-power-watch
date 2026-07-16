# Nju-login-simple Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cloud-code captcha API with `nju-login-simple` (ddddocr local OCR) as primary login method, keep old method as fallback.

**Architecture:** Modify `nju_auto_login.py` to try `nju_login.login()` first, fall back to old cloud-code method on failure. Workflows unchanged.

**Tech Stack:** Python 3.11, nju-login-simple~=1.1.0, ddddocr, requests

---

### Task 1: Add `nju-login-simple` dependency

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add the dependency**

Append to `requirements.txt`:

```
nju-login-simple~=1.1.0
```

- [ ] **Step 2: Install and verify**

Run:
```bash
source .venv/bin/activate
pip install -r requirements.txt
python -c "import nju_login; print(nju_login.__doc__)"
```
Expected: Module loads without error.

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "chore: add nju-login-simple dependency"
```

---

### Task 2: Modify `nju_auto_login.py`

**Files:**
- Modify: `scripts/nju_auto_login.py`

- [ ] **Step 1: Add `login_with_nju_login()` function**

Add after the existing `login_with_captcha()` function (around line 203):

```python
def login_with_nju_login(username: str, password: str) -> requests.Response:
    """使用 nju-login-simple 登录，返回携带 auth cookie 的 Response"""
    from nju_login import login as nju_login_func
    print("\n[nju-login-simple]")
    result = nju_login_func(username, password)
    print(f"    ✓ 登录成功 (状态码: {result.status_code})")
    return result
```

- [ ] **Step 2: Add `save_cookies_from_response()` function**

Add after `login_with_nju_login()`:

```python
def save_cookies_from_response(response: requests.Response) -> None:
    """从 Response 对象提取 cookies 并保存"""
    cookies_dict = response.cookies.get_dict()
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
```

- [ ] **Step 3: Refactor `main()` to implement primary/backup switching**

Replace the current `main()` function:

```python
def main():
    """主函数：先试 nju-login-simple，失败则回退到云码方式"""
    print("开始自动登录流程...")

    # 加载配置
    username, password, token = load_credentials()
    print(f"\n[配置信息]")
    print(f"    用户名: {username}")
    if token:
        print(f"    云码Token: {token[:10]}...")

    # [主] nju-login-simple 方式
    try:
        print("\n[主] 尝试 nju-login-simple 登录...")
        result = login_with_nju_login(username, password)
        save_cookies_from_response(result)
        print("    ✓ 使用 nju-login-simple 登录成功")
    except ImportError:
        print("    nju-login-simple 未安装，跳过")
        _login_fallback(username, password, token)
    except Exception as e:
        print(f"    nju-login-simple 失败: {e}")
        print("    回退到云码方式...")
        _login_fallback(username, password, token)
    else:
        # 主方式成功，直接验证
        _validate_cookie()
        return

    # 如果走到这里，说明回退方式已执行完毕
    _validate_cookie()
```

- [ ] **Step 4: Extract validation into a helper function**

Add helper functions used by the new `main()`:

```python
def _login_fallback(username: str, password: str, token: str) -> None:
    """回退方式：云码 API 登录"""
    print("\n[备] 使用云码 API 登录...")
    session = login_with_captcha(username, password, token)
    save_cookies(session)
    print("    ✓ 使用云码方式登录成功")


def _validate_cookie() -> None:
    """验证 cookie 有效性"""
    print("\n[验证Cookie]...")
    import subprocess
    result = subprocess.run(
        ["python", "scripts/validate_cookie.py", COOKIE_OUTPUT_FILE],
        capture_output=True,
        text=True
    )
    if result.returncode == 0:
        print("    ✓ Cookie验证成功")
        print("\n" + "=" * 60)
        print("登录流程完成！Cookie已保存到 /tmp/cookie.json")
        print("=" * 60)
    else:
        print(f"    ✗ Cookie验证失败: {result.stderr}")
        sys.exit(1)
```

- [ ] **Step 5: Verify syntax**

Run:
```bash
source .venv/bin/activate
python -c "import ast; ast.parse(open('scripts/nju_auto_login.py').read()); print('Syntax OK')"
```
Expected: Syntax OK.

- [ ] **Step 6: Commit**

```bash
git add scripts/nju_auto_login.py
git commit -m "feat: add nju-login-simple as primary login method, keep cloud-code as fallback"
```

---

### Task 3: Verification

**No files changed.** Run these verification steps.

- [ ] **Step 1: Verify the module import works**

Run:
```bash
source .venv/bin/activate
python -c "from scripts.nju_auto_login import login_with_nju_login; print('import OK')"
```
Expected: `import OK`

- [ ] **Step 2: Verify the fallback works without nju-login-simple**

Run:
```bash
# Temporarily hide the module
source .venv/bin/activate
python -c "
import sys
sys.modules['nju_login'] = None  # simulate missing module
# This should fail gracefully
from scripts.nju_auto_login import login_with_nju_login
print('Handles missing module gracefully')
"
```
Expected: Prints error message but doesn't crash.

- [ ] **Step 3: Verify workflows unchanged**

Run:
```bash
grep -c "nju_auto_login" .github/workflows/*.yml
```
Expected: All 5 workflows still reference the same script.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final verification fixes"
```