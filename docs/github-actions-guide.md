# GitHub Actions 长期使用指南

## 🎯 关键结论

### ✅ 免费 + 无限制使用方案

**将仓库设为公开**，即可享受：

- 🆓 **完全免费** - 不计入分钟数
- ∞ **无限制** - 每月可运行无限次
- 🚀 **标准Runner** - 2核CPU, 8GB内存, 14GB存储

---

## 📊 GitHub Actions 免费额度对比

| 仓库类型 | 免费分钟数/月 | 存储空间 | 限制 |
|---------|--------------|---------|------|
| **公开仓库** | **∞ 无限制** | 500MB | 无 |
| 私有仓库 (Free) | 2,000分钟 | 500MB | 超出付费 |
| 私有仓库 (Pro) | 3,000分钟 | 1GB | 超出付费 |

---

## 💰 私有仓库成本估算（仅供参考）

如果使用私有仓库：

```
60,000次查询/天 × 1.5秒/查询 = 90,000秒 = 1,500分钟/天

每月成本:
- GitHub Free: 超出 (1,500 × 30 - 2,000) = 43,000分钟 × $0.006 = $258/月
- GitHub Pro: 超出 (1,500 × 30 - 3,000) = 42,000分钟 × $0.006 = $252/月

年成本: ~$3,000+ 💸
```

**强烈建议**: 使用公开仓库，成本为 $0 ✅

---

## ⚡ 并发数优化建议

### 推荐配置

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| 并发数 | **30** | 平衡性能与稳定性 |
| 超时时间 | 120分钟 | 适应大批量查询 |
| 重试次数 | 3次 | 处理临时网络错误 |
| 重试间隔 | 5秒 | 指数退避 |

### 性能预估

**60,000次查询**：

```
并发数 30，单次查询1.5秒：
总耗时 = 60,000 / 30 × 1.5秒 = 3,000秒 ≈ 50分钟

考虑重试和网络波动：预计 1-1.5小时
```

### 并发数测试策略

```
第1天: 并发20 → 观察成功率
第2天: 成功率>95% → 并发30
第3天: 稳定运行 → 并发40-50（最大建议值）
```

---

## 🛡️ 长期使用保障

### 1. 仓库可见性

```bash
# GitHub 仓库设置
Settings → Danger Zone → Change visibility → Make public

# 优点
✅ 免费无限额度
✅ 社区贡献可能
✅ 透明度高

# 缺点
⚠️ 数据可见（但可gitignore数据库目录）
⚠️ Cookie需用Secret保护（已实现）
```

### 2. 数据安全

**已实施的措施**：

- ✅ `.gitignore` 排除 `database/` 和 `logs/`
- ✅ Cookie 存储在 GitHub Secrets
- ✅ 敏感信息不会提交到仓库

**可选增强**：

```yaml
# 使用 Git LFS 存储大型数据文件
git lfs install
git lfs track "database/**/*.json"

# 或定期清理旧数据
find database/ -name "*.json" -mtime +365 -delete
```

### 3. 监控告警

GitHub 自动通知：

- ✅ Workflow失败 → 邮件通知
- ✅ Actions页面 → 实时状态

自定义告警（可选）：

```yaml
- name: Send notification on failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: failure
    fields: repo,message,commit,author
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 📈 性能优化建议

### 1. 分时段查询（可选）

如果遇到服务器限流：

```yaml
# 方案A: 避开高峰时段
schedule:
  - cron: '0 2 * * *'  # 凌晨2点UTC（国内上午10点）

# 方案B: 分批次查询
jobs:
  batch-1:
    run: python nju_electric_query.py -c 20 rooms_1-20000.txt
  batch-2:
    run: python nju_electric_query.py -c 20 rooms_20001-40000.txt
  batch-3:
    run: python nju_electric_query.py -c 20 rooms_40001-60000.txt
```

### 2. 增量更新（推荐）

只查询变化的数据：

```python
# 伪代码
if data_exists_for_today(room_id):
    skip_query(room_id)
else:
    query_room(room_id)
```

### 3. 缓存优化

```yaml
- name: Cache Python dependencies
  uses: actions/cache@v3
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}
    restore-keys: |
      ${{ runner.os }}-pip-
```

---

## 🔧 故障应对

### 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| Cookie过期 | 7天有效期 | 每周更新Secret |
| IP限流 | 并发过高 | 降低到20-30 |
| 查询失败 | 网络波动 | 自动重试3次 |
| 超时 | 数据量大 | 增加到120分钟 |

### 应急预案

```yaml
# 降低并发 + 增加重试
- name: Fallback query
  if: failure()
  run: |
    python nju_electric_query.py \
      -d ./database \
      -c 20 \              # 降低并发
      --max-retries 5 \    # 增加重试
      ${{ steps.rooms.outputs.room_ids }}
```

---

## 📋 检查清单

使用前确认：

- [ ] 仓库已设为公开
- [ ] `EPAY_COOKIE` Secret已配置
- [ ] `config/room_ids.txt` 已填写
- [ ] `.gitignore` 排除了敏感目录
- [ ] Workflow 超时设置为120分钟
- [ ] 并发数设置为30

---

## 🎉 总结

**最优方案**：

1. ✅ 仓库设为公开 → 免费无限
2. ✅ 并发数30 → 约1小时完成
3. ✅ 每日自动运行 → 无需人工干预
4. ✅ Cookie每周更新 → 保持有效

**预估成本**: **$0/月** 🎊

**维护工作**: 每周更新一次Cookie（5分钟）

---

## 📚 相关文档

- [并发数评估报告](./concurrency-analysis.md)
- [故障排查指南](./troubleshooting.md)
- [GitHub Actions文档](https://docs.github.com/en/actions)
