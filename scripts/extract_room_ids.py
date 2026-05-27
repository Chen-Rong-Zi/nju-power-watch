#!/usr/bin/env python3
"""提取所有房间ID，优先从 config/room_ids.json 读取，回退到目录名解析"""
import os, sys, argparse, json
from pathlib import Path

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPPING_FILE = os.path.join(BASE_DIR, 'config', 'room_ids.json')

parser = argparse.ArgumentParser(description='Extract room IDs from mapping file or database')
parser.add_argument('directory', nargs='?', default='./database')
parser.add_argument('-o', '--output', metavar='FILE', help='Output to file')
args = parser.parse_args()


def extract_from_mapping():
    """从 config/room_ids.json 提取所有 current_id"""
    if not os.path.exists(MAPPING_FILE):
        return []

    with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
        mapping = json.load(f)

    ids = []
    for campus, buildings in mapping.items():
        for building, rooms in buildings.items():
            for room_name, entry in rooms.items():
                current_id = entry.get('current_id')
                if current_id:
                    ids.append(current_id)
    return ids


def extract_from_database(base_dir):
    """从数据库目录名提取 ID (向后兼容旧格式)"""
    ids = []
    for campus in os.listdir(base_dir):
        campus_path = os.path.join(base_dir, campus)
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
                    room_id = room[idx+1:]
                    if room_id.isdigit():
                        ids.append(room_id)
    return ids


# 优先从映射文件提取，若无则回退到目录名解析
ids = extract_from_mapping()
source = "mapping file"
if not ids:
    ids = extract_from_database(args.directory)
    source = "database directories"

print(f'Found {len(ids)} room IDs (source: {source})')

if args.output:
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        for rid in sorted(ids, key=int):
            f.write(f'{rid}\n')
else:
    for rid in sorted(ids, key=int):
        print(rid)
