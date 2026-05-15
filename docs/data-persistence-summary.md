# 数据持久化总结

## 核心设计

### 问题
- GitHub Actions 每次运行都是全新环境
- 数据如何持久化？

### 解决方案

**只提交 Summary 数据，保留完整历史**

```
原始数据 (database/{校区}/)
  ↓ 查询
临时存储
  ↓ 聚合 + 合并
Summary (database/summaries/)
  ↓ 提交
Git 仓库 ✅
```

## 关键配置

### .gitignore
```gitignore
# 忽略原始数据
database/仙林校区/
database/鼓楼校区/
database/浦口校区/
database/苏州校区/

# 保留 Summary
!database/summaries/
```

### 聚合脚本
```python
# 合并新旧数据，保留所有历史
merged_history = existing.get('balance_history', {}).copy()
merged_history.update(new.get('balance_history', {}))
# 不删除旧数据！
```

### GitHub Actions
```yaml
# 只提交 summaries
git add database/summaries/ logs/
git commit -m "chore: update electricity summaries"
git push
```

## 数据结构

每个房间的 JSON 包含**完整历史**：

```json
{
  "room_id": "53463",
  "balance_history": {
    "20260515": 135.20,  // Day 1
    "20260516": 132.40,  // Day 2
    ...                  // 所有历史
    "20270417": 146.99   // Day 365
  }
}
```

## 空间对比

| 方案 | 1年 | 5年 |
|------|-----|-----|
| 原始数据 | ~182MB | ~910MB |
| Summary | ~5.5MB | ~27.5MB |
| **节省** | **97%** | **97%** |

## 优势

✅ **完整历史**：所有查询过的日期都保留  
✅ **空间高效**：比原始数据小 97%  
✅ **前端友好**：静态 JSON，无需后端  
✅ **灵活分析**：可计算任意时间范围统计  
✅ **趋势预测**：更多历史数据提高预测准确度  

## 前端使用

```javascript
// 加载完整历史
const room = await fetch(
  'database/summaries/campuses/仙林校区/buildings/19幢/rooms/53463.json'
).then(r => r.json());

// balance_history 包含所有历史数据
const dates = Object.keys(room.balance_history).sort();
console.log(`数据范围: ${dates[0]} ~ ${dates[dates.length-1]}`);
console.log(`总天数: ${dates.length}`);
```

## 参考

- 详细说明：[docs/data-persistence.md](data-persistence.md)
- 前端示例：[docs/frontend-usage-examples.md](frontend-usage-examples.md)
- 聚合脚本：[scripts/aggregate_data.py](../scripts/aggregate_data.py)
