#!/usr/bin/env python3
"""
统计 ./database 目录下每一楼栋的房间ID，并保存到 details.md
"""

import os
import json
from datetime import datetime
from pathlib import Path
from collections import defaultdict

def main():
    base_dir = Path("./database/")
    total_buildings = 0
    total_rooms = 0

    # 遍历所有校区
    for campus in sorted(base_dir.iterdir()):
        if not campus.is_dir():
            continue

        print(f"\n{campus.name}")
        print("=" * 40)

        # 遍历该校区下所有楼栋
        for building in sorted(campus.iterdir()):
            if not building.is_dir():
                continue

            room_ids = []

            # 遍历该楼栋下所有房间目录
            for room_dir in building.iterdir():
                if room_dir.is_dir():
                    # 目录名格式: {房间名}-{房间id}
                    parts = room_dir.name.rsplit('-', 1)
                    if len(parts) == 2:
                        room_id = parts[1]
                        if room_id.isdigit():
                            room_ids.append(room_id)

            if room_ids:
                total_buildings += 1
                total_rooms += len(room_ids)

                # 保存到 details.md
                details_file = building / "details.md"
                date_str = datetime.now().strftime("%Y年 %m月 %d日 %A %H:%M:%S %Z")
                with open(details_file, "w", encoding="utf-8") as f:
                    f.write(f"# {building.name}\n\n")
                    f.write(f"## 统计信息\n\n")
                    f.write(f"- 总房间数: {len(room_ids)}\n")
                    f.write(f"- 数据更新时间: {date_str}\n\n")
                    f.write(f"## 房间ID列表\n\n")
                    for rid in sorted(room_ids, key=int):
                        f.write(f"- {rid}\n")

                print(f"  {building.name}: {len(room_ids)} 个房间 -> 已保存到 details.md")

    print(f"\n{'=' * 50}")
    print(f"统计完成!")
    print(f"  总楼栋数: {total_buildings}")
    print(f"  总房间数: {total_rooms}")

if __name__ == "__main__":
    main()
