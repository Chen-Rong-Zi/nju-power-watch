# NJUlogin.pwdLogin Migration

## 问题

当前 `scripts/nju_auto_login.py` 以 `nju-login-simple`（ddddocr 文字验证码 OCR）为主、云码 API 为备。authserver 登录方式已更新为滑块验证码，`NJUlogin.pwdLogin` 库使用 OpenCV 图像处理自动定位滑块缺口，更适配新版验证码。

## 方案

主备互换：`NJUlogin.pwdLogin` 为主，`nju-login-simple` 为备，删除云码 API。

```
nju_auto_login.main()
├── 加载凭据（username, password，删除 token）
│
├── [主] NJUlogin.pwdLogin(username, password).login(dest="https://epay.nju.edu.cn")
│   ├── OpenCV 滑块验证码（纯本地，无外部 API）
│   ├── 返回 requests.Session
│   ├── session.cookies.get_dict() → /tmp/cookie.json
│   └── validate_cookie()
│
├── [备] except ImportError/Exception → nju-login-simple
│   └── ddddocr 文字验证码（现有逻辑不变）
│
└── validate_cookie()
```

## 变更清单

### 依赖

`requirements.txt`:
- 新增 `NJUlogin>=5.0.0`
- 保留 `nju-login-simple~=1.1.0`

### scripts/nju_auto_login.py

删除项：
- `YUNMA_API_URL`, `YUNMA_CAPTCHA_TYPE` 常量
- `TOKEN_FILE` 常量
- `recognize_captcha()` 函数
- `login_with_captcha()` 函数
- `_login_fallback()` 函数
- `load_credentials()` 中 token 的读取逻辑
- `main()` 中 token 相关打印

新增项：
- `login_with_nju_pwdlogin(username, password, dest)` — 使用 NJUlogin.pwdLogin 登录，返回 Session

修改项：
- `main()` 主备互换：NJUlogin.pwdLogin → nju-login-simple

### .github/workflows/*.yml（6 个文件）

每个 workflow 的 `Auto login to get cookie` step：
- 删除 `YUNMA_TOKEN: ${{ secrets.YUNMA_TOKEN }}` env
- 删除 `echo "$YUNMA_TOKEN" > /tmp/token`

### scripts/test_action_locally.sh

- 删除 `echo "$YUNMA_TOKEN" > /tmp/token`

## 错误处理

| 场景 | 行为 |
|------|------|
| `pwdLogin.login()` 返回 `None`（滑块验证超限） | 抛 ValueError → fallback |
| `NJUlogin` ImportError | fallback |
| 其他 Exception | fallback |
| nju-login-simple 也失败 | `sys.exit(1)` |

## 测试

- cookie 格式不变，`test_validate_cookie.py` 不受影响
- 新写 `tests/unit/test_nju_auto_login.py`：mock `pwdLogin` 测试主备切换逻辑

## 不改动的文件

- `nju_electric_query.py` — 查询逻辑不变
- `validate_cookie.py` — 验证逻辑不变
- workflow 整体结构不变
