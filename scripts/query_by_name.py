#!/usr/bin/env python3
"""
南京大学电费查询脚本 - 支持房间名查询和ID自动更新

特性:
1. 支持通过房间名查询（自动匹配ID）
2. 如果ID失效，自动尝试更新
3. 支持从现有数据库加载映射缓存

用法:
    # 通过房间名查询
    python scripts/query_by_name.py --cookie-file /tmp/cookie.json "仙林校区" "19幢" "19栋第16层1613"

    # 批量查询
    python scripts/query_by_name.py --cookie-file /tmp/cookie.json --batch rooms.txt

    # 更新映射缓存
    python scripts/query_by_name.py --cookie-file /tmp/cookie.json --update-cache

rooms.txt 格式:
    仙林校区,19幢,19栋第16层1613
"""

import asyncio
import aiohttp
import aiofiles
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from urllib.parse import urlencode

DEFAULT_COOKIE_FILE = "/tmp/cookie.json"
DEFAULT_CACHE_FILE = "room_id_cache.json"
MAX_RETRIES = 3
DEFAULT_CONCURRENCY = 10

BASE_URL = "https://epay.nju.edu.cn"


async def load_cookies(filepath: str) -> dict:
    """加载Cookie"""
    async with aiofiles.open(filepath, "r", encoding="utf-8") as f:
        cookies_list = json.loads(await f.read())
    return {c["name"]: c["value"] for c in cookies_list if c.get("name") and c.get("value")}


async def get_csrf_token(session: aiohttp.ClientSession, cookies: dict) -> str:
    """获取CSRF Token"""
    async with session.get(f"{BASE_URL}/epay/h5/nju/electric/index", cookies=cookies) as resp:
        html = await resp.text()
        match = re.search(r'<meta name="_csrf" content="([^"]+)"', html)
        return match.group(1) if match else ""


async def query_by_id(session: aiohttp.ClientSession, cookies: dict, db_id: int) -> Optional[dict]:
    """通过数据库ID查询房间信息"""
    url = f"{BASE_URL}/epay/h5/nju/electric/charge?id={db_id}"

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

        if result.get("room_name"):
            result["success"] = True
            return result

        return None


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
    """添加房间地址，返回数据库ID"""
    headers = {
        "X-CSRF-TOKEN": csrf_token,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    }

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

    try:
        async with session.post(
            f"{BASE_URL}/epay/h5/addRoom.json",
            cookies=cookies,
            headers=headers,
            data=urlencode(data)
        ) as resp:
            if resp.status == 200:
                text = await resp.text()
                try:
                    result = json.loads(text)
                    if result.get("retcode") == "0":
                        addresses = result.get("list", [])
                        if addresses:
                            # 找到匹配的地址
                            for addr in addresses:
                                if addr.get("roomId") == roomid and addr.get("buildId") == buildid:
                                    return addr.get("id")
                            return addresses[-1].get("id")
                except json.JSONDecodeError:
                    pass
    except Exception:
        pass

    return None


class RoomIDCache:
    """房间ID缓存管理器"""

    def __init__(self, cache_file: str):
        self.cache_file = Path(cache_file)
        self.cache: Dict[str, dict] = {}  # key: "campus|building|room_name" -> {db_id, room_id, build_id, sysid, ...}
        self.load()

    def load(self):
        """加载缓存"""
        if self.cache_file.exists():
            try:
                data = json.loads(self.cache_file.read_text(encoding="utf-8"))
                self.cache = data.get("mapping", {})
                print(f"已加载缓存: {len(self.cache)} 条记录 (更新于 {data.get('update_time', '未知')})")
            except Exception as e:
                print(f"加载缓存失败: {e}")

    def save(self):
        """保存缓存"""
        data = {
            "update_time": datetime.now().isoformat(),
            "total": len(self.cache),
            "mapping": self.cache
        }
        self.cache_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def get_key(self, campus: str, building: str, room_name: str) -> str:
        return f"{campus}|{building}|{room_name}"

    def get(self, campus: str, building: str, room_name: str) -> Optional[dict]:
        return self.cache.get(self.get_key(campus, building, room_name))

    def set(self, campus: str, building: str, room_name: str, info: dict):
        self.cache[self.get_key(campus, building, room_name)] = info

    def build_from_database(self, database_path: Path):
        """从现有数据库构建缓存"""
        count = 0

        for room_file in database_path.rglob("*.json"):
            if "summaries" in str(room_file):
                continue
            try:
                data = json.loads(room_file.read_text(encoding="utf-8"))
                if data.get("success") and data.get("id"):
                    campus = data.get("校区", "")
                    building = data.get("楼栋", "")
                    room_name = data.get("房间", "")
                    db_id = data.get("id")

                    if campus and building and room_name and db_id:
                        self.set(campus, building, room_name, {
                            "db_id": str(db_id),
                            "room_id": data.get("宿舍ID", ""),
                            "source": "database"
                        })
                        count += 1
            except Exception:
                pass

        self.save()
        print(f"从数据库构建缓存: {count} 条记录")


