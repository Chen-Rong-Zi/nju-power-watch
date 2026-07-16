#!/usr/bin/env python3
"""
南京大学统一身份认证自动登录脚本
集成云码验证码识别API
"""
import requests
from bs4 import BeautifulSoup
import sys
import time
import random
import string
import json
import base64
from pathlib import Path
from Crypto.Cipher import AES

# 配置文件路径
USERNAME_FILE = "/tmp/username"
PASSWORD_FILE = "/tmp/password"
TOKEN_FILE = "/tmp/token"
CAPTCHA_FILE = "/tmp/captcha.png"
COOKIE_OUTPUT_FILE = "/tmp/cookie.json"

# 南京大学统一认证URL
LOGIN_URL = "https://authserver.nju.edu.cn/authserver/login"
CAPTCHA_URL = "https://authserver.nju.edu.cn/authserver/getCaptcha.htl"

# 云码验证码识别API
YUNMA_API_URL = "http://api.jfbym.com/api/YmServer/customApi"
YUNMA_CAPTCHA_TYPE = "10103"  # 通用数英1~6位plus，识别率较高


def load_credentials():
    """加载用户名、密码和云码token"""
    try:
        with open(USERNAME_FILE, "r") as f:
            username = f.read().strip()
        with open(PASSWORD_FILE, "r") as f:
            password = f.read().strip()
        with open(TOKEN_FILE, "r") as f:
            token = f.read().strip()
        return username, password, token
    except FileNotFoundError as e:
        print(f"✗ 配置文件缺失: {e}")
        sys.exit(1)


def encrypt_password(password_seed, password):
    """AES加密密码"""
    random_iv = ''.join(random.sample((string.ascii_letters + string.digits) * 10, 16))
    random_str = ''.join(random.sample((string.ascii_letters + string.digits) * 10, 64))
    
    data = random_str + password
    key = password_seed.encode("utf-8")
    iv = random_iv.encode("utf-8")
    
    bs = AES.block_size
    
    def pad(s):
        return s + (bs - len(s) % bs) * chr(bs - len(s) % bs)
    
    cipher = AES.new(key, AES.MODE_CBC, iv)
    data = cipher.encrypt(pad(data).encode("utf-8"))
    return base64.b64encode(data).decode("utf-8")


