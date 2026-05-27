#!/usr/bin/env python3
"""
南京大学电费查询脚本 - 通过房间信息直接查询

解决问题：原有脚本依赖数据库ID（如102782），该ID会在用户删除/重新添加地址后变化。
本脚本通过 校区+楼栋+房间号 直接查询，自动解析正确的数据库ID。

用法:
    python scripts/query_by_room.py --cookie-file /tmp/cookie.json "仙林校区" "19幢" "1613"
    python scripts/query_by_room.py --cookie-file /tmp/cookie.json "仙林校区" "19幢" "1613" "1614"
    python scripts/query_by_room.py --cookie-file /tmp/cookie.json -d ./database --batch rooms.txt

    # 验证现有数据库ID是否有效
    python scripts/query_by_room.py --cookie-file /tmp/cookie.json --verify-id 102782

    # 列出所有校区和楼栋
    python scripts/query_by_room.py --cookie-file /tmp/cookie.json --list-campuses
    python scripts/query_by_room.py --cookie-file /tmp/cookie.json --list-buildings "仙林校区"

rooms.txt 格式（每行一个房间）:
    仙林校区,19幢,1613
    仙林校区,19幢,1614
    苏州校区,仁园-戊,504

Cookie导出方法：
1. 登录 https://epay.nju.edu.cn/epay/h5/nju/electric/index
2. 打开浏览器开发者工具 (F12) -> Application -> Cookies
3. 使用浏览器扩展 "EditThisCookie" 或 "Cookie Editor" 导出为JSON
4. 保存到 /tmp/cookie.json
"""

import asyncio
import aiohttp
import aiofiles
import argparse
import json
import sys
import re
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from urllib.parse import urlencode

# 默认 Cookie 文件路径
DEFAULT_COOKIE_FILE = "/tmp/cookie.json"

# 重试配置
MAX_RETRIES = 3
RETRY_DELAY = 1

# 并发配置
DEFAULT_CONCURRENCY = 10

HEADERS = {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "zh,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
}

BASE_URL = "https://epay.nju.edu.cn"


async def load_cookies_from_file(filepath: str) -> dict:
    """从浏览器导出的 JSON 文件加载 cookie"""
    try:
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
    except FileNotFoundError:
        print(f"错误: Cookie 文件不存在: {filepath}")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"错误: Cookie 文件格式错误: {filepath}")
        sys.exit(1)


async def get_csrf_token(session: aiohttp.ClientSession, cookies: dict) -> str:
    """获取 CSRF Token"""
    async with session.get(f"{BASE_URL}/epay/h5/nju/electric/index", cookies=cookies) as resp:
        html = await resp.text()
        match = re.search(r'<meta name="_csrf" content="([^"]+)"', html)
        if match:
            return match.group(1)
    return ""


async def fetch_electric_systems(session: aiohttp.ClientSession, cookies: dict, csrf_token: str) -> List[dict]:
    """
    获取电控系统列表（校区信息）
    返回: [{"elcsysid": 3, "elcname": "仙林电控", ...}, ...]
    """
    headers = HEADERS.copy()
    headers["X-CSRF-TOKEN"] = csrf_token
    headers["Content-Type"] = "application/json"

    try:
        async with session.post(
            f"{BASE_URL}/epay/h5/getelesys.json",
            cookies=cookies,
            headers=headers,
            data="{}"
        ) as resp:
            text = await resp.text()
            try:
                data = json.loads(text)
                if data.get("retcode") == "0":
                    return data.get("list", [])
            except json.JSONDecodeError:
                pass
    except Exception:
        pass

    # 如果API调用失败，返回硬编码的校区列表
    # 这是从Playwright捕获的数据
    return [
        {"elcsysid": 5, "elcname": "鼓楼水表"},
        {"elcsysid": 6, "elcname": "苏州水表"},
        {"elcsysid": 2, "elcname": "鼓楼电控"},
        {"elcsysid": 3, "elcname": "仙林电控"},
        {"elcsysid": 4, "elcname": "仙林水表"},
        {"elcsysid": 7, "elcname": "苏州电控"},
        {"elcsysid": 8, "elcname": "浦口电控"},
    ]


