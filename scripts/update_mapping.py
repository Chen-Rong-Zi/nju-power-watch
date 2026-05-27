#!/usr/bin/env python3
"""
更新 config/room_ids.json 映射文件

通过查询 API 获取每个 room_id 当前指向的房间，更新映射关系。

用法:
    python scripts/update_mapping.py --cookie-file /tmp/cookie.json
    python scripts/update_mapping.py --cookie-file /tmp/cookie.json --ids 101223 98799
"""

import asyncio
import aiohttp
import aiofiles
import argparse
import json
import re
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, Optional

BASE_DIR = Path(__file__).parent.parent
MAPPING_FILE = BASE_DIR / "config" / "room_ids.json"
IDS_FILE = BASE_DIR / "config" / "room_ids.txt"
BASE_URL = "https://epay.nju.edu.cn"

HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36",
    "Referer": "https://epay.nju.edu.cn/",
}


async def load_cookies(filepath: str) -> dict:
    async with aiofiles.open(filepath, "r", encoding="utf-8") as f:
        cookies_list = json.loads(await f.read())
    return {c["name"]: c["value"] for c in cookies_list if c.get("name") and c.get("value")}


def load_mapping() -> Dict:
    if MAPPING_FILE.exists():
        with open(MAPPING_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_mapping(mapping: Dict):
    MAPPING_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(MAPPING_FILE, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)


def load_room_ids() -> list:
    """从 config/room_ids.txt 加载 ID 列表"""
    if not IDS_FILE.exists():
        return []
    with open(IDS_FILE, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip() and not line.startswith("#")]


async def query_room_info(session: aiohttp.ClientSession, room_id: str, cookies: dict) -> Optional[dict]:
    """查询 room_id 当前指向的房间信息"""
    url = f"{BASE_URL}/epay/h5/nju/electric/charge?id={room_id}"
    try:
        async with session.get(url, cookies=cookies, headers=HEADERS,
                               timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                return None
            html = await resp.text()
            if "login" in html.lower() or "登录" in html:
                return None

            result = {"room_id": room_id}
            match = re.search(r'this\.check\s*=\s*(\{.*\})', html)
            if match:
                try:
                    check_data = json.loads(match.group(1))
                    result["campus"] = check_data.get("sysName", "")
                    result["building"] = check_data.get("buildName", "")
                    result["room_name"] = check_data.get("roomName", "")
                except json.JSONDecodeError:
                    return None

            if result.get("room_name"):
                return result
    except Exception:
        return None
    return None


def update_mapping_with_result(mapping: Dict, result: dict):
    """根据查询结果更新映射"""
    campus = result["campus"]
    building = result["building"]
    room_name = result["room_name"]
    room_id = result["room_id"]

    campus_map = mapping.setdefault(campus, {})
    building_map = campus_map.setdefault(building, {})

    # 检查该 room_id 是否已存在于其他房间名下
    for existing_room, entry in building_map.items():
        if entry.get("current_id") == room_id and existing_room != room_name:
            # ID 指向变更: 旧房间 ID 失效
            old_id = entry.pop("current_id", None)
            if old_id and old_id not in entry.get("previous_ids", []):
                entry.setdefault("previous_ids", []).append(old_id)
            entry["current_id"] = None
            print(f"  ID 变更: {room_id} 从 {existing_room} → {room_name}")

    if room_name in building_map:
        entry = building_map[room_name]
        old_id = entry.get("current_id")
        if old_id == room_id:
            pass  # 一致，无需更新
        else:
            # room_name 的 current_id 变了
            if old_id and old_id not in entry.get("previous_ids", []):
                entry.setdefault("previous_ids", []).append(old_id)
            entry["current_id"] = room_id
    else:
        # 新房间
        building_map[room_name] = {
            "current_id": room_id,
            "previous_ids": []
        }


async def async_main():
    parser = argparse.ArgumentParser(description="更新 room_id 映射文件")
    parser.add_argument("--cookie-file", type=str, default="/tmp/cookie.json")
    parser.add_argument("--ids", nargs="+", help="指定 room_id 列表")
    parser.add_argument("-c", "--concurrency", type=int, default=10)
    args = parser.parse_args()

    cookies = await load_cookies(args.cookie_file)

    # 获取 ID 列表
    if args.ids:
        room_ids = args.ids
    else:
        room_ids = load_room_ids()
        if not room_ids:
            print("错误: 没有 room_id 可查询。请提供 --ids 参数或创建 config/room_ids.txt")
            sys.exit(1)

    print(f"开始更新映射: {len(room_ids)} 个 room_id")

    # 加载现有映射
    mapping = load_mapping()

    # 查询并更新
    semaphore = asyncio.Semaphore(args.concurrency)
    connector = aiohttp.TCPConnector(limit=args.concurrency)

    async with aiohttp.ClientSession(connector=connector) as session:
        async def query_with_limit(room_id):
            async with semaphore:
                return await query_room_info(session, room_id, cookies)

        tasks = [query_with_limit(rid) for rid in room_ids]
        results = await asyncio.gather(*tasks)

    succeeded = 0
    failed = 0
    for result in results:
        if result:
            update_mapping_with_result(mapping, result)
            succeeded += 1
        else:
            failed += 1

    # 保存映射
    save_mapping(mapping)

    print(f"映射更新完成: 成功 {succeeded}, 失败 {failed}")
    print(f"映射文件: {MAPPING_FILE}")


def main():
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
