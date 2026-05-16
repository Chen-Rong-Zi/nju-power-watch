# GitHub Actions 自动登录更新总结

## 更新内容

### ✅ 已完成的工作

1. **创建自动登录脚本**
   - `scripts/nju_auto_login.py` - 主登录脚本
   - `scripts/test_yunma_api.py` - API测试脚本

2. **更新GitHub Actions工作流**
   - `.github/workflows/daily-query.yml` - 每日查询前自动登录
   - `.github/workflows/manual-query.yml` - 手动查询前自动登录

3. **添加文档**
   - `docs/auto-login.md` - 自动登录详细文档
   - `docs/github-actions-setup.md` - GitHub配置指南
   - `docs/auto-login-summary.md` - 集成总结

4. **更新依赖**
   - `requirements.txt` - 添加 requests, beautifulsoup4, pycryptodome

## 工作流变化

### 之前（手动cookie）

```yaml
- name: Create cookie file
  env:
    EPAY_COOKIE: ${{ secrets.EPAY_COOKIE }}
  run: |
    echo "$EPAY_COOKIE" > /tmp/cookie.json

- name: Validate cookie
  run: |
    python scripts/validate_cookie.py /tmp/cookie.json
```

**问题**: Cookie过期需要手动更新secret

### 现在（自动登录）

```yaml
- name: Auto login to get cookie
  env:
    NJU_USERNAME: ${{ secrets.NJU_USERNAME }}
    NJU_PASSWORD: ${{ secrets.NJU_PASSWORD }}
    YUNMA_TOKEN: ${{ secrets.YUNMA_TOKEN }}
  run: |
    echo "$NJU_USERNAME" > /tmp/username
    echo "$NJU_PASSWORD" > /tmp/password
    echo "$YUNMA_TOKEN" > /tmp/token
    python scripts/nju_auto_login.py

- name: Validate cookie
  run: |
    python scripts/validate_cookie.py /tmp/cookie.json
```

**优势**: 每次运行自动获取新cookie

## 配置变化

### 需要的GitHub Secrets

| Secret | 说明 | 示例 |
|--------|------|------|
| `NJU_USERNAME` | 学号 | `201250000` |
| `NJU_PASSWORD` | 密码 | `your_password` |
| `YUNMA_TOKEN` | 云码Token | `TA6djdhm0NC...` |

### 不再需要的Secrets

- ~~`EPAY_COOKIE`~~ - 已废弃，自动登录获取

## 执行流程

```
┌─────────────────────────────────────┐
│ GitHub Actions Workflow 触发        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 1. 从 Secrets 读取配置              │
│    - NJU_USERNAME                   │
│    - NJU_PASSWORD                   │
│    - YUNMA_TOKEN                    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 2. 执行 nju_auto_login.py          │
│    - 访问登录页                     │
│    - 下载验证码                     │
│    - 云码识别验证码                 │
│    - AES加密密码                    │
│    - 提交登录                       │
│    - 保存Cookie到 /tmp/cookie.json │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 3. validate_cookie.py 验证         │
│    - 发送测试请求                   │
│    - 检查重定向                     │
│    - 确认认证成功                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 4. 查询电费数据                     │
│    - nju_electric_query.py         │
│    - 使用自动获取的cookie           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 5. 生成聚合数据                     │
│    - aggregate_data.py             │
│    - 更新 summaries/               │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 6. 提交到仓库                       │
│    - git commit                    │
│    - git push                      │
└─────────────────────────────────────┘
```

## 成本分析

### 验证码识别费用

- **每次登录**: 1次验证码识别
- **识别费用**: ~0.01-0.03元/次
- **每日登录**: 月成本 ~0.3-0.9元
- **每周登录**: 月成本 ~0.04-0.12元

### 优化建议

调整为每周自动登录（Cookie有效期约7天）:

```yaml
# .github/workflows/daily-query.yml
on:
  schedule:
    - cron: '0 2 * * 0'  # 改为每周日
```

## 测试验证

### 本地测试

```bash
# 1. 配置
echo "学号" > /tmp/username
echo "密码" > /tmp/password
echo "云码token" > /tmp/token

# 2. 测试自动登录
python scripts/nju_auto_login.py

# 3. 验证cookie
python scripts/validate_cookie.py /tmp/cookie.json

# 4. 测试查询
python nju_electric_query.py \
  --cookie-file /tmp/cookie.json \
  -d ./database \
  53463
```

### GitHub Actions测试

1. 配置Secrets
2. Actions → Manual Electricity Query → Run workflow
3. 查看日志确认：
   ```
   === 开始自动登录流程 ===
   ✓ 配置文件已创建
   [验证码识别]
       ✓ 识别成功: adyq
   [4] 提交登录...
       ✓ 登录成功！
   [6] 验证Cookie...
       ✓ Cookie验证成功
   ```

## 文件清单

### 新增文件

```
scripts/
├── nju_auto_login.py      # 自动登录主脚本
└── test_yunma_api.py      # 云码API测试

docs/
├── auto-login.md          # 详细使用文档
├── github-actions-setup.md # 配置指南
└── auto-login-summary.md  # 集成总结
```

### 修改文件

```
.github/workflows/
├── daily-query.yml        # 添加自动登录步骤
└── manual-query.yml       # 添加自动登录步骤

requirements.txt           # 添加新依赖
README.md                  # 更新配置说明
```

## 部署步骤

1. **配置GitHub Secrets** (3个)
   - NJU_USERNAME
   - NJU_PASSWORD
   - YUNMA_TOKEN

2. **推送代码**
   ```bash
   git add .
   git commit -m "feat: integrate auto-login with captcha recognition"
   git push
   ```

3. **测试运行**
   - Actions → Manual Electricity Query → Run workflow
   - 检查日志确认自动登录成功

4. **验证数据**
   - 查看 `database/summaries/` 目录
   - 确认数据已更新

## 故障排查

### 登录失败

检查：
1. Secrets配置是否正确
2. 云码余额是否充足
3. 用户名密码是否正确
4. 网络连接是否正常

### Cookie无效

检查：
1. 登录步骤是否成功
2. 验证码识别是否正确
3. cookie文件是否生成

### 查询失败

检查：
1. Cookie验证是否通过
2. 房间ID是否正确
3. epay网站是否可访问

## 总结

✅ **完全自动化**: 无需手动更新cookie  
✅ **成本可控**: 月成本 < 1元  
✅ **稳定可靠**: 每次获取新cookie  
✅ **易于维护**: 只需配置3个secrets  

**下一步**: 配置GitHub Secrets并测试运行