async def fetch_buildings(session: aiohttp.ClientSession, cookies: dict, csrf_token: str, sysid: int) -> List[dict]:
    """
    获取楼栋列表
    返回: [{"buiId": "xl19", "buiName": "19幢"}, ...]
    """
    headers = HEADERS.copy()
    headers["X-CSRF-TOKEN"] = csrf_token
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"

    data = f"sysid={sysid}&areaid=0&districtid=0"

    async with session.post(
        f"{BASE_URL}/epay/h5/getbuild.json",
        cookies=cookies,
        headers=headers,
        data=data
    ) as resp:
        text = await resp.text()
        try:
            result = json.loads(text)
            if result.get("retcode") == "0":
                return result.get("list", [])
        except json.JSONDecodeError:
            pass
    return []


async def fetch_rooms(session: aiohttp.ClientSession, cookies: dict, csrf_token: str, sysid: int, buildid: str) -> List[dict]:
    """
    获取房间列表
    返回: [{"roomId": "1613", "roomName": "19栋第16层1613"}, ...]
    """
    headers = HEADERS.copy()
    headers["X-CSRF-TOKEN"] = csrf_token
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"

    data = f"sysid={sysid}&areaid=0&districtid=0&buildid={buildid}&floorid=0"

    async with session.post(
        f"{BASE_URL}/epay/h5/getroom.json",
        cookies=cookies,
        headers=headers,
        data=data
    ) as resp:
        text = await resp.text()
        try:
            result = json.loads(text)
            if result.get("retcode") == "0":
                return result.get("list", [])
        except json.JSONDecodeError:
            pass
    return []


async def add_room_address(
    session: aiohttp.ClientSession,
    cookies: dict,
    csrf_token: str,
    sysid: int,
    sysname: str,
    buildid: str,
    buildname: str,
    roomid: str,
    roomname: str
) -> Optional[int]:
    """
    添加房间地址，返回数据库ID
    """
    headers = HEADERS.copy()
    headers["X-CSRF-TOKEN"] = csrf_token

    data = {
        "type": "elec",
        "areaId": "0",
        "areaName": "0",
        "buildId": buildid,
        "buildName": buildname,
        "districtId": "",
        "districtName": "",
        "roomId": roomid,
        "roomName": roomname,
        "sysId": sysid,
        "sysName": sysname
    }

    async with session.post(
        f"{BASE_URL}/epay/h5/addRoom.json",
        cookies=cookies,
        headers=headers,
        data=urlencode(data)
    ) as resp:
        text = await resp.text()
        try:
            result = json.loads(text)
            if result.get("retcode") == "0":
                # 返回添加后的地址列表，取最新的
                addresses = result.get("list", [])
                if addresses:
                    # 找到匹配的地址
                    for addr in addresses:
                        if addr.get("roomId") == roomid and addr.get("buildId") == buildid:
                            return addr.get("id")
                    # 如果没找到匹配的，返回最后一个
                    return addresses[-1].get("id")
        except json.JSONDecodeError:
            pass
    return None


async def get_room_balance(session: aiohttp.ClientSession, cookies: dict, db_id: int) -> dict:
    """
    通过数据库ID查询房间余额
    """
    url = f"{BASE_URL}/epay/h5/nju/electric/charge?id={db_id}"

    async with session.get(url, cookies=cookies) as resp:
        html = await resp.text()

        # 检查是否需要登录
        if "login" in html.lower() or "登录" in html:
            return {"success": False, "error": "认证失败"}

        result = {}

        # 从 JS 片段提取 this.check 的 JSON 数据
        match = re.search(r'this\.check\s*=\s*(\{.*?\})', html, re.DOTALL)
        if match:
            try:
                check_data = json.loads(match.group(1))
                result["校区"] = check_data.get("sysName", "")
                result["楼栋"] = check_data.get("buildName", "")
                result["房间"] = check_data.get("roomName", "")
                result["数据库ID"] = check_data.get("id", "")
            except json.JSONDecodeError:
                pass

        campus = result.get("校区", "")
        is_suzhou = campus == "苏州校区"

        if is_suzhou:
            # 苏州校区：提取"剩余余额"字段
            match = re.search(r'剩余余额.*?<i>([\d.]+元)</i>', html)
            if match:
                result["剩余余额"] = match.group(1)
            matches = re.findall(r'剩余电量.*?<i>([\d.]+度)</i>', html)
            if len(matches) >= 2:
                result["剩余电量"] = matches[1]
        else:
            # 非苏州校区
            match = re.search(r'剩余电量.*?<i>([\d.]+度)</i>', html)
            if match:
                result["剩余电量"] = match.group(1)

        if result.get("剩余电量"):
            result["success"] = True
        else:
            result["success"] = False
            result["error"] = "解析失败"

        return result


