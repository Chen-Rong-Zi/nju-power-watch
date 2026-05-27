#!/usr/bin/env python3
"""
一次性迁移脚本: 将数据模型从 room_id 主键迁移到房间名主键

变更:
  - 原始数据目录: {room}-{room_id}/ → {room}/
  - 原始数据 JSON: 移除 id/宿舍ID 字段
  - Summary rooms key: room_id → room_name
  - Summary 文件名: {room_id}.json → {room_name}.json
  - Summary room_id 字段: 移除
  - 生成 config/room_ids.json 映射文件

用法:
    python scripts/migrate_room_ids.py --database ./database --dry-run
    python scripts/migrate_room_ids.py --database ./database --apply
"""

import json
import os
import shutil
import sys
from pathlib import Path
from collections import defaultdict
from typing import Dict, Any
import argparse

BASE_DIR = Path(__file__).parent.parent


def scan_raw_data(database_dir: Path) -> Dict[str, Dict]:
    """
    扫描原始数据目录，建立映射表。
    Returns: {(campus, building, room_name): {"current_id": str, "previous_ids": [str], "dirs": [Path]}}
    """
    rooms = defaultdict(lambda: {"current_id": None, "previous_ids": [], "dirs": [], "id_dates": {}})

    for campus_dir in database_dir.iterdir():
        if not campus_dir.is_dir() or campus_dir.name in ('summaries', 'archives'):
            continue

        for building_dir in campus_dir.iterdir():
            if not building_dir.is_dir():
                continue

            for room_dir in building_dir.iterdir():
                if not room_dir.is_dir():
                    continue

                # 旧格式: {room_name}-{room_id}
                if '-' not in room_dir.name:
                    continue

                idx = room_dir.name.rfind('-')
                room_name_part = room_dir.name[:idx]
                room_id = room_dir.name[idx+1:]

                if not room_id.isdigit():
                    continue

                # 读取最新 JSON 获取校区/楼栋/房间名
                json_files = sorted(room_dir.glob("*.json"), key=lambda f: f.stem)
                if not json_files:
                    continue

                latest_json = json_files[-1]
                try:
                    with open(latest_json, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    continue

                if not data.get('success'):
                    continue

                campus = data.get('校区', campus_dir.name)
                building = data.get('楼栋', building_dir.name)
                room_name = data.get('房间', room_name_part)

                key = (campus, building, room_name)
                rooms[key]["dirs"].append(room_dir)
                rooms[key]["id_dates"][room_id] = [f.stem for f in json_files]

    # 确定 current_id: 最新日期对应的 ID
    for key, info in rooms.items():
        latest_date = ""
        latest_id = ""
        for room_id, dates in info["id_dates"].items():
            if dates and dates[-1] > latest_date:
                latest_date = dates[-1]
                latest_id = room_id

        info["current_id"] = latest_id
        info["previous_ids"] = [rid for rid in info["id_dates"] if rid != latest_id]

    return dict(rooms)


def migrate_raw_data(database_dir: Path, rooms: Dict, dry_run: bool = True):
    """迁移原始数据目录和文件"""
    print(f"\n{'[DRY RUN] ' if dry_run else ''}迁移原始数据...")

    for (campus, building, room_name), info in rooms.items():
        target_dir = database_dir / campus / building / room_name

        # 收集所有日期文件
        date_files = {}  # date -> (source_path, data)

        for room_dir in info["dirs"]:
            for json_file in room_dir.glob("*.json"):
                date = json_file.stem
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    continue

                if date in date_files:
                    # 同一天有多个文件，保留数字更大的 ID 对应的数据
                    existing_path = date_files[date][0]
                    existing_dir_name = existing_path.parent.name
                    existing_id = existing_dir_name.rsplit('-', 1)[-1]
                    new_id = room_dir.name.rsplit('-', 1)[-1]
                    if int(new_id) > int(existing_id):
                        date_files[date] = (json_file, data)
                else:
                    date_files[date] = (json_file, data)

        if dry_run:
            print(f"  {campus}/{building}/{room_name}: {len(info['dirs'])} dirs → 1 dir, "
                  f"{len(date_files)} date files, current_id={info['current_id']}")
            continue

        # 创建目标目录
        target_dir.mkdir(parents=True, exist_ok=True)

        # 写入合并后的文件（移除 id/宿舍ID 字段）
        for date, (source_path, data) in sorted(date_files.items()):
            target_file = target_dir / f"{date}.json"
            if target_file.exists():
                continue  # 不覆盖已有文件

            save_data = {k: v for k, v in data.items() if k not in ('id', '宿舍ID')}
            with open(target_file, 'w', encoding='utf-8') as f:
                json.dump(save_data, f, ensure_ascii=False, indent=2)

        # 删除旧目录
        for room_dir in info["dirs"]:
            if room_dir.exists() and room_dir != target_dir:
                shutil.rmtree(room_dir)

    if not dry_run:
        print(f"  原始数据迁移完成")


def migrate_summaries(database_dir: Path, rooms: Dict, dry_run: bool = True):
    """迁移 summaries 数据"""
    summaries_dir = database_dir / "summaries"
    if not summaries_dir.exists():
        print("  summaries 目录不存在，跳过")
        return

    print(f"\n{'[DRY RUN] ' if dry_run else ''}迁移 summaries 数据...")

    # 构建 room_id → room_name 映射（按校区/楼栋分组）
    id_to_name = {}  # (campus, building, room_id) → room_name
    for (campus, building, room_name), info in rooms.items():
        id_to_name[(campus, building, info["current_id"])] = room_name
        for prev_id in info["previous_ids"]:
            id_to_name[(campus, building, prev_id)] = room_name

    campuses_dir = summaries_dir / "campuses"
    if not campuses_dir.exists():
        return

    for campus_dir in campuses_dir.iterdir():
        if not campus_dir.is_dir():
            continue
        campus = campus_dir.name

        buildings_dir = campus_dir / "buildings"
        if not buildings_dir.exists():
            continue

        for building_dir in buildings_dir.iterdir():
            if not building_dir.is_dir():
                continue
            building = building_dir.name

            # a) 迁移 rooms/{room_id}.json → rooms/{room_name}.json
            rooms_dir = building_dir / "rooms"
            if rooms_dir.exists():
                room_files = {}  # room_name → merged data
                for room_file in list(rooms_dir.glob("*.json")):
                    room_id = room_file.stem
                    try:
                        with open(room_file, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                    except Exception:
                        continue

                    room_name = id_to_name.get((campus, building, room_id), data.get('room_name', room_id))
                    data.pop('room_id', None)

                    if room_name in room_files:
                        existing = room_files[room_name]
                        merged_history = existing.get('balance_history', {})
                        merged_history.update(data.get('balance_history', {}))
                        existing['balance_history'] = merged_history
                        latest_date = max(merged_history.keys()) if merged_history else ""
                        if latest_date:
                            existing['current_balance'] = merged_history[latest_date]
                            existing['last_updated'] = latest_date
                    else:
                        room_files[room_name] = data

                    if not dry_run:
                        room_file.unlink()

                if not dry_run:
                    for room_name, data in room_files.items():
                        new_file = rooms_dir / f"{room_name}.json"
                        with open(new_file, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False, indent=2)

                print(f"  rooms: {campus}/{building}: {len(room_files)} rooms migrated")

            # b) 迁移 building summary.json
            summary_file = building_dir / "summary.json"
            if summary_file.exists():
                try:
                    with open(summary_file, 'r', encoding='utf-8') as f:
                        summary = json.load(f)
                except Exception:
                    continue

                old_rooms = summary.get('rooms', {})
                new_rooms = {}

                for room_id, room_info in old_rooms.items():
                    room_name = id_to_name.get((campus, building, room_id), room_info.get('room_name', room_id))

                    if room_name in new_rooms:
                        existing = new_rooms[room_name]
                        if room_info.get('last_updated', '') > existing.get('last_updated', ''):
                            new_rooms[room_name] = room_info
                    else:
                        new_rooms[room_name] = room_info

                for room_name, info in new_rooms.items():
                    info.pop('room_name', None)

                summary['rooms'] = new_rooms
                summary['total_rooms'] = len(new_rooms)

                if not dry_run:
                    with open(summary_file, 'w', encoding='utf-8') as f:
                        json.dump(summary, f, ensure_ascii=False, indent=2)

                print(f"  summary: {campus}/{building}: {len(old_rooms)} → {len(new_rooms)} rooms")

            # c) 迁移 details.json
            details_file = building_dir / "details.json"
            if details_file.exists():
                try:
                    with open(details_file, 'r', encoding='utf-8') as f:
                        details = json.load(f)
                except Exception:
                    continue

                old_rooms = details.get('rooms', {})
                new_rooms = {}

                for room_id, room_data in old_rooms.items():
                    room_name = id_to_name.get((campus, building, room_id), room_data.get('room_name', room_id))
                    room_data.pop('room_id', None)

                    if room_name in new_rooms:
                        existing = new_rooms[room_name]
                        merged_history = existing.get('balance_history', {})
                        merged_history.update(room_data.get('balance_history', {}))
                        existing['balance_history'] = merged_history
                        latest = max(merged_history.keys()) if merged_history else ""
                        if latest:
                            existing['current_balance'] = merged_history[latest]
                            existing['last_updated'] = latest
                    else:
                        new_rooms[room_name] = room_data

                details['rooms'] = new_rooms
                details['total_rooms'] = len(new_rooms)

                if not dry_run:
                    with open(details_file, 'w', encoding='utf-8') as f:
                        json.dump(details, f, ensure_ascii=False, indent=2)

        # d) 迁移 campus summary.json
        campus_summary_file = campus_dir / "summary.json"
        if campus_summary_file.exists():
            try:
                with open(campus_summary_file, 'r', encoding='utf-8') as f:
                    campus_summary = json.load(f)
            except Exception:
                continue

            total_rooms = 0
            buildings = campus_summary.get('buildings', {})
            for building_name, bstats in buildings.items():
                building_summary_file = campuses_dir / campus / "buildings" / building_name / "summary.json"
                if building_summary_file.exists():
                    try:
                        with open(building_summary_file, 'r', encoding='utf-8') as f:
                            bs = json.load(f)
                        bstats['total_rooms'] = bs.get('total_rooms', 0)
                    except Exception:
                        pass
                total_rooms += bstats.get('total_rooms', 0)

            campus_summary['total_rooms'] = total_rooms

            if not dry_run:
                with open(campus_summary_file, 'w', encoding='utf-8') as f:
                    json.dump(campus_summary, f, ensure_ascii=False, indent=2)

    # e) 迁移 overview.json
    overview_file = summaries_dir / "overview.json"
    if overview_file.exists():
        try:
            with open(overview_file, 'r', encoding='utf-8') as f:
                overview = json.load(f)
        except Exception:
            overview = {}

        total_rooms = 0
        for campus_name, cstats in overview.get('campuses', {}).items():
            campus_summary_file = campuses_dir / campus_name / "summary.json"
            if campus_summary_file.exists():
                try:
                    with open(campus_summary_file, 'r', encoding='utf-8') as f:
                        cs = json.load(f)
                    cstats['total_rooms'] = cs.get('total_rooms', 0)
                except Exception:
                    pass
            total_rooms += cstats.get('total_rooms', 0)

        overview['total_rooms'] = total_rooms

        if not dry_run:
            with open(overview_file, 'w', encoding='utf-8') as f:
                json.dump(overview, f, ensure_ascii=False, indent=2)


def generate_mapping_file(database_dir: Path, rooms: Dict, dry_run: bool = True):
    """生成 config/room_ids.json 映射文件"""
    mapping = {}

    for (campus, building, room_name), info in rooms.items():
        campus_map = mapping.setdefault(campus, {})
        building_map = campus_map.setdefault(building, {})
        building_map[room_name] = {
            "current_id": info["current_id"],
            "previous_ids": info["previous_ids"]
        }

    mapping_file = database_dir.parent / "config" / "room_ids.json"

    if dry_run:
        print(f"\n[DRY RUN] 将写入映射文件: {mapping_file}")
        print(f"  校区数: {len(mapping)}")
        total = sum(len(b) for c in mapping.values() for b in c.values())
        print(f"  房间数: {total}")
    else:
        mapping_file.parent.mkdir(parents=True, exist_ok=True)
        with open(mapping_file, 'w', encoding='utf-8') as f:
            json.dump(mapping, f, ensure_ascii=False, indent=2)
        print(f"\n映射文件已写入: {mapping_file}")


def main():
    parser = argparse.ArgumentParser(description="迁移数据模型: room_id → room_name 主键")
    parser.add_argument("--database", "-d", default="./database", help="数据库目录")
    parser.add_argument("--apply", action="store_true", help="执行实际迁移（默认 dry-run）")
    args = parser.parse_args()

    database_dir = Path(args.database)
    if not database_dir.exists():
        print(f"错误: 目录不存在: {database_dir}")
        sys.exit(1)

    dry_run = not args.apply

    if dry_run:
        print("=== 预览模式 (使用 --apply 执行实际迁移) ===\n")

    print("步骤1: 扫描原始数据...")
    rooms = scan_raw_data(database_dir)
    print(f"  发现 {len(rooms)} 个房间")

    print("\n步骤2: 迁移原始数据目录")
    migrate_raw_data(database_dir, rooms, dry_run)

    print("\n步骤3: 迁移 summaries 数据")
    migrate_summaries(database_dir, rooms, dry_run)

    print("\n步骤4: 生成映射文件")
    generate_mapping_file(database_dir, rooms, dry_run)

    if dry_run:
        print("\n=== 预览完成，使用 --apply 执行实际迁移 ===")
    else:
        print("\n=== 迁移完成 ===")


if __name__ == "__main__":
    main()
