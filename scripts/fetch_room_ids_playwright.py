#!/usr/bin/env python3
"""
使用Playwright获取南京大学电费系统中的所有房间ID映射

由于API接口有保护机制，需要使用浏览器自动化来获取数据。

用法:
    python scripts/fetch_room_ids_playwright.py --output room_mapping.json
    python scripts/fetch_room_ids_playwright.py --campus "仙林校区" --building "19幢"

首次使用需要登录:
    python scripts/fetch_room_ids_playwright.py --login
"""

import asyncio
import argparse
import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

try:
    from playwright.async_api import async_playwright, Page, Browser
except ImportError:
    print("错误: 需要安装 playwright")
    print("  pip install playwright")
    print("  playwright install chromium")
    sys.exit(1)


BASE_URL = "https://epay.nju.edu.cn"

# 校区系统ID映射
CAMPUS_SYSID = {
    "仙林校区": 3,
    "鼓楼校区": 2,
    "苏州校区": 7,
    "浦口校区": 8,
}


async def wait_for_login(page: Page) -> bool:
    """等待用户登录"""
    print("请在浏览器中登录...")
    print("登录成功后会自动继续")

    # 等待页面跳转到电费页面
    max_wait = 300  # 最多等待5分钟
    for i in range(max_wait):
        current_url = page.url
        if "epay.nju.edu.cn/epay/h5/nju/electric" in current_url:
            print("登录成功!")
            return True
        await asyncio.sleep(1)

    return False


async def fetch_buildings(page: Page, campus_name: str) -> List[dict]:
    """获取指定校区的楼栋列表"""
    # 导航到编辑页面
    await page.goto(f"{BASE_URL}/epay/h5/nju/electric/edit")
    await page.wait_for_load_state("networkidle")

    # 选择校区
    campus_select = page.locator('select').first
    await campus_select.select_option(label=campus_name)
    await page.wait_for_timeout(500)

    # 等待楼栋列表加载
    await page.wait_for_timeout(1000)

    # 获取楼栋选项
    building_select = page.locator('select').nth(1)
    options = await building_select.locator('option').all_text_contents()

    buildings = []
    # 跳过第一个"请选择楼栋"选项
    for opt in options[1:]:
        buildings.append({"name": opt.strip()})

    return buildings


async def fetch_rooms_for_building(page: Page, campus_name: str, building_name: str) -> List[dict]:
    """获取指定楼栋的房间列表"""
    # 导航到编辑页面
    await page.goto(f"{BASE_URL}/epay/h5/nju/electric/edit")
    await page.wait_for_load_state("networkidle")

    # 选择校区
    campus_select = page.locator('select').first
    await campus_select.select_option(label=campus_name)
    await page.wait_for_timeout(500)

    # 选择楼栋
    building_select = page.locator('select').nth(1)
    await building_select.select_option(label=building_name)
    await page.wait_for_timeout(1000)

    # 等待房间列表响应
    await page.wait_for_timeout(500)

    # 点击房间下拉框展开
    room_dropdown = page.locator('text=请选择房间号')
    if await room_dropdown.count() > 0:
        await room_dropdown.click()
        await page.wait_for_timeout(500)

    # 获取房间列表
    rooms = []
    room_items = page.locator('[role="treeitem"]')
    count = await room_items.count()

    for i in range(count):
        item = room_items.nth(i)
        text = await item.text_content()
        if text and "请选择" not in text:
            rooms.append({"name": text.strip()})

    return rooms


async def add_room_and_get_id(page: Page, campus_name: str, building_name: str, room_name: str) -> Optional[int]:
    """添加房间地址并获取数据库ID"""
    # 导航到编辑页面
    await page.goto(f"{BASE_URL}/epay/h5/nju/electric/edit")
    await page.wait_for_load_state("networkidle")

    # 选择校区
    campus_select = page.locator('select').first
    await campus_select.select_option(label=campus_name)
    await page.wait_for_timeout(500)

    # 选择楼栋
    building_select = page.locator('select').nth(1)
    await building_select.select_option(label=building_name)
    await page.wait_for_timeout(1000)

    # 点击房间下拉框
    room_dropdown = page.locator('text=请选择房间号')
    if await room_dropdown.count() > 0:
        await room_dropdown.click()
        await page.wait_for_timeout(500)

    # 选择房间
    room_item = page.locator(f'[role="treeitem"]:has-text("{room_name}")')
    if await room_item.count() > 0:
        await room_item.click()
        await page.wait_for_timeout(500)

    # 点击完成
    complete_btn = page.locator('text=完成')
    if await complete_btn.count() > 0:
        await complete_btn.click()
        await page.wait_for_timeout(1000)

    # 获取新添加的房间ID（从URL或页面中提取）
    await page.goto(f"{BASE_URL}/epay/h5/nju/electric/index")
    await page.wait_for_load_state("networkidle")

    # 点击刚添加的房间
    room_address = page.locator(f'text={campus_name} {building_name} {room_name}')
    if await room_address.count() > 0:
        await room_address.click()
        await page.wait_for_timeout(500)

        # 点击去充值
        charge_btn = page.locator('text=去充值')
        if await charge_btn.count() > 0:
            await charge_btn.click()
            await page.wait_for_load_state("networkidle")

            # 从URL获取ID
            current_url = page.url
            if "id=" in current_url:
                import re
                match = re.search(r'id=(\d+)', current_url)
                if match:
                    return int(match.group(1))

    return None