def build_campus_mapping(systems: List[dict]) -> Dict[str, dict]:
    """
    构建校区名称到系统信息的映射
    """
    mapping = {}
    for sys in systems:
        elcname = sys.get("elcname", "")
        # 电控系统名称到校区名称的映射
        name_map = {
            "仙林电控": "仙林校区",
            "鼓楼电控": "鼓楼校区",
            "苏州电控": "苏州校区",
            "浦口电控": "浦口校区",
        }
        campus_name = name_map.get(elcname, elcname.replace("电控", "校区"))
        mapping[campus_name] = {
            "sysid": sys.get("elcsysid"),
            "sysname": campus_name,
        }
    return mapping


def find_building_id(buildings: List[dict], building_name: str) -> Optional[Tuple[str, str]]:
    """
    根据楼栋名称查找楼栋ID
    返回: (buiId, buiName) 或 None
    """
    # 尝试精确匹配
    for b in buildings:
        if b.get("buiName") == building_name:
            return (b.get("buiId"), b.get("buiName"))

    # 尝试模糊匹配（去掉"幢"、"栋"等后缀）
    normalized_name = building_name.rstrip("幢栋")
    for b in buildings:
        bname = b.get("buiName", "").rstrip("幢栋")
        if bname == normalized_name:
            return (b.get("buiId"), b.get("buiName"))

    return None


def find_room_id(rooms: List[dict], room_query: str) -> Optional[Tuple[str, str]]:
    """
    根据房间号查找房间ID
    支持多种格式：1613, 19栋第16层1613 等
    返回: (roomId, roomName) 或 None
    """
    # 尝试精确匹配 roomId
    for r in rooms:
        if r.get("roomId") == room_query:
            return (r.get("roomId"), r.get("roomName"))

    # 尝试模糊匹配 roomName
    for r in rooms:
        roomname = r.get("roomName", "")
        if room_query in roomname:
            return (r.get("roomId"), r.get("roomName"))

    return None


async def query_room(
    session: aiohttp.ClientSession,
    cookies: dict,
    csrf_token: str,
    campus_mapping: Dict[str, dict],
    campus_name: str,
    building_name: str,
    room_query: str
) -> dict:
    """
    查询单个房间
    """
    # 1. 查找校区
    campus_info = campus_mapping.get(campus_name)
    if not campus_info:
        return {"success": False, "error": f"未找到校区: {campus_name}"}

    sysid = campus_info["sysid"]
    sysname = campus_info["sysname"]

    # 2. 获取楼栋列表
    buildings = await fetch_buildings(session, cookies, csrf_token, sysid)
    if not buildings:
        return {"success": False, "error": f"获取楼栋列表失败: {campus_name}"}

    # 3. 查找楼栋
    building_info = find_building_id(buildings, building_name)
    if not building_info:
        return {"success": False, "error": f"未找到楼栋: {building_name}"}

    buildid, buildname = building_info

    # 4. 获取房间列表
    rooms = await fetch_rooms(session, cookies, csrf_token, sysid, buildid)
    if not rooms:
        return {"success": False, "error": f"获取房间列表失败: {building_name}"}

    # 5. 查找房间
    room_info = find_room_id(rooms, room_query)
    if not room_info:
        return {"success": False, "error": f"未找到房间: {room_query}"}

    roomid, roomname = room_info

    # 6. 添加地址获取数据库ID
    db_id = await add_room_address(
        session, cookies, csrf_token,
        sysid, sysname, buildid, buildname, roomid, roomname
    )
    if not db_id:
        return {"success": False, "error": "添加房间地址失败"}

    # 7. 查询余额
    result = await get_room_balance(session, cookies, db_id)
    result["房间号"] = roomid
    result["房间名"] = roomname
    result["楼栋ID"] = buildid
    result["校区ID"] = sysid
    result["数据库ID"] = db_id

    return result