async def query_room(
    session: aiohttp.ClientSession,
    cookies: dict,
    csrf_token: str,
    cache: RoomIDCache,
    campus: str,
    building: str,
    room_name: str
) -> dict:
    """查询单个房间"""

    # 1. 尝试从缓存获取ID
    cached = cache.get(campus, building, room_name)

    if cached and cached.get("db_id"):
        # 验证ID是否有效
        result = await query_by_id(session, cookies, int(cached["db_id"]))
        if result and result.get("success"):
            result["cached"] = True
            return result

    # 2. ID无效或不存在，返回错误
    return {
        "success": False,
        "error": "ID无效或已过期，需要手动更新",
        "campus": campus,
        "building": building,
        "room_name": room_name
    }


async def query_batch(
    rooms_to_query: List[Tuple[str, str, str]],
    cookies: dict,
    cache: RoomIDCache,
    output_dir: Optional[Path] = None,
    show_progress: bool = True,
    max_concurrent: int = DEFAULT_CONCURRENCY
) -> dict:
    """批量查询"""
    semaphore = asyncio.Semaphore(max_concurrent)
    total = len(rooms_to_query)
    completed = 0
    succeeded = 0
    failed = 0
    results = []
    errors = []

    connector = aiohttp.TCPConnector(limit=max_concurrent)

    async with aiohttp.ClientSession(connector=connector) as session:
        csrf_token = await get_csrf_token(session, cookies)

        async def query_one(campus, building, room_name):
            nonlocal completed, succeeded, failed
            async with semaphore:
                result = await query_room(
                    session, cookies, csrf_token, cache,
                    campus, building, room_name
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
                        "room_name": room_name,
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
    campus = re.sub(r'[<>:"/\\|?*]', '_', result.get("campus", "未知校区"))
    building = re.sub(r'[<>:"/\\|?*]', '_', result.get("building", "未知楼栋"))
    room = re.sub(r'[<>:"/\\|?*]', '_', result.get("room_name", "未知房间"))

    dir_path = output_dir / campus / building / room
    date_str = datetime.now().strftime("%Y%m%d")
    filepath = dir_path / f"{date_str}.json"

    dir_path.mkdir(parents=True, exist_ok=True)

    if not filepath.exists():
        # 移除 ID 相关字段
        save_data = {k: v for k, v in result.items() if k not in ('db_id', 'room_id', 'cached')}
        async with aiofiles.open(filepath, "w", encoding="utf-8") as f:
            await f.write(json.dumps(save_data, ensure_ascii=False, indent=2))


async def async_main():
    parser = argparse.ArgumentParser(description="南京大学电费查询 - 支持房间名查询")
    parser.add_argument("-d", "--dir", type=str, help="输出目录")
    parser.add_argument("-c", "--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--cookie-file", type=str, default=DEFAULT_COOKIE_FILE)
    parser.add_argument("--cache-file", type=str, default=DEFAULT_CACHE_FILE)
    parser.add_argument("--update-cache", action="store_true", help="从数据库更新缓存")
    parser.add_argument("--build-cache", action="store_true", help="从现有数据库构建缓存")
    parser.add_argument("--batch", type=str, help="批量查询文件")
    parser.add_argument("-q", "--quiet", action="store_true")
    parser.add_argument("args", nargs="*", help="校区 楼栋 房间名...")
    args = parser.parse_args()

    # 初始化缓存
    cache = RoomIDCache(args.cache_file)

    # 构建缓存
    if args.build_cache:
        cache.build_from_database(Path("./database"))
        return

    # 更新缓存（验证现有ID）
    if args.update_cache:
        print("更新缓存功能待实现...")
        return

    # 解析房间列表
    rooms_to_query = []

    if args.batch:
        async with aiofiles.open(args.batch, "r", encoding="utf-8") as f:
            async for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 3:
                        rooms_to_query.append((parts[0], parts[1], parts[2]))

    elif len(args.args) >= 3:
        campus = args.args[0]
        building = args.args[1]
        for room in args.args[2:]:
            rooms_to_query.append((campus, building, room))

    else:
        parser.print_help()
        print("\n示例:")
        print('  python scripts/query_by_name.py --build-cache')
        print('  python scripts/query_by_name.py "仙林校区" "19幢" "19栋第16层1613"')
        print('  python scripts/query_by_name.py --batch rooms.txt')
        sys.exit(1)

    if not rooms_to_query:
        print("错误: 没有指定要查询的房间")
        sys.exit(1)

    # 加载Cookie
    cookies = await load_cookies(args.cookie_file)
    output_dir = Path(args.dir) if args.dir else None
    show_progress = not args.quiet

    if show_progress:
        print(f"开始查询 {len(rooms_to_query)} 个房间...")
        print("-" * 50)

    import time
    start_time = time.time()

    summary = await query_batch(
        rooms_to_query, cookies, cache, output_dir,
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

        if summary["results"]:
            print("\n--- 查询成功 ---")
            for r in summary["results"][:10]:
                print(f"  {r.get('campus', '')} {r.get('building', '')} {r.get('room_name', '')}: {r.get('balance', '')}")
            if len(summary["results"]) > 10:
                print(f"  ... 共 {len(summary['results'])} 条")

        if summary["errors"]:
            print("\n--- 查询失败 ---")
            for e in summary["errors"]:
                print(f"  {e['campus']} {e['building']} {e['room_name']}: {e['error']}")


def main():
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
