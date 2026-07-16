# Nju-login-simple Integration

## 问题

当前 `scripts/nju_auto_login.py` 使用云码 API 识别验证码，需要 `YUNMA_TOKEN` 外部依赖。`nju-login-simple` 库提供基于 `ddddocr` 的本地 OCR 识别，无需外部 API。

## 方案

改造 `scripts/nju_auto_login.py`，内部实现主备切换：

```
nju_auto_login.py
├── [主] try: nju_login.login(username, password)
│   ├── ddddocr 本地 OCR 识别验证码
│   ├── 无需 YUNMA_TOKEN
│   └── 成功 → 提取 cookies → 保存到 /tmp/cookie.json
│
└── [备] except: 旧方式（云码 API）
    ├── 需要 YUNMA_TOKEN
    └── 成功 → 保存到 /tmp/cookie.json
```

## 实现细节

### nju_login.login() 接口

`nju_login.login(username, password)` 返回 `requests.Response`。内部使用 `requests.Session`，通过 authserver 的登录流程获取 cookies。关键的 auth cookie 在 `response.cookies` 中（由最终 POST 响应设置）。

### Cookie 提取

`nju_login.login()` 返回的 `Response` 对象的 `.cookies` 包含 auth cookie。需要将其转换为与旧格式一致的 JSON 列表（`[{name, value, domain: "epay.nju.edu.cn", ...}]`），由 `save_cookies()` 函数处理。

### 异常处理

```
try:
    result = login_with_nju_login(username, password)
    save_cookies_from_response(result)
except (ImportError, Exception) as e:
    print(f"nju-login-simple 失败 ({e}), 回退到云码方式...")
    login_with_captcha(username, password, token)
    save_cookies(session)
```

`ImportError` 捕获库未安装的情况，`Exception` 捕获运行时错误。

### 依赖

`requirements.txt` 新增 `nju-login-simple~=1.1.0`（版本锁定）。

### Cookie 验证

现有 `validate_cookie.py` 调用保持不变，两种方式保存的 cookie 格式一致。

### 监控

主备切换时打印日志行，方便观察是否降级运行。

## 改动

| 文件 | 改动 |
|------|------|
| `scripts/nju_auto_login.py` | 新增 `login_with_nju_login()`，`main()` 改为主备切换 |
| `requirements.txt` | 新增 `nju-login-simple~=1.1.0` |
| `.github/workflows/*.yml` | 不动 |

## 注意

- `nju-login-simple` 依赖较重（~100MB），但 workflow 已配置 pip 缓存，只有首次运行或 requirements.txt 变更时才会重新下载
- `ddddocr` 在 Ubuntu 上可能需要 `libGL.so.1`，GitHub Actions 的 `ubuntu-latest` 镜像预装了此依赖