def recognize_captcha(captcha_image_path, token):
    """
    使用云码API识别验证码
    
    Args:
        captcha_image_path: 验证码图片路径
        token: 云码用户token
    
    Returns:
        识别结果字符串
    """
    print("\n[验证码识别]")
    print(f"    图片路径: {captcha_image_path}")
    
    # 读取图片并转为base64
    with open(captcha_image_path, 'rb') as f:
        image_data = f.read()
    image_base64 = base64.b64encode(image_data).decode('utf-8')
    
    # 调用云码API
    payload = {
        "token": token,
        "type": YUNMA_CAPTCHA_TYPE,
        "image": image_base64
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(YUNMA_API_URL, json=payload, headers=headers, timeout=30)
        result = response.json()
        
        if result.get("code") == 10000:
            captcha_text = result.get("data", {}).get("data", "")
            print(f"    ✓ 识别成功: {captcha_text}")
            return captcha_text
        else:
            error_msg = result.get("msg", "未知错误")
            print(f"    ✗ 识别失败: {error_msg}")
            raise ValueError(f"验证码识别失败: {error_msg}")
    
    except requests.RequestException as e:
        print(f"    ✗ API请求失败: {e}")
        raise


def login_with_captcha(username, password, token):
    """
    使用验证码自动登录
    
    Args:
        username: 用户名
        password: 密码
        token: 云码token
    
    Returns:
        session对象（包含登录后的cookie）
    """
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    })
    
    print("=" * 60)
    print("南京大学统一身份认证自动登录")
    print("=" * 60)
    
    # Step 1: 访问登录页面
    print("\n[1] 访问登录页面...")
    response = session.get(LOGIN_URL)
    print(f"    状态码: {response.status_code}")
    
    if response.status_code != 200:
        raise ValueError(f"访问登录页面失败: {response.status_code}")
    
    # 解析页面参数
    soup = BeautifulSoup(response.text, 'html.parser')
    lt_value = soup.find('input', {'name': 'lt'})['value']
    execution_value = soup.find('input', {'name': 'execution'})['value']
    event_id_value = soup.find('input', {'name': '_eventId'})['value']
    rm_shown_value = soup.find('input', {'name': 'rmShown'})['value']
    
    print(f"    执行ID: {execution_value[:30]}...")
    
    # Step 2: 获取验证码
    print("\n[2] 获取验证码...")
    t = int(time.time() * 1000)
    captcha_url = f"{CAPTCHA_URL}?t={t}"
    captcha_response = session.get(captcha_url)
    print(f"    状态码: {captcha_response.status_code}")
    
    # 保存验证码图片
    with open(CAPTCHA_FILE, 'wb') as f:
        f.write(captcha_response.content)
    print(f"    已保存到: {CAPTCHA_FILE}")
    
    # Step 3: 自动识别验证码
    captcha_code = recognize_captcha(CAPTCHA_FILE, token)
    
    # Step 4: 加密密码
    print("\n[3] 加密密码...")
    pwd_salt = soup.find('input', {'id': 'pwdEncryptSalt'})
    password_salt = pwd_salt['value'] if pwd_salt else execution_value[:16]
    encrypted_password = encrypt_password(password_salt, password)
    print(f"    ✓ 密码已加密")
    
    # Step 5: 提交登录
    print("\n[4] 提交登录...")
    login_data = {
        'username': username,
        'password': encrypted_password,
        'lt': lt_value,
        'execution': execution_value,
        '_eventId': event_id_value,
        'rmShown': rm_shown_value,
        'captcha': captcha_code
    }
    
    login_response = session.post(LOGIN_URL, data=login_data, allow_redirects=True)
    print(f"    状态码: {login_response.status_code}")
    print(f"    最终URL: {login_response.url}")
    
    # Step 5: 检查登录结果
    print("\n[5] 检查登录结果...")
    if 'personalInfo' in login_response.url or 'accountsecurity' in login_response.url:
        print("    ✓ 登录成功！")
        return session
    else:
        print("    ✗ 登录失败")
        # 检查是否是验证码错误
        if '验证码' in login_response.text or 'captcha' in login_response.text.lower():
            print("    提示: 可能是验证码识别错误，请重试")
        raise ValueError("登录失败，请检查用户名和密码")


def login_with_nju_login(username: str, password: str) -> requests.Session:
    """使用 nju-login-simple 登录，返回包含完整 auth cookie 的 Session"""
    from nju_login import do_captcha, encrypt, etree

    print("\n[nju-login-simple]")
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.1 Safari/605.1.15",
        "origin": "https://authserver.nju.edu.cn",
        "referer": "https://authserver.nju.edu.cn/authserver/login",
    })

    # 获取登录页面参数
    page = etree.HTML(session.get("https://authserver.nju.edu.cn/authserver/login").text)
    lt = page.xpath('//*[@id="pwdFromId"]/input[@name="lt"]//@value')[0]
    execution = page.xpath('//*[@id="pwdFromId"]/input[@name="execution"]//@value')[0]
    eventid = page.xpath('//*[@id="pwdFromId"]/input[@name="_eventId"]//@value')[0]
    salt = page.xpath('//*[@id="pwdEncryptSalt"]//@value')[0]

    # 获取验证码并识别
    captcha_data = session.get("https://authserver.nju.edu.cn/authserver/getCaptcha.htl").content
    captcha = do_captcha(captcha_data)

    # 加密密码并提交
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

    # 检查是否成功（跟随重定向后应看到个人中心页面）
    if "personalInfo" in login_response.url or "accountsecurity" in login_response.url:
        print(f"    ✓ 登录成功")
    else:
        raise ValueError(f"登录失败，请检查用户名和密码")
    return session


def _save_cookie_dict(cookies_dict: dict) -> None:
    """将 cookie dict 写入 /tmp/cookie.json  (共用函数)"""
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
    """
    保存cookie到文件

    Args:
        session: requests Session对象
    """
    _save_cookie_dict(session.cookies.get_dict())


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
        session = login_with_nju_login(username, password)
        save_cookies_from_session(session)
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


if __name__ == '__main__':
    main()
