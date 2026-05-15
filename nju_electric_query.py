#!/usr/bin/env python3
"""
南京大学电费查询脚本 (异步版本)
用法: python3 nju_electric_query.py [-d 输出目录] 宿舍ID1 宿舍ID2 ...
示例: python3 nju_electric_query.py -d ./database 53463 53464 53465
"""

import asyncio
import aiohttp
import argparse
import json
import os
import sys
import time
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin
from typing import Optional

# 默认 Cookie 文件路径
DEFAULT_COOKIE_FILE = "./epay.nju.edu.cn_json_1778821830826.json"

# 重试配置
MAX_RETRIES = 3
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


def load_cookies_from_file(filepath: str) -> dict:
    """从浏览器导出的 JSON 文件加载 cookie"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            cookies_list = json.load(f)

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


def load_config():
    """加载配置"""
    if os.path.exists(DEFAULT_COOKIE_FILE):
        return load_cookies_from_file(DEFAULT_COOKIE_FILE)
    else:
        print(f"错误: 默认 Cookie 文件不存在: {DEFAULT_COOKIE_FILE}")
        print("请更新脚本中的 DEFAULT_COOKIE_FILE 路径")
        sys.exit(1)


# 加载 Cookie
COOKIES = load_config()


def parse_html(html: str) -> dict:
    """解析 HTML 页面，提取电费信息"""
    result = {}

    # 从 JS 片段提取 this.check 的 JSON 数据
    match = re.search(r'this\.check\s*=\s*(\{.*\})', html)
    if match:
        try:
            check_data = json.loads(match.group(1))
            result["校区"] = check_data.get("sysName", "")
            result["楼栋"] = check_data.get("buildName", "")
            result["房间"] = check_data.get("roomName", "")
            result["宿舍ID"] = check_data.get("id", "")
            result["学号"] = check_data.get("stuempno", "")
        except json.JSONDecodeError:
            pass

    # 提取剩余电量
    match = re.search(r'剩余电量.*?<i>([\d.]+)度</i>', html)
    if match:
        result["剩余电量"] = f"{match.group(1)}度"

    return result


class QueryError:
    """查询错误类型"""
    NETWORK_ERROR = "网络错误"
    TIMEOUT = "请求超时"
    AUTH_FAILED = "认证失败"
    HTTP_ERROR = "HTTP错误"
    PARSE_ERROR = "解析失败"
    NOT_FOUND = "资源不存在"
    RETRY_EXHAUSTED = "重试次数耗尽"
    UNKNOWN = "未知错误"


async def query_single_with_retry(session: aiohttp.ClientSession, room_id: str, show_retry: bool = True) -> dict:
    """带重试的异步查询单个宿舍电费"""
    url = urljoin(base_url, f"/epay/h5/nju/electric/charge?id={room_id}")
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            async with session.get(url, cookies=COOKIES, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=30)) as response:
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

                    # 检查是否需要登录
                    if "login" in html.lower() or "登录" in html:
                        last_error = {"id": room_id, "error": QueryError.AUTH_FAILED, "error_type": "auth_failed", "success": False}
                        break

                    # 解析 HTML
                    result = parse_html(html)

                    # 检查是否解析成功
                    if not result.get("剩余电量"):
                        last_error = {"id": room_id, "error": QueryError.PARSE_ERROR, "error_type": "parse_error", "success": False}
                        raise aiohttp.ClientConnectorError

                    result["id"] = room_id
                    result["success"] = True
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
    if last_error and last_error.get("error_type") not in ("auth_failed", "not_found", "parse_error"):
        last_error["error"] = f"{QueryError.RETRY_EXHAUSTED}({last_error.get('error', '')})"
        last_error["error_type"] = "retry_exhausted"

    return last_error or {"id": room_id, "error": QueryError.UNKNOWN, "error_type": "unknown", "success": False}


async def query_batch(room_ids: list[str], output_dir: Optional[Path] = None, show_progress: bool = True, max_concurrent: int = DEFAULT_CONCURRENCY):
    """异步批量查询 - 流式处理，内存友好

    Args:
        room_ids: 宿舍ID列表
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
        async with semaphore:
            return await query_single_with_retry(session, room_id, show_progress)

    connector = aiohttp.TCPConnector(limit=max_concurrent)
    async with aiohttp.ClientSession(connector=connector) as session:
        # 使用异步迭代器流式生成任务
        async def task_generator():
            for room_id in room_ids:
                yield limited_query(session, room_id)

        # 流式处理：只维护 max_concurrent * 2 个待处理任务
        tasks_gen = task_generator()
        pending = set()

        # 初始填充：先提交一批任务
        batch_size = max_concurrent * 2
        for _ in range(min(batch_size, total)):
            try:
                task = await tasks_gen.__anext__()
                pending.add(asyncio.create_task(task))
            except StopAsyncIteration:
                break

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
                        save_result(result, output_dir, quiet=False)
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


