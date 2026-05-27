#!/usr/bin/env python3
"""
获取房间ID - 通过解析index页面中的地址列表

原理：
- addRoom.json 不返回任何内容
- 但服务器端会更新用户的地址列表
- index 页面通过服务器端渲染包含完整的地址列表（含ID）

用法:
    python scripts/get_room_id.py --cookie-file /tmp/cookie.json
"""

import asyncio
import aiohttp
import json
import re
from pathlib import Path
from typing import Dict, List, Optional


async def load_cookies(filepath: str) -> dict:
    """加载Cookie"""
    with open(filepath, "r", encoding="utf-8") as f:
        cookies_list = json.load(f)
    return {c["name"]: c["value"] for c in cookies_list if c.get("name") and c.get("value")}


async def get_address_list(session: aiohttp.ClientSession, cookies: dict) -> List[dict]:
    """
    获取用户的所有地址列表

    解析 index 页面中的 JavaScript 代码:
    let list = [{...}, {...}, ...]
    """
    url = "https://epay.nju.edu.cn/epay/h5/nju/electric/index"

    async with session.get(url, cookies=cookies) as resp:
        html = await resp.text()

    # 查找 let list = [...] 模式
    pattern = r'let\s+list\s*=\s*(\[[\s\S]*?\])\s*\n'
    match = re.search(pattern, html)

    if match:
        try:
            list_str = match.group(1)
            # 清理可能的JavaScript语法问题
            list_str = list_str.replace('\n', '')
            addresses = json.loads(list_str)
            return addresses
        except json.JSONDecodeError as e:
            print(f"解析JSON失败: {e}")

    return []


async def find_room_id(
    session: aiohttp.ClientSession,
    cookies: dict,
    campus: str,
    building: str,
    room_name: str
) -> Optional[dict]:
    """
    查找指定房间的ID

    Args:
        campus: 校区名称 (如 "仙林校区")
        building: 楼栋名称 (如 "19幢")
        room_name: 房间名称 (如 "19栋第16层1613")

    Returns:
        房间信息字典，包含id、buildId、roomId等
    """
    addresses = await get_address_list(session, cookies)

    for addr in addresses:
        if (addr.get("sysName") == campus and
            addr.get("buildName") == building and
            addr.get("roomName") == room_name):
            return addr

    return None


async def query_balance_by_id(
    session: aiohttp.ClientSession,
    cookies: dict,
    db_id: int
) -> Optional[dict]:
    """通过ID查询余额"""
    url = f"https://epay.nju.edu.cn/epay/h5/nju/electric/charge?id={db_id}"

    async with session.get(url, cookies=cookies) as resp:
        if resp.status != 200:
            return None

        html = await resp.text()

        if "login" in html.lower() or "登录" in html:
            return None

        result = {"db_id": db_id}

        # 提取房间信息
        match = re.search(r'this\.check\s*=\s*(\{.*?\})', html, re.DOTALL)
        if match:
            try:
                check_data = json.loads(match.group(1))
                result["campus"] = check_data.get("sysName", "")
                result["building"] = check_data.get("buildName", "")
                result["room_name"] = check_data.get("roomName", "")
                result["room_id"] = check_data.get("roomId", "")
                result["build_id"] = check_data.get("buildId", "")
            except json.JSONDecodeError:
                pass

        # 提取余额
        campus = result.get("campus", "")
        if campus == "苏州校区":
            match_bal = re.search(r'剩余余额.*?<i>([\d.]+元)</i>', html)
        else:
            match_bal = re.search(r'剩余电量.*?<i>([\d.]+度)</i>', html)

        if match_bal:
            result["balance"] = match_bal.group(1)

        return result


async def main():
    import argparse

    parser = argparse.ArgumentParser(description="获取房间ID")
    parser.add_argument("--cookie-file", type=str, required=True, help="Cookie文件路径")
    parser.add_argument("--campus", type=str, help="校区名称")
    parser.add_argument("--building", type=str, help="楼栋名称")
    parser.add_argument("--room", type=str, help="房间名称")
    parser.add_argument("--list", action="store_true", help="列出所有地址")
    args = parser.parse_args()

    cookies = await load_cookies(args.cookie_file)

    connector = aiohttp.TCPConnector(limit=10)
    async with aiohttp.ClientSession(connector=connector) as session:

        if args.list:
            # 列出所有地址
            addresses = await get_address_list(session, cookies)
            print(f"找到 {len(addresses)} 个地址:\n")
            for addr in addresses:
                print(f"  ID: {addr.get('id')}")
                print(f"    校区: {addr.get('sysName')}")
                print(f"    楼栋: {addr.get('buildName')}")
                print(f"    房间: {addr.get('roomName')}")
                print(f"    roomId: {addr.get('roomId')}")
                print(f"    buildId: {addr.get('buildId')}")
                print()

        elif args.campus and args.building and args.room:
            # 查找指定房间
            room_info = await find_room_id(
                session, cookies,
                args.campus, args.building, args.room
            )

            if room_info:
                print(f"找到房间:")
                print(f"  ID: {room_info.get('id')}")
                print(f"  校区: {room_info.get('sysName')}")
                print(f"  楼栋: {room_info.get('buildName')}")
                print(f"  房间: {room_info.get('roomName')}")

                # 查询余额
                balance = await query_balance_by_id(session, cookies, room_info.get("id"))
                if balance:
                    print(f"  余额: {balance.get('balance', '未知')}")
            else:
                print(f"未找到房间: {args.campus} {args.building} {args.room}")

        else:
            parser.print_help()


if __name__ == "__main__":
    asyncio.run(main())
