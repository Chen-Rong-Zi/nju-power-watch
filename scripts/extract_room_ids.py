#!/usr/bin/env python3
"""从database目录提取所有房间ID"""
import os, sys, argparse
from collections import defaultdict

parser = argparse.ArgumentParser(description='Extract room IDs from database')
parser.add_argument('directory', nargs='?', default='./database')
parser.add_argument('-o', '--output', metavar='FILE', help='Output to file')
parser.add_argument('--no-comment', action='store_true')
args = parser.parse_args()

def extract_room_ids(base_dir):
    ids, id_to_path = [], {}
    for campus in os.listdir(base_dir):
        campus_path = os.path.join(base_dir, campus)
        if not os.path.isdir(campus_path) or campus in ('summaries', 'archives'): continue
        for building in os.listdir(campus_path):
            building_path = os.path.join(campus_path, building)
            if not os.path.isdir(building_path): continue
            for room in os.listdir(building_path):
                room_path = os.path.join(building_path, room)
                if not os.path.isdir(room_path): continue
                if '-' in room:
                    idx = room.rfind('-')
                    room_id = room[idx+1:]
                    if room_id.isdigit():
                        ids.append(room_id)
                        id_to_path[room_id] = room_path
    return ids, id_to_path

ids, id_to_path = extract_room_ids(args.directory)
print(f'Found {len(ids)} room IDs')

by_location = defaultdict(list)
for room_id, path in id_to_path.items():
    parts = path.split(os.sep)
    if len(parts) >= 2:
        building = parts[-2]
        by_location[building].append(room_id)

if args.output:
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        # if not args.no_comment:
            # f.write(f'# {args.directory}\n')
        for building, room_ids in sorted(by_location.items()):
            if not args.no_comment:
                f.write(f'# {building}\n')
            for rid in sorted(room_ids, key=int):
                f.write(f'{rid}\n')
    # print(f'Saved to {args.output}')
else:
    for rid in sorted(ids, key=int):
        print(rid)