def save_result(result: dict, output_dir: Path, quiet: bool = False):
    """保存结果到文件，格式: {校区}/{楼栋}/{房间}-{房间id}/{日期}.json"""
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

    # 提取路径信息
    campus = result.get("校区", "未知校区")
    building = result.get("楼栋", "未知楼栋")
    room = result.get("房间", "未知房间")
    room_id = result.get("id", result.get("宿舍ID", ""))

    # 清理路径中的非法字符
    campus = re.sub(r'[<>:"/\\|?*]', '_', campus)
    building = re.sub(r'[<>:"/\\|?*]', '_', building)
    room = re.sub(r'[<>:"/\\|?*]', '_', room)

    # 构建路径: {校区}/{楼栋}/{房间}-{房间id}/{日期}.json
    dir_path = output_dir / campus / building / f"{room}-{room_id}"
    date_str = datetime.now().strftime("%Y%m%d")
    filename = f"{date_str}.json"
    filepath = dir_path / filename

    # 创建目录
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

    # 检查文件是否已存在
    if filepath.exists():
        if not quiet:
            print(f"\n警告: 文件 {filepath} 已存在，跳过保存")
        return False

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        return True
    except PermissionError:
        if not quiet:
            print(f"\n错误: 没有权限写入文件 {filepath}")
        return False
    except Exception as e:
        if not quiet:
            print(f"\n错误: 无法写入文件 {filepath}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="南京大学电费查询工具")
    parser.add_argument("-d", "--dir", type=str, help="输出目录", default=None)
    parser.add_argument("-c", "--concurrency", type=int, help=f"最大并发数 (默认{DEFAULT_CONCURRENCY})", default=DEFAULT_CONCURRENCY)
    parser.add_argument("room_ids", nargs="+", help="宿舍ID列表")
    args = parser.parse_args()

    room_ids = args.room_ids
    output_dir = Path(args.dir) if args.dir else None
    max_concurrent = args.concurrency

    if output_dir and output_dir.exists():
        if not output_dir.is_dir():
            print(f"错误: {output_dir} 不是一个目录")
            sys.exit(1)
        if not os.access(output_dir, os.W_OK):
            print(f"错误: 没有权限写入目录 {output_dir}")
            sys.exit(1)

    print(f"开始查询 {len(room_ids)} 个宿舍 (并发数: {max_concurrent})...")
    print("-" * 50)

    start_time = time.time()
    summary = asyncio.run(query_batch(room_ids, output_dir, max_concurrent=max_concurrent))
    elapsed = time.time() - start_time

    print("=" * 50)
    print(f"查询完成!")
    print(f"  总数: {summary['total']}")
    print(f"  成功: {summary['succeeded']}")
    print(f"  失败: {summary['failed']}")
    print(f"  耗时: {elapsed:.2f}秒")
    if output_dir:
        print(f"  输出目录: {output_dir.absolute()}")
    print("=" * 50)

    if summary['failed'] > 0:
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
            "http_error": "HTTP错误: 服务器内部错误",
            "parse_error": "解析失败: 页面格式已更新",
            "retry_exhausted": "重试次数耗尽",
            "unknown": "未知错误",
        }
        for error_type, count in error_count.items():
            msg = error_messages.get(error_type, error_type)
            print(f"  {msg}: {count}个")


if __name__ == "__main__":
    main()
