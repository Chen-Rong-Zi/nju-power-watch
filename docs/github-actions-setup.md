# GitHub Actions 配置指南

## 自动登录集成说明

GitHub Actions工作流已集成自动登录功能，每次查询前自动获取新的cookie，无需手动更新。

## 必需的GitHub Secrets

在仓库中配置以下Secrets：

### 1. 访问仓库设置

```
仓库页面 → Settings → Secrets and variables → Actions → New repository secret
```

### 2. 添加以下三个Secrets

#### NJU_USERNAME

```
Name: NJU_USERNAME
Value: 你的学号（例如：201250000）
```

#### NJU_PASSWORD

```
Name: NJU_PASSWORD
Value: 你的统一身份认证密码
```

#### YUNMA_TOKEN

```
Name: YUNMA_TOKEN
Value: 云码API Token（从 https://zhuce.jfbym.com 获取）
```

### 配置截图示例

```
┌─────────────────────────────────────┐
│ Repository secrets                  │
├─────────────────────────────────────┤
│ NJU_USERNAME      201250000        │
│ NJU_PASSWORD      ••••••••••       │
│ YUNMA_TOKEN       TA6djdhm0N...    │
└─────────────────────────────────────┘
```

## 工作流说明

### daily-query.yml（每日自动查询）

**触发条件**:
- 每天UTC 2:00自动运行
- 手动触发

**执行流程**:

```
1. Checkout 代码
2. 安装 Python 依赖
3. 自动登录获取Cookie ← 🆕 自动化
4. 验证 Cookie 有效性
5. 读取房间ID列表
6. 查询所有房间电费
7. 生成聚合数据
8. 提交到仓库
```

### manual-query.yml（手动查询）

**触发条件**:
- 手动触发（Actions → Manual Electricity Query → Run workflow）

**可选参数**:
- `room_ids`: 指定查询的房间ID（留空使用config/room_ids.txt）
- `skip_existing`: 是否跳过已有数据的房间

## 自动登录流程

### 步骤详解

```yaml
- name: Auto login to get cookie
  env:
    NJU_USERNAME: ${{ secrets.NJU_USERNAME }}
    NJU_PASSWORD: ${{ secrets.NJU_PASSWORD }}
    YUNMA_TOKEN: ${{ secrets.YUNMA_TOKEN }}
  run: |
    # 写入配置文件
    echo "$NJU_USERNAME" > /tmp/username
    echo "$NJU_PASSWORD" > /tmp/password
    echo "$YUNMA_TOKEN" > /tmp/token
    
    # 执行自动登录
    python scripts/nju_auto_login.py
```

### 登录成功标志

```
=== 开始自动登录流程 ===
✓ 配置文件已创建
[验证码识别]
    ✓ 识别成功: adyq
[3] 加密密码...
    ✓ 密码已加密
[4] 提交登录...
    ✓ 登录成功！
[6] 验证Cookie...
    ✓ Cookie验证成功
✓ Cookie文件已生成: /tmp/cookie.json
```

## 成本分析

### 云码API费用

**验证码识别**:
- 每次识别: ~0.01-0.03元
- 每日自动登录: 1次
- **月成本**: ~0.3-0.9元
- **年成本**: ~3.6-10.8元

**优化策略**:
- Cookie有效期约7天
- 可调整为每周登录1次
- **优化后月成本**: ~0.04-0.12元
- **优化后年成本**: ~0.48-1.44元

### 调整登录频率

修改 `.github/workflows/daily-query.yml`:

```yaml
on:
  schedule:
    - cron: '0 2 * * 0'  # 改为每周日运行
```

## 故障排查

### 1. 登录失败

**可能原因**:
- 用户名或密码错误
- 云码Token无效或余额不足
- 验证码识别失败
- 网络问题

**检查步骤**:

```bash
# 本地测试
echo "学号" > /tmp/username
echo "密码" > /tmp/password
echo "云码token" > /tmp/token
python scripts/nju_auto_login.py
```

**查看GitHub Actions日志**:
```
Actions → 选择失败的workflow → 查看详细日志
```

### 2. Token余额不足

**症状**:
```
✗ 识别失败: 余额不足
```

