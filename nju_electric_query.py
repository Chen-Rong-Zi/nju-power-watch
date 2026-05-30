#!/usr/bin/env python3
"""
南京大学电费查询脚本 (异步版本)
用法: python3 nju_electric_query.py [--cookie-file COOKIE_FILE] [-d 输出目录] [-q] 宿舍ID1 宿舍ID2 ...
示例: python3 nju_electric_query.py --cookie-file /tmp/cookie.json -d ./database 53463 53464 53465
      python3 nju_electric_query.py -q -d ./database 53463 53464  # 安静模式，减少输出
"""

import asyncio
import aiohttp
import aiofiles
import argparse
import json
import os
import signal
import sys
import time
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin
from typing import Optional

# 默认 Cookie 文件路径
DEFAULT_COOKIE_FILE = "/tmp/cookie.json"

# 重试配置
MAX_RETRIES = 5
RETRY_DELAY = 2  # 失败后等待秒数
RETRY_BACKOFF = 1.5  # 指数退避倍数

# 并发配置
DEFAULT_CONCURRENCY = 24  # 默认并发数

HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh,en;q=0.9,zh-TW;q=0.8",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Referer": "https://epay.nju.edu.cn/",
}

base_url = "https://epay.nju.edu.cn"


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


def parse_html(html: str) -> dict:
    """解析 HTML 页面，提取电费信息

    苏州校区 vs 非苏州校区的区别：
    - 非苏州校区：仅显示"剩余电量"，数值=余额（元）
    - 苏州校区：显示"剩余电量"（实际度数）和"剩余余额"（元）

    HTML 中有两个"剩余电量"块，通过 v-if 条件渲染：
    - 第一个：v-if="!isSuZhouArea" - 非苏州校区显示
    - 第二个：v-if="isSuZhouArea" - 苏州校区显示

    解决方案：根据校区名称判断，提取正确的字段

    注意：余额或电量可能为负数，负数情况下替换为"0度"或"0元"
    """
    result = {}

    # 从 JS 片段提取 this.check 的 JSON 数据
    match = re.search(r'this\.check\s*=\s*(\{.*\})', html)
    if match:
        try:
            check_data = json.loads(match.group(1))
            result["校区"] = check_data.get("sysName", "")
            result["楼栋"] = check_data.get("buildName", "")
            result["房间"] = check_data.get("roomName", "")
            result["学号"] = check_data.get("stuempno", "")
        except json.JSONDecodeError:
            pass

    campus = result.get("校区", "")
    is_suzhou = campus == "苏州校区"

    def normalize_value(value_str: str) -> str:
        """将负数替换为0，正数保持不变"""
        if value_str.startswith("-"):
            return f"0{value_str[-1]}"
        return value_str

    if is_suzhou:
        # 苏州校区：提取"剩余余额"字段（真正的余额，单位：元）
        match = re.search(r'剩余余额.*?<i>(-?[\d.]+元)</i>', html)
        if match:
            result["剩余余额"] = normalize_value(match.group(1))

        # 苏州校区也可以提取真正的电量（度）
        # 注意：苏州校区的"剩余电量"是第二个出现的，需要用 findall 或更精确的正则
        matches = re.findall(r'剩余电量.*?<i>(-?[\d.]+度)</i>', html)
        if len(matches) >= 2:
            # 第二个是苏州校区的真实电量
            result["剩余电量"] = normalize_value(matches[1])
    else:
        # 非苏州校区：提取第一个"剩余电量"，数值即为余额
        match = re.search(r'剩余电量.*?<i>(-?[\d.]+度)</i>', html)
        if match:
            balance = normalize_value(match.group(1))
            result["剩余电量"] = balance  # 非苏州校区，电量=余额

    return result


class QueryError:
    """查询错误类型"""
    NETWORK_ERROR = "网络错误"
    TIMEOUT = "请求超时"
    AUTH_FAILED = "认证失败"
    HTTP_ERROR = "HTTP错误"
    PARSE_ERROR = "解析失败"
    NOT_FOUND = "资源不存在"
    ROOM_NOT_FOUND = "房间不存在"
    RETRY_EXHAUSTED = "重试次数耗尽"
    UNKNOWN = "未知错误"