async def query_batch(
    rooms_to_query: List[Tuple[str, str, str]],  # [(campus, building, room), ...]
    cookies: dict,
    output_dir: Optional[Path] = None,
    show_progress: bool = True,
    max_concurrent: int = DEFAULT_CONCURRENCY
) -> dict:
    """
    批量查询房间
    """
    semaphore = asyncio.Semaphore(max_concurrent)
    total = len(rooms_to_query)
    completed = 0
    succeeded = 0
    failed = 0
    results = []
    errors = []

    connector = aiohttp.TCPConnector(limit=max_concurrent)

    async with aiohttp.ClientSession(connector=connector) as session:
        # 获取 CSRF Token
        csrf_token = await get_csrf_token(session, cookies)

        # 获取校区映射
        systems = await fetch_electric_systems(session, cookies, csrf_token)
        campus_mapping = build_campus_mapping(systems)

        async def query_one(campus, building, room):
            nonlocal completed, succeeded, failed
            async with semaphore:
                result = await query_room(
                    session, cookies, csrf_token, campus_mapping,
                    campus, building, room
                )
                completed += 1

                if result.get("success"):
                    succeeded += 1
                    results.append(result)
                    if output_dir:
                        await save_result(result, output_dir)
                else:
                    failed += 1
                    errors.append({
                        "campus": campus,
                        "building": building,
                        "room": room,
                        "error": result.get("error", "未知错误")
                    })

                if show_progress:
                    print(f"\r[{completed}/{total}] 成功: {succeeded}, 失败: {failed}", end="", flush=True)

                return result

        tasks = [query_one(c, b, r) for c, b, r in rooms_to_query]
        await asyncio.gather(*tasks)

    if show_progress:
        print()

    return {
        "total": total,
        "succeeded": succeeded,
        "failed": failed,
        "results": results,
        "errors": errors
    }


async def save_result(result: dict, output_dir: Path):
    """保存结果"""
    campus = result.get("校区", "未知校区")
    building = result.get("楼栋", "未知楼栋")
    room = result.get("房间名", result.get("房间号", "未知房间"))

    # 清理文件名
    campus = re.sub(r'[<>:"/\\|?*]', '_', campus)
    building = re.sub(r'[<>:"/\\|?*]', '_', building)
    room = re.sub(r'[<>:"/\\|?*]', '_', room)

    dir_path = output_dir / campus / building / room
    date_str = datetime.now().strftime("%Y%m%d")
    filepath = dir_path / f"{date_str}.json"

    dir_path.mkdir(parents=True, exist_ok=True)

    if not filepath.exists():
        # 移除 ID 相关字段
        save_data = {k: v for k, v in result.items()
                     if k not in ('数据库ID', '楼栋ID', '校区ID', '房间号', '房间名')}
        async with aiofiles.open(filepath, "w", encoding="utf-8") as f:
            await f.write(json.dumps(save_data, ensure_ascii=False, indent=2))


