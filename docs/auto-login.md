# NJU 自动登录与Cookie获取

## 概述

集成云码验证码识别API，实现南京大学统一身份认证自动登录，自动获取电费查询所需cookie。

## 工作流程

```
┌──────────────────────┐
│  1. 加载配置文件       │
│     /tmp/username     │
│     /tmp/password     │
│     /tmp/token        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  2. 访问登录页面       │
│  获取页面参数          │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  3. 下载验证码图片     │
│  保存到 /tmp/captcha.png│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  4. 云码API识别验证码  │
│  自动获取验证码文本    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  5. AES加密密码        │
│  提交登录请求          │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  6. 获取登录Cookie     │
│  保存到 /tmp/cookie.json│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  7. 验证Cookie有效性   │
│  使用validate_cookie.py│
└──────────────────────┘
```

## 配置

### 1. 准备配置文件

```bash
# 用户名（学号）
echo "your_username" > /tmp/username

# 密码
echo "your_password" > /tmp/password

# 云码API Token（从 https://zhuce.jfbym.com 注册获取）
echo "your_yunma_token" > /tmp/token
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

## 使用

### 方式1: 直接运行

```bash
python scripts/nju_auto_login.py
```

### 方式2: 集成到GitHub Actions

在工作流中添加步骤：

```yaml
- name: Auto Login and Get Cookie
  run: |
    # 写入配置文件
    echo "${{ secrets.NJU_USERNAME }}" > /tmp/username
    echo "${{ secrets.NJU_PASSWORD }}" > /tmp/password
    echo "${{ secrets.YUNMA_TOKEN }}" > /tmp/token
    
    # 执行自动登录
    python scripts/nju_auto_login.py
    
    # 将cookie设置为GitHub Secret
    COOKIE_JSON=$(cat /tmp/cookie.json)
    echo "EPAY_COOKIE=$COOKIE_JSON" >> $GITHUB_ENV

- name: Validate Cookie
  run: |
    python scripts/validate_cookie.py /tmp/cookie.json
```

## 云码验证码识别

### API说明

- **API地址**: http://api.jfbym.com/api/YmServer/customApi
- **验证码类型**: 10103（通用数英1~6位plus，识别率较高）
- **费用**: 按次计费，具体价格查看云码官网

### 识别流程

```python
# 1. 读取验证码图片
with open('/tmp/captcha.png', 'rb') as f:
    image_data = f.read()

# 2. 转为base64
image_base64 = base64.b64encode(image_data).decode('utf-8')

# 3. 调用API
payload = {
    "token": "your_token",
    "type": "10103",
    "image": image_base64
}
response = requests.post(YUNMA_API_URL, json=payload)

# 4. 获取结果
result = response.json()
if result["code"] == 10000:
    captcha_text = result["data"]["data"]
```

### 支持的验证码类型

| 类型ID | 说明 | 适用场景 |
|--------|------|---------|
| 10110 | 通用数英1-4位 | 简单验证码 |
| 10111 | 通用数英5-8位 | 中等难度 |
| 10103 | 通用数英1~6位plus | **推荐，识别率高** |
| 10114 | 通用中文1~2位 | 中文验证码 |
| 50100 | 通用数字计算题 | 计算题验证码 |

## Cookie验证

登录成功后，使用 `validate_cookie.py` 验证cookie：

```bash
python scripts/validate_cookie.py /tmp/cookie.json
```

**输出示例**:

```
✓ Cookie is valid
✓ Successfully authenticated to epay.nju.edu.cn
```

## 故障排查

### 1. 验证码识别失败

**原因**: 验证码图片不清晰或类型不匹配

**解决**:
- 检查 `/tmp/captcha.png` 是否正确下载
- 尝试其他验证码类型（如10110、10111）
- 检查云码账户余额

### 2. 登录失败

**可能原因**:
- 用户名或密码错误
- 验证码识别错误
- 网络问题

**解决**:
```bash
# 检查配置文件
cat /tmp/username
cat /tmp/password

# 手动测试
python scripts/nju_login.py  # 手动输入验证码
```

### 3. Cookie无效

**原因**: Cookie过期或格式错误

**解决**:
- 重新运行自动登录
- 检查cookie.json格式
- 使用 `validate_cookie.py` 验证

## 安全建议

1. **不要将密码提交到Git仓库**
   - 使用 `/tmp` 临时文件
   - GitHub Actions使用Secrets

2. **定期更换密码**
   - 建议每月更换一次
   - 更换后更新配置文件

3. **保护云码Token**
   - 不要分享给他人
   - 定期重置token

4. **Cookie有效期**
   - Cookie有效期约7天
   - 设置定时任务每周更新

## 成本估算

**云码验证码识别费用**:

- 每次识别约 0.01-0.03 元
- 每天登录1次，每月约 0.3-0.9 元
- 验证码识别失败可申请退款

**优化建议**:
- 登录成功后cookie可用7天
- 每周自动登录1次即可
- 月成本约 0.1-0.3 元

## 示例输出

```
============================================================
南京大学统一身份认证自动登录
============================================================

[1] 访问登录页面...
    状态码: 200
    执行ID: e1s68175481518598196...

[2] 获取验证码...
    状态码: 200
    已保存到: /tmp/captcha.png

[验证码识别]
    图片路径: /tmp/captcha.png
    ✓ 识别成功: a3b7

[3] 加密密码...
    ✓ 密码已加密

[4] 提交登录...
    状态码: 200
    最终URL: https://authserver.nju.edu.cn/authserver/login

[5] 检查登录结果...
    ✓ 登录成功！

[Cookie已保存]
    文件: /tmp/cookie.json
    数量: 2 个
    - JSESSIONID: ABCD1234567890EFGHI...

[6] 验证Cookie...
    ✓ Cookie验证成功

============================================================
登录流程完成！Cookie已保存到 /tmp/cookie.json
============================================================
```

## 相关文件

- `scripts/nju_auto_login.py` - 自动登录主脚本
- `scripts/nju_login.py` - 手动登录脚本
- `scripts/validate_cookie.py` - Cookie验证脚本
- `/tmp/username` - 用户名配置
- `/tmp/password` - 密码配置
- `/tmp/token` - 云码API token
- `/tmp/cookie.json` - 输出的cookie文件

## 参考资料

- [云码验证码识别平台](https://zhuce.jfbym.com)
- [南京大学统一身份认证](https://authserver.nju.edu.cn)
- [电费查询系统](https://epay.nju.edu.cn)