async def query_single_with_retry(semaphore: asyncio.Semaphore, session: aiohttp.ClientSession, room_id: str, cookies: dict, show_retry: bool = True) -> dict:
    """带重试的异步查询单个宿舍电费"""
    url = urljoin(base_url, f"/epay/h5/nju/electric/charge?id={room_id}")
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            async with semaphore:
                async with session.get(url, cookies=cookies, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    if response.status == 404:
                        last_error = {"id": room_id, "error": QueryError.NOT_FOUND, "error_type": "not_found", "success": False}
                        break
                    elif response.status == 401 or response.status == 403:
                        last_error = {"id": room_id, "error": QueryError.AUTH_FAILED, "error_type": "auth_failed", "success": False}
                        break
                    elif response.status >= 500:
                        last_error = {"id": room_id, "error": f"{QueryError.HTTP_ERROR}({response.status})", "error_type": "http_error", "success": False}
                    elif response.status != 200:
                        last_error = {"id": room_id, "error": f"{QueryError.HTTP_ERROR}({response.status})", "error_type": "http_error", "success": False}
                    else:
                        html = await response.text()

                        # 检查是否是错误页面（房间ID不存在）
                        if "房间查询失败" in html or "查询房间信息失败" in html:
                            last_error = {"id": room_id, "error": QueryError.ROOM_NOT_FOUND, "error_type": "room_not_found", "success": False}
                            break

                        # 检查是否需要登录
                        if "login" in html.lower() or "登录" in html:
                            last_error = {"id": room_id, "error": QueryError.AUTH_FAILED, "error_type": "auth_failed", "success": False}
                            break

                        # 解析 HTML
                        result = parse_html(html)

                        # 检查是否解析成功
                        if not result.get("剩余电量"):
                            last_error = {"id": room_id, "error": QueryError.PARSE_ERROR, "error_type": "parse_error", "success": False}
                            break

                        result["success"] = True
                        result["id"] = room_id  # 用于内部追踪，save_result 会过滤掉
                        return result

        except asyncio.TimeoutError:
            last_error = {"id": room_id, "error": QueryError.TIMEOUT, "error_type": "timeout", "success": False}
        except aiohttp.ClientConnectorError:
            last_error = {"id": room_id, "error": QueryError.NETWORK_ERROR, "error_type": "network_error", "success": False}
        except Exception as e:
            error_msg = str(e).lower()
            if "timeout" in error_msg:
                last_error = {"id": room_id, "error": QueryError.TIMEOUT, "error_type": "timeout", "success": False}
            elif "connect" in error_msg:
                last_error = {"id": room_id, "error": QueryError.NETWORK_ERROR, "error_type": "network_error", "success": False}
            else:
                last_error = {"id": room_id, "error": f"{QueryError.UNKNOWN}: {str(e)}", "error_type": "unknown", "success": False}

        # 需要重试
        if attempt < MAX_RETRIES - 1:
            delay = RETRY_DELAY * (RETRY_BACKOFF ** attempt)
            if show_retry:
                print(f"\n  宿舍 {room_id} 第 {attempt + 1} 次尝试失败: {last_error.get('error', '未知')}, {delay:.1f}秒后重试...")
            await asyncio.sleep(delay)

    # 重试次数耗尽
    if last_error and last_error.get("error_type") not in ("auth_failed", "not_found", "room_not_found", "parse_error"):
        last_error["error"] = f"{QueryError.RETRY_EXHAUSTED}({last_error.get('error', '')})"
        last_error["error_type"] = "retry_exhausted"

    return last_error or {"id": room_id, "error": QueryError.UNKNOWN, "error_type": "unknown", "success": False}


async def query_batch(room_ids: list[str], cookies: dict, output_dir: Optional[Path] = None, show_progress: bool = True, max_concurrent: int = DEFAULT_CONCURRENCY):
    """异步批量查询 - 流式处理，内存友好

    Args:
        room_ids: 宿舍ID列表
        cookies: Cookie字典
        output_dir: 输出目录
        show_progress: 是否显示进度
        max_concurrent: 最大并发数
    """
    total = len(room_ids)
    completed = 0
    succeeded = 0
    failed = 0

    failed_details = []
    success_details = []

    # 使用信号量控制并发数
    semaphore = asyncio.Semaphore(max_concurrent)

    # 包装查询函数，使用信号量控制并发
    async def limited_query(session, room_id):
        return await query_single_with_retry(semaphore, session, room_id, cookies, show_progress)

    connector = aiohttp.TCPConnector(limit=max_concurrent)
    async with aiohttp.ClientSession(connector=connector) as session:
        # 使用异步迭代器流式生成任务
        async def task_generator():
            for room_id in room_ids:
                yield limited_query(session, room_id)

        # 流式处理：只维护 max_concurrent * 2 个待处理任务
        tasks_gen = task_generator()
        pending = set()

        # # 初始填充：先提交一批任务
        # batch_size = max_concurrent * 2
        # for _ in range(min(batch_size, total)):
        #     try:
        #         task = await tasks_gen.__anext__()
        #         pending.add(asyncio.create_task(task))
        #     except StopAsyncIteration:
        #         break
        async for coro in tasks_gen:
            pending.add(asyncio.create_task(coro))

        # 处理完成的任务，同时补充新任务
        while pending:
            # 等待任意任务完成
            done, pending = await asyncio.wait(
                pending,
                return_when=asyncio.FIRST_COMPLETED
            )

            for task in done:
                result = task.result()
                completed += 1

                if result["success"]:
                    succeeded += 1
                    if output_dir:
                        await save_result(result, output_dir, quiet=not show_progress)
                    building = result.get("楼栋", "未知")
                    room = result.get("房间", "未知")
                    power = result.get("剩余电量", "未知")
                    success_details.append({
                        "id": result["id"],
                        "building": building,
                        "room": room,
                        "power": power
                    })
                else:
                    failed += 1
                    failed_details.append({
                       "id": result["id"],
                        "error": result.get("error", "未知错误"),
                        "error_type": result.get("error_type", "unknown")
                    })

                if show_progress:
                    print(f"\r[{completed}/{total}] 成功: {succeeded}, 失败: {failed}", end="", flush=True)

                # 补充新任务
                try:
                    new_task = await tasks_gen.__anext__()
                    pending.add(asyncio.create_task(new_task))
                except StopAsyncIteration:
                    pass  # 没有更多任务了

    if show_progress:
        print()

    if success_details and show_progress:
        print("\n--- 查询成功 ---")
        for detail in success_details:
            print(f"  {detail['id']}: {detail['building']} {detail['room']} | 剩余电量: {detail['power']}")

    if failed_details and show_progress:
        print("\n--- 查询失败 (具体原因) ---")
        for detail in failed_details:
            print(f"  {detail['id']}: {detail['error']}")

    return {
        "total": total,
        "succeeded": succeeded,
        "failed": failed,
        "success_details": success_details,
        "failed_details": failed_details,
    }


async def scan_room_ids(start_id: int, end_id: int, cookies: dict, output_file: str, max_concurrent: int = DEFAULT_CONCURRENCY, show_progress: bool = True):
    """扫描ID区间，发现存在的房间

    Args:
        start_id: 起始ID (包含)
        end_id: 结束ID (包含)
        cookies: Cookie字典
        output_file: 输出文件路径
        max_concurrent: 最大并发数
        show_progress: 是否显示进度
    """
    total = end_id - start_id + 1
    processed = 0
    found = 0

    # 去重: 记录已发现的房间 (校区, 楼栋, 房间名) -> room_id
    seen_rooms = {}
    # 记录 room_id -> (校区, 楼栋) 用于分组输出
    room_info = {}

    # 错误统计
    error_counts = {
        "room_not_found": 0,  # 房间不存在
        "auth_failed": 0,     # 需要登录
        "http_error": 0,      # HTTP错误
        "timeout": 0,         # 请求超时
        "network_error": 0,   # 网络错误
        "parse_error": 0,     # 解析失败
    }

    # 保存结果的辅助函数
    saving_in_progress = False  # 防止重入

    def save_results():
        """保存已发现的房间ID到文件"""
        nonlocal saving_in_progress
        if saving_in_progress:
            return
        saving_in_progress = True

        if not seen_rooms:
            return

        # 按楼栋分组
        buildings = {}
        for room_id, (campus, building) in room_info.items():
            key = f"{campus}/{building}"
            if key not in buildings:
                buildings[key] = []
            buildings[key].append(room_id)

        # 排序
        sorted_buildings = sorted(buildings.keys())
        for key in sorted_buildings:
            buildings[key].sort(key=int)

        # 写入文件
        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            for key in sorted_buildings:
                f.write(f"# {key}\n")
                for room_id in buildings[key]:
                    f.write(f"{room_id}\n")

        print(f"\n已保存 {len(seen_rooms)} 个房间ID到 {output_file}")

    # 信号处理器
    def signal_handler():
        """处理终止信号，保存已发现的结果"""
        print(f"\n\n收到终止信号，正在保存已发现的结果...")
        save_results()
        os._exit(0)  # 立即退出，防止重入

    # 注册 asyncio 信号处理器
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    semaphore = asyncio.Semaphore(max_concurrent)

    async def scan_single(session, room_id):
        nonlocal processed
        url = urljoin(base_url, f"/epay/h5/nju/electric/charge?id={room_id}")
        attempt = 0  # 重试次数

        while True:
            try:
                async with (
                        semaphore,
                        session.get(url, cookies=cookies, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=10)) as response
                    ):
                    if response.status != 200:
                        # 可重试错误，继续循环
                        error_counts["http_error"] += 1
                        delay = RETRY_DELAY * (RETRY_BACKOFF ** attempt)
                        await asyncio.sleep(delay)
                        attempt += 1
                        continue

                    html = await response.text()

                    # 检查是否是错误页面（房间不存在）- 永久错误
                    if "房间查询失败" in html or ("查询房间信息失败" in html):
                        error_counts["room_not_found"] += 1
                        break

                    # 检查是否需要登录 - 可重试错误
                    if "login" in html.lower() or "登录" in html:
                        error_counts["auth_failed"] += 1
                        delay = RETRY_DELAY * (RETRY_BACKOFF ** attempt)
                        await asyncio.sleep(delay)
                        attempt += 1
                        continue

                    # 解析房间信息
                    result = parse_html(html)
                    if not result.get("校区") or not result.get("楼栋") or not result.get("房间"):
                        # 解析失败 - 永久错误
                        error_counts["parse_error"] += 1
                        print(f"=" * 100)
                        print(f"{html}")
                        print(f"{room_id = }")
                        break

                    # 成功：实时去重并记录
                    room_key = (result.get("校区", ""), result.get("楼栋", ""), result.get("房间", ""))
                    if room_key not in seen_rooms:
                        seen_rooms[room_key] = room_id
                        room_info[room_id] = room_key[:2]  # (校区, 楼栋)

                    break

            except asyncio.TimeoutError:
                # 可重试错误
                error_counts["timeout"] += 1
                delay = RETRY_DELAY * (RETRY_BACKOFF ** attempt)
                await asyncio.sleep(delay)
                attempt += 1
                continue
            except aiohttp.ClientConnectorError as e:
                # 可重试错误
                error_counts["network_error"] += 1
                # print(f"NetworkError Client Error: {e}")
                delay = RETRY_DELAY * (RETRY_BACKOFF ** attempt)
                await asyncio.sleep(delay)
                attempt += 1
                continue
            except Exception:
                # 可重试错误
                error_counts["network_error"] += 1
                delay = RETRY_DELAY * (RETRY_BACKOFF ** attempt)
                await asyncio.sleep(delay)
                attempt += 1
                continue

        # 只在函数退出时更新进度
        processed += 1
        if show_progress:
            print(f"\r[{processed}/{total}] 已发现: {len(seen_rooms)}", end="", flush=True)

    connector = aiohttp.TCPConnector(limit=max_concurrent)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [scan_single(session, room_id) for room_id in range(start_id, end_id + 1)]
        await asyncio.gather(*tasks)

    found = len(seen_rooms)
    total_errors = sum(error_counts.values())

    if show_progress:
        print()

    # 按楼栋分组
    buildings = {}
    for room_id, (campus, building) in room_info.items():
        key = f"{campus}/{building}"
        if key not in buildings:
            buildings[key] = []
        buildings[key].append(room_id)

    # 按校区+楼栋排序，每个楼栋内的ID也排序
    sorted_buildings = sorted(buildings.keys())
    for key in sorted_buildings:
        buildings[key].sort(key=int)

    # 确保输出目录存在
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 写入文件，格式: # 校区/楼栋 注释行，后跟该楼栋的所有ID
    async with aiofiles.open(output_path, "w", encoding="utf-8") as f:
        for key in sorted_buildings:
            await f.write(f"# {key}\n")
            for room_id in buildings[key]:
                await f.write(f"{room_id}\n")

    if show_progress:
        print(f"扫描完成: 共扫描 {total} 个ID, 发现 {found} 个有效房间")
        print(f"结果已保存到: {output_file}")

        if total_errors > 0:
            print("\n--- 错误统计 ---")
            error_messages = {
                "room_not_found": "房间不存在",
                "auth_failed": "认证失败",
                "http_error": "HTTP错误",
                "timeout": "请求超时",
                "network_error": "网络错误",
                "parse_error": "解析失败",
            }
            for error_type, count in error_counts.items():
                if count > 0:
                    print(f"  {error_messages[error_type]}: {count}")

    return {
        "total": total,
        "found": found,
        "errors": error_counts,
        "total_errors": total_errors,
        "output_file": str(output_path)
    }


