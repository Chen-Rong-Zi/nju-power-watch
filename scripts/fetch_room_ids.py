#!/usr/bin/env python3
"""
获取南京大学电费系统中的所有房间ID映射

通过遍历校区→楼栋→房间的三级结构，获取最新的房间-ID对应关系。

用法:
    python scripts/fetch_room_ids.py --cookie-file /tmp/cookie.json --output room_mapping.json
    python scripts/fetch_room_ids.py --cookie-file /tmp/cookie.json --campus "仙林校区" --building "19幢"
"""

import asyncio
import aiohttp
import aiofiles
import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlencode
from datetime import datetime

# 默认 Cookie 文件路径
DEFAULT_COOKIE_FILE = "/tmp/cookie.json"

BASE_URL = "https://epay.nju.edu.cn"

# 校区系统ID映射（硬编码，因为API可能不稳定）
CAMPUS_SYSID = {
    "仙林校区": 3,
    "鼓楼校区": 2,
    "苏州校区": 7,
    "浦口校区": 8,
}

# 楼栋ID前缀映射
BUILDING_PREFIX = {
    "仙林校区": "xl",
    "鼓楼校区": "gl",
    "苏州校区": "sz",
    "浦口校区": "pk",
}


async def load_cookies_from_file(filepath: str) -> dict:
    """从浏览器导出的 JSON 文件加载 cookie"""
    async with aiofiles.open(filepath, "r", encoding="utf-8") as f:
        content = await f.read()
        cookies_list = json.loads(content)

    cookies = {}
    for cookie in cookies_list:
        name = cookie.get("name")
        value = cookie.get("value")
        if name and value:
            cookies[name] = value

    return cookies


async def get_csrf_token(session: aiohttp.ClientSession, cookies: dict) -> str:
    """获取 CSRF Token"""
    async with session.get(f"{BASE_URL}/epay/h5/nju/electric/index", cookies=cookies) as resp:
        html = await resp.text()
        match = re.search(r'<meta name="_csrf" content="([^"]+)"', html)
        if match:
            return match.group(1)
    return ""


async def fetch_with_playwright_fallback(
    session: aiohttp.ClientSession,
    cookies: dict,
    csrf_token: str,
    url: str,
    data: str,
    content_type: str = "application/x-www-form-urlencoded; charset=UTF-8"
) -> Optional[dict]:
    """尝试通过API获取数据，如果失败则返回None"""
    headers = {
        "X-CSRF-TOKEN": csrf_token,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": content_type,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": f"{BASE_URL}/epay/h5/nju/electric/edit",
    }

    try:
        async with session.post(url, cookies=cookies, headers=headers, data=data) as resp:
            if resp.status == 200:
                text = await resp.text()
                try:
                    result = json.loads(text)
                    if result.get("retcode") == "0":
                        return result
                except json.JSONDecodeError:
                    pass
    except Exception:
        pass

    return None


async def fetch_buildings_direct(
    session: aiohttp.ClientSession,
    cookies: dict,
    csrf_token: str,
    sysid: int
) -> List[dict]:
    """
    直接通过页面获取楼栋列表
    访问edit页面，解析页面中的楼栋数据
    """
    # 尝试API方式
    result = await fetch_with_playwright_fallback(
        session, cookies, csrf_token,
        f"{BASE_URL}/epay/h5/getbuild.json",
        f"sysid={sysid}&areaid=0&districtid=0"
    )

    if result:
        return result.get("list", [])

    return []


async def fetch_rooms_direct(
    session: aiohttp.ClientSession,
    cookies: dict,
    csrf_token: str,
    sysid: int,
    buildid: str
) -> List[dict]:
    """
    获取房间列表
    """
    result = await fetch_with_playwright_fallback(
        session, cookies, csrf_token,
        f"{BASE_URL}/epay/h5/getroom.json",
        f"sysid={sysid}&areaid=0&districtid=0&buildid={buildid}&floorid=0"
    )

    if result:
        return result.get("list", [])

    return []


