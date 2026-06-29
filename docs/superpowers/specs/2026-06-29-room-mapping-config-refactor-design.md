# Room Mapping Config Refactor

## 问题

`config/room_ids.txt` 只保存 bare ID，没有房间名信息。GitHub Actions 每日/每月 scan 时：

1. `load_existing_ids()` 只能按 ID 去重（跳过已在 TXT 中的数字）
2. 当系统重新分配 ID（同一房间获得新 ID），旧 ID 和新 ID 不同 → scan 认为新 ID 是"新房间" → 重复添加
3. daily-query 同时查两个 ID → 浪费资源

## 目标

- 配置文件保存 `房间名 → ID` 映射，scan 按房间名去重
- 通过 mypy --strict 和 pyright strict 类型检查（仅 config 相关代码）
- 上线后 GitHub Actions 每日/每月 scan 正确执行

## 解决方案

### 1. 配置文件格式 (`config/room_ids.json`)

三层嵌套 JSON：

```json
{
  "仙林校区": {
    "19幢": {
      "19栋第16层1613": "103407",
      "19栋第16层1614": "102385"
    }
  }
}
```

- 键 = 房间名，值 = 当前 ID（字符串）
- 无 `previous_ids`，直接替换

### 2. 新增 `scripts/config_utils.py`

类型安全的配置管理模块，通过 mypy --strict。

**类型定义：**

```python
RoomIdMapping: TypeAlias = dict[str, str]   # {房间名: ID}
BuildingMapping: TypeAlias = dict[str, RoomIdMapping]
CampusMapping: TypeAlias = dict[str, BuildingMapping]
```

**接口函数：**

| 函数 | 说明 |
|------|------|
| `load_mapping(path: str \| Path) -> CampusMapping` | 加载 JSON，文件不存在返回空 dict |
| `save_mapping(mapping: CampusMapping, path: str \| Path) -> None` | 保存到 JSON |
| `extract_ids(mapping: CampusMapping) -> list[str]` | 提取所有 ID 平铺列表 |
| `is_room_known(mapping, campus, building, room_name) -> bool` | scan 去重检查 |
| `update_id(mapping, campus, building, room_name, new_id) -> bool` | 新增/替换，返回 True=新增 False=替换 |
| `to_flat_lines(mapping: CampusMapping) -> list[str]` | 兼容输出纯 ID 列表 |

### 3. 修改 `nju_electric_query.py`

**3a. `load_existing_ids()` 替换**

原函数（从 TXT 解析 ID → `(campus, building)`）改为调用 `config_utils.load_mapping()`。

**3b. `scan_room_ids()` 去重逻辑**

```
旧: 跳过 str(room_id) in existing_ids（数字去重）
新: 跳过 is_room_known(mapping, 校区, 楼栋, 房间名)（房间名去重）
```

scan_single 流程：

1. 请求 API 获取房间信息
2. 解析出 `(校区, 楼栋, 房间名)`
3. 若 `is_room_known()` → 跳过
4. 否则 → `update_id()` 添加
5. scan 完成后 `save_mapping()` 写入 `config/room_ids.json`

**3c. 新增 `--from-mapping` 参数**

新增 `--from-mapping CONFIG_PATH` 参数：从 JSON 配置文件读取所有房间 ID 并查询，替代直接在命令行传 ID 列表。

```bash
# 用法
python nju_electric_query.py --from-mapping config/room_ids.json -d ./database -c 200 -q
```

等价于先 `extract_ids()` 再逐个查询。

**3d. `--scan-output` 参数**

默认从 `config/room_ids.txt` 改为 `config/room_ids.json`。

### 4. GitHub Actions 修改

**daily-query.yml：**
- 删除独立的 `Read room IDs` 步骤
- `Query electricity data` 步骤直接使用 `--from-mapping config/room_ids.json`

```yaml
- name: Query electricity data
  id: query
  run: |
    python nju_electric_query.py \
      --cookie-file /tmp/cookie.json \
      --from-mapping config/room_ids.json \
      -d ./database \
      -c 200 \
      -q \
      2>&1 | tee query_output.log
```

**monthly-scan-*.yml：**
- `--scan-output` 指向 `config/room_ids.json`
- 提交 `config/room_ids.json` 而非 `config/room_ids.txt`

### 5. `config/room_ids.txt` 废弃

不再由任何脚本写入。第一次 scan 后自动生成 JSON 格式，TXT 可手动删除。

## 影响范围

| 文件 | 改动类型 | 类型检查 |
|------|----------|----------|
| `scripts/config_utils.py` | 新增 | mypy --strict + pyright strict |
| `nju_electric_query.py` | 修改 scan + load_existing_ids | 仅 config 相关代码 |
| `.github/workflows/daily-query.yml` | 修改 | — |
| `.github/workflows/monthly-scan-*.yml` | 修改 | — |
| `config/room_ids.txt` | 废弃 | — |
| `config/room_ids.json` | 新增（由脚本生成） | — |

## 不涉及

- `scripts/update_mapping.py` — 已兼容 JSON 格式
- `scripts/extract_room_ids.py` — 已兼容 JSON 格式
- 其他 `scripts/` 目录下的脚本 — 不强制类型检查
- `database/` 目录下的数据文件 — 不动