async def save_result(result: dict, output_dir: Path, quiet: bool = False):
    """保存结果到文件，格式: {校区}/{楼栋}/{房间}/{日期}.json"""
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        if not quiet:
            print(f"\n错误: 没有权限创建目录 {output_dir}")
        return False
    except Exception as e:
        if not quiet:
            print(f"\n错误: 无法创建目录 {output_dir}: {e}")
        return False

    campus = result.get("校区", "未知校区")
    building = result.get("楼栋", "未知楼栋")
    room = result.get("房间", "未知房间")

    campus = re.sub(r'[<>:"/\\|?*]', '_', campus)
    building = re.sub(r'[<>:"/\\|?*]', '_', building)
    room = re.sub(r'[<>:"/\\|?*]', '_', room)

    dir_path = output_dir / campus / building / room
    date_str = datetime.now().strftime("%Y%m%d")
    filename = f"{date_str}.json"
    filepath = dir_path / filename

    try:
        dir_path.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        if not quiet:
            print(f"\n错误: 没有权限创建目录 {dir_path}")
        return False
    except Exception as e:
        if not quiet:
            print(f"\n错误: 无法创建目录 {dir_path}: {e}")
        return False

    if filepath.exists():
        if not quiet:
            print(f"\n警告: 文件 {filepath} 已存在，跳过保存")
        return False

    # 移除 id 和 宿舍ID 字段
    save_data = {k: v for k, v in result.items() if k not in ('id', '宿舍ID')}

    try:
        async with aiofiles.open(filepath, "w", encoding="utf-8") as f:
            await f.write(json.dumps(save_data, ensure_ascii=False, indent=2))
        return True
    except PermissionError:
        if not quiet:
            print(f"\n错误: 没有权限写入文件 {filepath}")
        return False
    except Exception as e:
        if not quiet:
            print(f"\n错误: 无法写入文件 {filepath}: {e}")
        return False