async def async_main():
    parser = argparse.ArgumentParser(description="南京大学电费查询工具 - 通过房间信息直接查询")
    parser.add_argument("-d", "--dir", type=str, help="输出目录", default=None)
    parser.add_argument("-c", "--concurrency", type=int, help=f"最大并发数 (默认{DEFAULT_CONCURRENCY})", default=DEFAULT_CONCURRENCY)
    parser.add_argument("--cookie-file", type=str, help="Cookie JSON文件路径", default=DEFAULT_COOKIE_FILE)
    parser.add_argument("-q", "--quiet", action="store_true", help="安静模式")
    parser.add_argument("--batch", type=str, help="批量查询文件路径（每行格式：校区,楼栋,房间号）")
    parser.add_argument("--verify-id", type=int, help="验证数据库ID是否有效")
    parser.add_argument("--list-campuses", action="store_true", help="列出所有校区")
    parser.add_argument("--list-buildings", type=str, help="列出指定校区的所有楼栋")
    parser.add_argument("--list-rooms", type=str, nargs=2, metavar=("CAMPUS", "BUILDING"), help="列出指定楼栋的所有房间")
    parser.add_argument("--validate-all", type=str, help="验证指定目录下所有房间ID的有效性")
    parser.add_argument("args", nargs="*", help="校区 楼栋 房间号...")
    args = parser.parse_args()

    # 加载 Cookie
    cookies = await load_cookies_from_file(args.cookie_file)

    connector = aiohttp.TCPConnector(limit=args.concurrency)
    async with aiohttp.ClientSession(connector=connector) as session:
        # 获取 CSRF Token
        csrf_token = await get_csrf_token(session, cookies)

        # 验证数据库ID
        if args.verify_id:
            result = await get_room_balance(session, cookies, args.verify_id)
            if result.get("success"):
                print(f"✓ ID {args.verify_id} 有效")
                print(f"  校区: {result.get('校区', '')}")
                print(f"  楼栋: {result.get('楼栋', '')}")
                print(f"  房间: {result.get('房间', '')}")
                print(f"  剩余电量: {result.get('剩余电量', '')}")
            else:
                print(f"✗ ID {args.verify_id} 无效或已过期: {result.get('error', '')}")
            return

        # 列出校区
        if args.list_campuses:
            systems = await fetch_electric_systems(session, cookies, csrf_token)
            if systems:
                print("可用校区:")
                for sys in systems:
                    elcname = sys.get("elcname", "")
                    name_map = {
                        "仙林电控": "仙林校区",
                        "鼓楼电控": "鼓楼校区",
                        "苏州电控": "苏州校区",
                        "浦口电控": "浦口校区",
                    }
                    campus_name = name_map.get(elcname, elcname.replace("电控", "校区"))
                    sysid = sys.get("elcsysid")
                    print(f"  {campus_name} (sysid={sysid})")
            else:
                print("获取校区列表失败，请检查Cookie是否有效")
                print("\nCookie导出方法:")
                print("1. 登录 https://epay.nju.edu.cn/epay/h5/nju/electric/index")
                print("2. 打开浏览器开发者工具 (F12) -> Application -> Cookies")
                print("3. 使用浏览器扩展 'EditThisCookie' 或 'Cookie Editor' 导出为JSON")
                print("4. 保存到指定文件")
            return

        # 列出楼栋
        if args.list_buildings:
            systems = await fetch_electric_systems(session, cookies, csrf_token)
            campus_mapping = build_campus_mapping(systems)
            campus_info = campus_mapping.get(args.list_buildings)
            if not campus_info:
                print(f"未找到校区: {args.list_buildings}")
                print("使用 --list-campuses 查看可用校区")
                return

            buildings = await fetch_buildings(session, cookies, csrf_token, campus_info["sysid"])
            if buildings:
                print(f"{args.list_buildings} 的楼栋:")
                for b in buildings:
                    print(f"  {b.get('buiName')} (buildid={b.get('buiId')})")
            else:
                print("获取楼栋列表失败，请检查Cookie是否有效")
            return

        # 列出房间
        if args.list_rooms:
            campus_name, building_name = args.list_rooms
            systems = await fetch_electric_systems(session, cookies, csrf_token)
            campus_mapping = build_campus_mapping(systems)
            campus_info = campus_mapping.get(campus_name)
            if not campus_info:
                print(f"未找到校区: {campus_name}")
                return

            buildings = await fetch_buildings(session, cookies, csrf_token, campus_info["sysid"])
            building_info = find_building_id(buildings, building_name)
            if not building_info:
                print(f"未找到楼栋: {building_name}")
                return

            rooms = await fetch_rooms(session, cookies, csrf_token, campus_info["sysid"], building_info[0])
            if rooms:
                print(f"{campus_name} {building_name} 的房间:")
                # 按楼层分组显示
                floors = {}
                for r in rooms:
                    roomname = r.get("roomName", "")
                    # 提取楼层信息
                    match = re.search(r'第(\d+)层', roomname)
                    if match:
                        floor = match.group(1)
                        if floor not in floors:
                            floors[floor] = []
                        floors[floor].append(r)

                for floor in sorted(floors.keys(), key=int):
                    rooms_on_floor = floors[floor]
                    room_str = ", ".join([r.get("roomId") for r in rooms_on_floor[:10]])
                    if len(rooms_on_floor) > 10:
                        room_str += f"... 共{len(rooms_on_floor)}间"
                    print(f"  {floor}层: {room_str}")
            else:
                print("获取房间列表失败，请检查Cookie是否有效")
            return

        # 验证所有现有ID
        if args.validate_all:
            database_path = Path(args.validate_all)
            if not database_path.exists():
                print(f"目录不存在: {database_path}")
                return

            # 收集所有房间ID
            room_ids = []
            for room_file in database_path.rglob("*.json"):
                # 跳过 summaries 目录下的文件
                if "summaries" in str(room_file):
                    continue
                try:
                    async with aiofiles.open(room_file, "r", encoding="utf-8") as f:
                        content = await f.read()
                        data = json.loads(content)
                        if data.get("success") and data.get("id"):
                            room_ids.append((data["id"], room_file.parent.name, room_file.stem))
                except:
                    pass

            # 去重
            room_ids = list(set(room_ids))
            print(f"发现 {len(room_ids)} 个房间ID，开始验证...")

            valid = 0
            invalid = 0
            invalid_list = []

            semaphore = asyncio.Semaphore(args.concurrency)

            async def validate_one(room_id, room_name, date):
                nonlocal valid, invalid
                async with semaphore:
                    result = await get_room_balance(session, cookies, int(room_id))
                    if result.get("success"):
                        valid += 1
                    else:
                        invalid += 1
                        invalid_list.append({
                            "id": room_id,
                            "room": room_name,
                            "date": date,
                            "error": result.get("error", "未知错误")
                        })
                    print(f"\r验证中: {valid + invalid}/{len(room_ids)} 有效: {valid} 无效: {invalid}", end="", flush=True)

            tasks = [validate_one(rid, name, date) for rid, name, date in room_ids]
            await asyncio.gather(*tasks)

            print(f"\n\n验证完成!")
            print(f"  有效: {valid}")
            print(f"  无效: {invalid}")

            if invalid_list:
                print("\n--- 无效ID列表 ---")
                for item in invalid_list:
                    print(f"  {item['id']}: {item['room']} ({item['date']}) - {item['error']}")
            return

    # 解析房间列表
    rooms_to_query = []

    if args.batch:
        # 从文件读取
        async with aiofiles.open(args.batch, "r", encoding="utf-8") as f:
            async for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 3:
                        rooms_to_query.append((parts[0], parts[1], parts[2]))

    elif len(args.args) >= 3:
        # 从命令行参数读取
        if len(args.args) == 3:
            rooms_to_query.append((args.args[0], args.args[1], args.args[2]))
        elif len(args.args) > 3:
            campus = args.args[0]
            building = args.args[1]
            for room in args.args[2:]:
                rooms_to_query.append((campus, building, room))
    else:
        parser.print_help()
        print("\n示例:")
        print('  python scripts/query_by_room.py --cookie-file /tmp/cookie.json "仙林校区" "19幢" "1613"')
        print('  python scripts/query_by_room.py --cookie-file /tmp/cookie.json "仙林校区" "19幢" "1613" "1614"')
        print('  python scripts/query_by_room.py --batch rooms.txt -d ./database')
        print('  python scripts/query_by_room.py --list-campuses')
        print('  python scripts/query_by_room.py --list-buildings "仙林校区"')
        print('  python scripts/query_by_room.py --list-rooms "仙林校区" "19幢"')
        print('  python scripts/query_by_room.py --verify-id 102782')
        sys.exit(1)

    if not rooms_to_query:
        print("错误: 没有指定要查询的房间")
        sys.exit(1)

    output_dir = Path(args.dir) if args.dir else None
    show_progress = not args.quiet

    if show_progress:
        print(f"开始查询 {len(rooms_to_query)} 个房间...")
        print("-" * 50)

    import time
    start_time = time.time()

    summary = await query_batch(
        rooms_to_query, cookies, output_dir,
        show_progress=show_progress,
        max_concurrent=args.concurrency
    )

    elapsed = time.time() - start_time

    if show_progress:
        print("=" * 50)
        print(f"查询完成!")
        print(f"  总数: {summary['total']}")
        print(f"  成功: {summary['succeeded']}")
        print(f"  失败: {summary['failed']}")
        print(f"  耗时: {elapsed:.2f}秒")
        if output_dir:
            print(f"  输出目录: {output_dir.absolute()}")

        if summary["results"]:
            print("\n--- 查询成功 ---")
            for r in summary["results"]:
                print(f"  {r.get('校区', '')} {r.get('楼栋', '')} {r.get('房间名', '')}: {r.get('剩余电量', '')}")

        if summary["errors"]:
            print("\n--- 查询失败 ---")
            for e in summary["errors"]:
                print(f"  {e['campus']} {e['building']} {e['room']}: {e['error']}")


def main():
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
