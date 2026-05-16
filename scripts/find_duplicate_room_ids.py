#!/usr/bin/env python3
"""找出有多个ID的房间"""

import os
import sys
from collections import defaultdict

def find_duplicate_rooms(base_dir='./database'):
    rooms = defaultdict(list)

    for campus in os.listdir(base_dir):
        campus_path = os.path.join(base_dir, campus)
        if not os.path.isdir(campus_path):
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
                    name = f"{campus}/{building}/{room[:idx]}"
                    room_id = room[idx+1:]
                    rooms[name].append(room_id)

    dup = {name: ids for name, ids in rooms.items() if len(ids) > 1}
    return dup, len(rooms)

if __name__ == '__main__':
    base_dir = sys.argv[1] if len(sys.argv) > 1 else "./database"
    dup, total = find_duplicate_rooms(base_dir)

    print(f'总房间数: {total}')
    print(f'有多个ID的房间数: {len(dup)}')
    print(f'重复率: {len(dup)/total*100:.1f}%\n')

    # 按ID数量排序输出
    count = 0
    for name, ids in sorted(dup.items(), key=lambda x: -len(x[1])):
        print(f'{name}: {len(ids)}个ID -> {", ".join(ids)}')
        count += len(ids)
    print(f"总重复 {count - len(dup)}")
