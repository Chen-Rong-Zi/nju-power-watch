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