**解决**:
- 访问 https://zhuce.jfbym.com
- 充值积分（最低充值10元）
- 或减少登录频率

### 3. 验证码识别错误

**症状**:
```
✗ 登录失败
提示: 可能是验证码识别错误，请重试
```

**解决**:
- 工作流会自动重试（下次定时运行）
- 手动触发workflow重试
- 或切换验证码类型（修改scripts/nju_auto_login.py中的YUNMA_CAPTCHA_TYPE）

### 4. Cookie无效

**症状**:
```
✗ Cookie validation failed
```

**解决**:
- 检查登录步骤是否成功
- 手动触发workflow重新登录
- 检查secrets配置是否正确

## 监控与告警

### GitHub Actions通知

默认情况下，GitHub会向仓库管理员发送邮件通知：
- ✅ 工作流成功
- ❌ 工作流失败

### 自定义通知

在workflow中添加Slack/钉钉通知（可选）:

```yaml
- name: Notify on failure
  if: failure()
  run: |
    curl -X POST -H 'Content-type: application/json' \
      --data '{"text":"❌ 登录失败，请检查secrets配置"}' \
      ${{ secrets.WEBHOOK_URL }}
```

## 安全最佳实践

### ✅ 应该做的

1. **定期更换密码**: 每月更换一次统一身份认证密码
2. **监控余额**: 定期检查云码账户余额
3. **审查日志**: 定期查看GitHub Actions日志
4. **限制权限**: 只授予必要的仓库权限

### ❌ 不应该做的

1. **不要在代码中硬编码密码**
2. **不要共享secrets给他人**
3. **不要提交/tmp目录下的配置文件**
4. **不要禁用workflow权限检查**

## 工作流状态徽章

在README.md中添加状态徽章:

```markdown
[![Daily Query](https://github.com/你的用户名/仓库名/actions/workflows/daily-query.yml/badge.svg)](https://github.com/你的用户名/仓库名/actions/workflows/daily-query.yml)
```

## 相关文档

- [自动登录详细文档](auto-login.md)
- [云码API文档](https://zhuce.jfbym.com/demo.html)
- [数据持久化机制](data-persistence.md)
- [分级聚合架构](hierarchical-aggregation.md)

## 快速检查清单

部署前确认以下事项：

- [ ] 已添加 `NJU_USERNAME` secret
- [ ] 已添加 `NJU_PASSWORD` secret  
- [ ] 已添加 `YUNMA_TOKEN` secret
- [ ] 云码账户余额充足（>100积分）
- [ ] config/room_ids.txt 包含要查询的房间
- [ ] 手动触发workflow测试成功
- [ ] 查看日志确认登录成功

## 示例：完整配置流程

```bash
# 1. Fork或克隆仓库
git clone https://github.com/your-username/dorm_public.git
cd dorm_public

# 2. 在GitHub网页配置secrets
# Settings → Secrets → New repository secret
# 添加 NJU_USERNAME, NJU_PASSWORD, YUNMA_TOKEN

# 3. 修改房间列表（如需要）
echo "53463" > config/room_ids.txt
echo "53464" >> config/room_ids.txt

# 4. 提交并推送
git add config/room_ids.txt
git commit -m "chore: update room IDs"
git push

# 5. 手动触发测试
# Actions → Manual Electricity Query → Run workflow

# 6. 检查结果
# Actions → 查看workflow运行结果
# database/summaries/ 目录查看生成的数据
```

## 常见问题

**Q: 为什么每次都要重新登录？**  
A: Cookie有效期约7天，每天自动登录确保cookie始终有效。

**Q: 可以改为每周登录一次吗？**  
A: 可以，修改cron表达式为 `'0 2 * * 0'`（每周日）。

**Q: 云码识别失败怎么办？**  
A: 工作流会在下次运行时自动重试。如果持续失败，检查token和余额。

**Q: 如何查看已查询的数据？**  
A: 查看 `database/summaries/` 目录，或访问GitHub Pages（如已配置）。

**Q: 工作流运行时间过长？**  
A: 正常，查询500个房间需要约20-30分钟。可减少房间数量或调整并发数。