async def fetch_room_balance(
    session: aiohttp.ClientSession,
    cookies: dict,
    room_id: int
) -> Optional[dict]:
    """通过房间ID查询余额，验证ID有效性并获取房间信息"""
    url = f"{BASE_URL}/epay/h5/nju/electric/charge?id={room_id}"

    async with session.get(url, cookies=cookies) as resp:
        if resp.status != 200:
            return None

        html = await resp.text()

        # 检查是否需要登录
        if "login" in html.lower() or "登录" in html:
            return None

        result = {}

        # 从 JS 片段提取 this.check 的 JSON 数据
        match = re.search(r'this\.check\s*=\s*(\{.*?\})', html, re.DOTALL)
        if match:
            try:
                check_data = json.loads(match.group(1))
                result["campus"] = check_data.get("sysName", "")
                result["building"] = check_data.get("buildName", "")
                result["room_name"] = check_data.get("roomName", "")
                result["room_id"] = check_data.get("roomId", "")
                result["db_id"] = check_data.get("id", "")

                # 提取余额
                campus = result.get("campus", "")
                is_suzhou = campus == "苏州校区"

                if is_suzhou:
                    match_bal = re.search(r'剩余余额.*?<i>([\d.]+元)</i>', html)
                    if match_bal:
                        result["balance"] = match_bal.group(1)
                else:
                    match_bal = re.search(r'剩余电量.*?<i>([\d.]+度)</i>', html)
                    if match_bal:
                        result["balance"] = match_bal.group(1)

                return result
            except json.JSONDecodeError:
                pass

        return None


async def fetch_all_rooms_for_building(
    session: aiohttp.ClientSession,
    cookies: dict,
    csrf_token: str,
    campus_name: str,
    building_name: str,
    building_id: str,
    sysid: int,
    semaphore: asyncio.Semaphore
) -> List[dict]:
    """获取单个楼栋的所有房间"""
    async with semaphore:
        rooms = await fetch_rooms_direct(session, cookies, csrf_token, sysid, building_id)

        result = []
        for room in rooms:
            result.append({
                "campus": campus_name,
                "building": building_name,
                "building_id": building_id,
                "room_id": room.get("roomId", ""),
                "room_name": room.get("roomName", ""),
            })

        return result


async def fetch_all_mappings(
    cookies: dict,
    campuses: Optional[List[str]] = None,
    buildings: Optional[Dict[str, List[str]]] = None,
    max_concurrent: int = 5,
    progress_callback=None
) -> List[dict]:
    """
    获取所有房间映射

    Args:
        cookies: Cookie字典
        campuses: 要查询的校区列表，None表示全部
        buildings: 要查询的楼栋 {校区: [楼栋名列表]}，None表示全部
        max_concurrent: 最大并发数
        progress_callback: 进度回调函数
    """
    connector = aiohttp.TCPConnector(limit=max_concurrent)
    all_rooms = []

    async with aiohttp.ClientSession(connector=connector) as session:
        csrf_token = await get_csrf_token(session, cookies)

        if not csrf_token:
            print("错误: 无法获取CSRF Token，请检查Cookie是否有效")
            return []

        # 确定要查询的校区
        target_campuses = campuses if campuses else list(CAMPUS_SYSID.keys())

        semaphore = asyncio.Semaphore(max_concurrent)

        for campus_name in target_campuses:
            sysid = CAMPUS_SYSID.get(campus_name)
            if not sysid:
                print(f"警告: 未知校区 {campus_name}")
                continue

            if progress_callback:
                progress_callback(f"正在获取 {campus_name} 的楼栋列表...")

            # 获取楼栋列表
            building_list = await fetch_buildings_direct(session, cookies, csrf_token, sysid)

            if not building_list:
                print(f"警告: 无法获取 {campus_name} 的楼栋列表，尝试使用已知数据")
                continue

            # 确定要查询的楼栋
            target_buildings = buildings.get(campus_name) if buildings else None

            tasks = []
            for b in building_list:
                building_name = b.get("buiName", "")
                building_id = b.get("buiId", "")

                # 如果指定了楼栋列表，只查询指定的楼栋
                if target_buildings and building_name not in target_buildings:
                    continue

                tasks.append(
                    fetch_all_rooms_for_building(
                        session, cookies, csrf_token,
                        campus_name, building_name, building_id, sysid, semaphore
                    )
                )

            if progress_callback:
                progress_callback(f"正在获取 {campus_name} 的 {len(tasks)} 个楼栋的房间...")

            results = await asyncio.gather(*tasks)

            for rooms in results:
                all_rooms.extend(rooms)

            if progress_callback:
                progress_callback(f"{campus_name} 完成，累计 {len(all_rooms)} 个房间")

    return all_rooms