async def async_main():
    parser = argparse.ArgumentParser(description="南京大学电费查询工具")
    parser.add_argument("-d", "--dir", type=str, help="输出目录", default=None)
    parser.add_argument("-c", "--concurrency", type=int, help=f"最大并发数 (默认{DEFAULT_CONCURRENCY})", default=DEFAULT_CONCURRENCY)
    parser.add_argument("--cookie-file", type=str, help="Cookie JSON文件路径", default=DEFAULT_COOKIE_FILE)
    parser.add_argument("-q", "--quiet", action="store_true", help="安静模式，减少输出")
    parser.add_argument("--scan", type=int, nargs=2, metavar=('START', 'END'), help="扫描ID区间模式: 扫描指定范围内的所有ID")
    parser.add_argument("--scan-output", type=str, default="config/room_ids.txt", help="扫描结果输出文件 (默认: config/room_ids.txt)")
    parser.add_argument("room_ids", nargs="*", help="宿舍ID列表 (扫描模式下不需要)")
    args = parser.parse_args()

    room_ids = args.room_ids
    output_dir = Path(args.dir) if args.dir else None
    max_concurrent = args.concurrency
    cookie_file = args.cookie_file
    show_progress = not args.quiet

    if not os.path.exists(cookie_file):
        print(f"错误: Cookie 文件不存在: {cookie_file}")
        print(f"请使用 --cookie-file 参数指定有效的 cookie 文件路径")
        sys.exit(1)
    
    cookies = await load_cookies_from_file(cookie_file)
    if show_progress:
        print(f"✓ 已加载 Cookie 文件: {cookie_file}")

    # 扫描模式
    if args.scan:
        start_id, end_id = args.scan
        if start_id > end_id:
            print(f"错误: 起始ID ({start_id}) 不能大于结束ID ({end_id})")
            sys.exit(1)

        if show_progress:
            print(f"开始扫描ID区间: {start_id} - {end_id} (共 {end_id - start_id + 1} 个ID)")
            print(f"并发数: {max_concurrent}")
            print("-" * 50)

        start_time = time.time()
        result = await scan_room_ids(start_id, end_id, cookies, args.scan_output, max_concurrent, show_progress)
        elapsed = time.time() - start_time

        if show_progress:
            print("-" * 50)
            print(f"扫描完成!")
            print(f"  总数: {result['total']}")
            print(f"  发现: {result['found']}")
            print(f"  错误: {result['total_errors']}")
            print(f"  耗时: {elapsed:.2f}秒")
            print(f"  输出: {result['output_file']}")
            print("-" * 50)

        return

    # 正常查询模式
    if not room_ids:
        print("错误: 请提供宿舍ID列表或使用 --scan 模式")
        sys.exit(1)

    if output_dir and output_dir.exists():
        if not output_dir.is_dir():
            print(f"错误: {output_dir} 不是一个目录")
            sys.exit(1)
        if not os.access(output_dir, os.W_OK):
            print(f"错误: 没有权限写入目录 {output_dir}")
            sys.exit(1)

    if show_progress:
        print(f"开始查询 {len(room_ids)} 个宿舍 (并发数: {max_concurrent})...")
        print("-" * 50)

    start_time = time.time()
    summary = await query_batch(room_ids, cookies, output_dir, show_progress=show_progress, max_concurrent=max_concurrent)
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
        print("=" * 50)
    else:
        print(f"成功: {summary['succeeded']}")
        print(f"失败: {summary['failed']}")
        print(f"耗时: {elapsed:.2f}s")
        print(f"完成: {summary['succeeded']}/{summary['total']} 成功, 失败 {summary['failed']}, 耗时 {elapsed:.2f}s")

    if summary['failed'] > 0:
        if show_progress:
            print("\n--- 失败原因统计 ---")
            error_count = {}
            for detail in summary.get("failed_details", []):
                error_type = detail.get("error_type", "unknown")
                error_count[error_type] = error_count.get(error_type, 0) + 1

            error_messages = {
                "network_error": "网络错误: 无法连接到服务器",
                "timeout": "请求超时: 服务器响应过慢",
                "auth_failed": "认证失败: Cookie已过期，请更新认证信息",
                "not_found": "资源不存在: 宿舍ID无效或已下架",
                "room_not_found": "房间不存在: 该房间ID在系统中不存在",
                "http_error": "HTTP错误: 服务器内部错误",
                "parse_error": "解析失败: 页面格式已更新",
                "retry_exhausted": "重试次数耗尽",
                "unknown": "未知错误",
            }
            for error_type, count in error_count.items():
                msg = error_messages.get(error_type, error_type)
                print(f"  {msg}: {count}个")
        if summary['failed'] >= summary['succeeded']:
            sys.exit(1)


def main():
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
