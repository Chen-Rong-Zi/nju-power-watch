#!/usr/bin/env python3
"""删除重复的房间ID，保留记录日期最多的一个"""

import os
import sys
import shutil
import re
import json
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_BASE = os.path.join(BASE_DIR, 'database')
SUMMARIES_DIR = os.path.join(DB_BASE, 'summaries', 'campuses')
CONFIG_FILE = os.path.join(BASE_DIR, 'config', 'room_ids.txt')

def get_all_rooms():
    rooms = defaultdict(list)

    for campus in os.listdir(DB_BASE):
        campus_path = os.path.join(DB_BASE, campus)
        if not os.path.isdir(campus_path) or campus in ('summaries', 'archives'):
            continue

        for building in os.listdir(campus_path):
            building_path = os.path.join(campus_path, building)
            if not os.path.isdir(building_path):
                continue

            for room in os.listdir(building_path):
                room_path = os.path.join(building_path, room)
                if not os.path.isdir(room_path):
                    continue

                if '-' in room:
                    idx = room.rfind('-')
                    name = room[:idx]
                    room_id = room[idx+1:]
                    date_count = len([f for f in os.listdir(room_path) if f.endswith('.json')])

                    key = (campus, building, name)
                    rooms[key].append((room_id, date_count, room_path))

    return rooms

def find_duplicates(rooms):
    return {k: v for k, v in rooms.items() if len(v) > 1}

def get_to_delete(duplicates):
    to_delete = []
    for key, id_list in duplicates.items():
        sorted_list = sorted(id_list, key=lambda x: -x[1])
        keep = sorted_list[0]
        delete = sorted_list[1:]

        print(f"房间 {key[2]} ({key[0]}/{key[1]}):")
        print(f"  保留: {keep[0]} ({keep[1]}条记录)")
        for d in delete:
            print(f"  删除: {d[0]} ({d[1]}条记录)")
            to_delete.append({
                'id': d[0],
                'campus': key[0],
                'building': key[1],
                'room_name': key[2],
                'path': d[2]
            })
        print()
    return to_delete

def update_building_summary(campus, building, room_ids_to_remove, dry_run=True):
    """更新楼栋级 summary.json，移除被删除的房间ID"""
    summary_path = os.path.join(SUMMARIES_DIR, campus, 'buildings', building, 'summary.json')
    if not os.path.exists(summary_path):
        return

    with open(summary_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    original = json.dumps(data, ensure_ascii=False)

    # 移除房间
    for room_id in room_ids_to_remove:
        data['rooms'].pop(room_id, None)

    data['total_rooms'] = len(data['rooms'])

    if dry_run:
        print(f"[DRY RUN] 将更新楼栋汇总: {summary_path}")
    else:
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"已更新楼栋汇总: {summary_path}")

def update_campus_summary(campus, building, removed_count, dry_run=True):
    """更新校区级 summary.json，更新楼栋的房间数"""
    summary_path = os.path.join(SUMMARIES_DIR, campus, 'summary.json')
    if not os.path.exists(summary_path):
        return

    with open(summary_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if building not in data['buildings']:
        return

    original_rooms = data['buildings'][building]['total_rooms']
    data['buildings'][building]['total_rooms'] = max(0, original_rooms - removed_count)

    # 重新计算校区的 total_rooms
    data['total_rooms'] = sum(b['total_rooms'] for b in data['buildings'].values())

    # 重新计算校区的 avg_balance (需要从楼栋汇总获取)
    total_balance = 0
    room_count = 0
    building_summary_path = os.path.join(SUMMARIES_DIR, campus, 'buildings', building, 'summary.json')
    if os.path.exists(building_summary_path):
        with open(building_summary_path, 'r', encoding='utf-8') as f:
            building_data = json.load(f)
        for rid, info in building_data.get('rooms', {}).items():
            total_balance += info.get('current_balance', 0)
            room_count += 1

    if room_count > 0:
        data['buildings'][building]['avg_balance'] = round(total_balance / room_count, 2)

    if dry_run:
        print(f"[DRY RUN] 将更新校区汇总: {summary_path}")
    else:
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"已更新校区汇总: {summary_path}")

def delete_room_data(to_delete, dry_run=True):
    action = "将删除" if dry_run else "正在删除"
    print(f"\n=== {action} {len(to_delete)} 个房间目录 ===\n")

    # 按楼栋分组，方便后续更新汇总
    by_building = defaultdict(list)
    for item in to_delete:
        key = (item['campus'], item['building'])
        by_building[key].append(item['id'])

    for item in to_delete:
        room_id = item['id']
        campus = item['campus']
        building = item['building']

        if os.path.exists(item['path']):
            if dry_run:
                print(f"[DRY RUN] 删除原始数据: {item['path']}")
            else:
                shutil.rmtree(item['path'])
                print(f"删除原始数据: {item['path']}")

        # 删除房间级汇总
        room_summary_path = os.path.join(SUMMARIES_DIR, campus, 'buildings', building, 'rooms', f'{room_id}.json')
        if os.path.exists(room_summary_path):
            if dry_run:
                print(f"[DRY RUN] 删除汇总数据: {room_summary_path}")
            else:
                os.remove(room_summary_path)
                print(f"删除汇总数据: {room_summary_path}")

    # 统一更新楼栋和校区汇总
    for (campus, building), room_ids in by_building.items():
        update_building_summary(campus, building, room_ids, dry_run)
        update_campus_summary(campus, building, len(room_ids), dry_run)

def update_config_file(to_delete, dry_run=True):
    ids_to_delete = set(item['id'] for item in to_delete)

    if not os.path.exists(CONFIG_FILE):
        print(f"配置文件不存在: {CONFIG_FILE}")
        return

    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = [line for line in lines if line.strip() not in ids_to_delete]

    if dry_run:
        removed = [line.strip() for line in lines if line.strip() in ids_to_delete]
        if removed:
            print(f"[DRY RUN] 将从 room_ids.txt 移除 {len(removed)} 个ID")
    else:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        print(f"已更新 {CONFIG_FILE}")

def update_details_md(to_delete, dry_run=True):
    by_building = defaultdict(list)
    for item in to_delete:
        key = (item['campus'], item['building'])
        by_building[key].append(item['id'])

    for (campus, building), ids in by_building.items():
        details_path = os.path.join(DB_BASE, campus, building, 'details.md')
        if not os.path.exists(details_path):
            continue

        with open(details_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content
        for room_id in ids:
            content = re.sub(rf'^- {room_id}\n', '', content, flags=re.MULTILINE)

        if content != original:
            if dry_run:
                print(f"[DRY RUN] 将更新 details.md: {details_path}")
            else:
                with open(details_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"已更新 details.md: {details_path}")

def main():
    dry_run = '--apply' not in sys.argv

    if dry_run:
        print("=== 预览模式 (使用 --apply 执行实际删除) ===\n")

    print("扫描所有房间...")
    rooms = get_all_rooms()
    print(f"共 {len(rooms)} 个不同的房间名\n")

    duplicates = find_duplicates(rooms)
    print(f"发现 {len(duplicates)} 个房间有多个ID\n")

    to_delete = get_to_delete(duplicates)
    print(f"共需删除 {len(to_delete)} 个ID\n")

    delete_room_data(to_delete, dry_run)
    update_config_file(to_delete, dry_run)
    update_details_md(to_delete, dry_run)

    if dry_run:
        print("\n=== 预览完成，如需执行实际删除请加 --apply 参数 ===")
    else:
        print("\n=== 删除完成 ===")

if __name__ == '__main__':
    main()