async def fetch_single_building_rooms(
    cookies: dict,
    campus_name: str,
    building_name: str,
    max_concurrent: int = 5
) -> List[dict]:
    """获取单个楼栋的所有房间"""
    return await fetch_all_mappings(
        cookies,
        campuses=[campus_name],
        buildings={campus_name: [building_name]},
        max_concurrent=max_concurrent
    )


async def async_main():
    parser = argparse.ArgumentParser(description="获取南京大学电费系统房间ID映射")
    parser.add_argument("--cookie-file", type=str, help="Cookie JSON文件路径", default=DEFAULT_COOKIE_FILE)
    parser.add_argument("--output", "-o", type=str, help="输出文件路径", default="room_mapping.json")
    parser.add_argument("--campus", type=str, help="只查询指定校区")
    parser.add_argument("--building", type=str, help="只查询指定楼栋（需要配合--campus使用）")
    parser.add_argument("-c", "--concurrency", type=int, help=f"最大并发数", default=5)
    args = parser.parse_args()

    # 加载 Cookie
    if not Path(args.cookie_file).exists():
        print(f"错误: Cookie 文件不存在: {args.cookie_file}")
        sys.exit(1)

    cookies = await load_cookies_from_file(args.cookie_file)

    # 确定查询范围
    campuses = [args.campus] if args.campus else None
    buildings = {args.campus: [args.building]} if args.campus and args.building else None

    def progress(msg):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

    print("开始获取房间映射...")
    start_time = asyncio.get_event_loop().time()

    rooms = await fetch_all_mappings(
        cookies,
        campuses=campuses,
        buildings=buildings,
        max_concurrent=args.concurrency,
        progress_callback=progress
    )

    elapsed = asyncio.get_event_loop().time() - start_time

    if not rooms:
        print("错误: 未获取到任何房间数据")
        print("\n可能的原因:")
        print("1. Cookie已过期，请重新登录并导出Cookie")
        print("2. API接口不可用，请稍后重试")
        sys.exit(1)

    # 保存结果
    output_data = {
        "fetch_time": datetime.now().isoformat(),
        "total_rooms": len(rooms),
        "rooms": rooms
    }

    output_path = Path(args.output)
    async with aiofiles.open(output_path, "w", encoding="utf-8") as f:
        await f.write(json.dumps(output_data, ensure_ascii=False, indent=2))

    # 按校区统计
    campus_stats = {}
    for room in rooms:
        campus = room.get("campus", "未知")
        campus_stats[campus] = campus_stats.get(campus, 0) + 1

    print(f"\n获取完成!")
    print(f"  总房间数: {len(rooms)}")
    print(f"  耗时: {elapsed:.2f}秒")
    print(f"  输出文件: {output_path.absolute()}")
    print(f"\n校区统计:")
    for campus, count in sorted(campus_stats.items()):
        print(f"  {campus}: {count} 个房间")


def main():
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