async def fetch_all_rooms_playwright(
    campus_name: Optional[str] = None,
    building_name: Optional[str] = None,
    headless: bool = True,
    login_mode: bool = False,
    cookie_file: Optional[str] = None,
    progress_callback=None
) -> List[dict]:
    """使用Playwright获取所有房间映射"""

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context()

        # 加载保存的cookies
        if cookie_file and Path(cookie_file).exists():
            cookies = json.loads(Path(cookie_file).read_text())
            await context.add_cookies(cookies)

        page = await context.new_page()

        # 导航到电费页面
        await page.goto(f"{BASE_URL}/epay/h5/nju/electric/index")
        await page.wait_for_load_state("networkidle")

        # 检查是否需要登录
        if "authserver" in page.url or "login" in page.url:
            if login_mode:
                if not await wait_for_login(page):
                    print("登录超时")
                    await browser.close()
                    return []

                # 保存cookies
                if cookie_file:
                    cookies = await context.cookies()
                    Path(cookie_file).write_text(json.dumps(cookies, indent=2))
                    print(f"Cookies已保存到 {cookie_file}")
            else:
                print("需要登录，请使用 --login 参数")
                await browser.close()
                return []

        all_rooms = []

        # 确定要查询的校区
        target_campuses = [campus_name] if campus_name else list(CAMPUS_SYSID.keys())

        for campus in target_campuses:
            if progress_callback:
                progress_callback(f"正在获取 {campus} 的楼栋列表...")

            buildings = await fetch_buildings(page, campus)

            if not buildings:
                print(f"警告: 无法获取 {campus} 的楼栋列表")
                continue

            # 确定要查询的楼栋
            target_buildings = [building_name] if building_name else [b["name"] for b in buildings]

            for building in target_buildings:
                if progress_callback:
                    progress_callback(f"正在获取 {campus} {building} 的房间列表...")

                rooms = await fetch_rooms_for_building(page, campus, building)

                for room in rooms:
                    all_rooms.append({
                        "campus": campus,
                        "building": building,
                        "room_name": room["name"],
                    })

                if progress_callback:
                    progress_callback(f"{campus} {building}: {len(rooms)} 个房间")

        await browser.close()

        return all_rooms


async def async_main():
    parser = argparse.ArgumentParser(description="使用Playwright获取房间ID映射")
    parser.add_argument("--output", "-o", type=str, help="输出文件路径", default="room_mapping.json")
    parser.add_argument("--campus", type=str, help="只查询指定校区")
    parser.add_argument("--building", type=str, help="只查询指定楼栋")
    parser.add_argument("--login", action="store_true", help="登录模式，等待用户手动登录")
    parser.add_argument("--cookie-file", type=str, help="Cookie存储文件", default="/tmp/nju_epay_cookies.json")
    parser.add_argument("--no-headless", action="store_true", help="显示浏览器窗口")
    args = parser.parse_args()

    def progress(msg):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

    print("开始获取房间映射...")
    start_time = asyncio.get_event_loop().time()

    rooms = await fetch_all_rooms_playwright(
        campus_name=args.campus,
        building_name=args.building,
        headless=not args.no_headless,
        login_mode=args.login,
        cookie_file=args.cookie_file,
        progress_callback=progress
    )

    elapsed = asyncio.get_event_loop().time() - start_time

    if not rooms:
        print("错误: 未获取到任何房间数据")
        sys.exit(1)

    # 保存结果
    output_data = {
        "fetch_time": datetime.now().isoformat(),
        "total_rooms": len(rooms),
        "rooms": rooms
    }

    output_path = Path(args.output)
    output_path.write_text(json.dumps(output_data, ensure_ascii=False, indent=2))

    # 统计
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
