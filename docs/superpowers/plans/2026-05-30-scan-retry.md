# Scan Mode Retry Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add infinite retry logic for network-related errors in scan mode, treating only "room not found" and "parse error" as permanent failures.

**Architecture:** Wrap the request logic in `scan_single` with a `while True` loop that retries on transient errors (timeout, network, HTTP, auth) and only exits on success or permanent error.

**Tech Stack:** Python 3.11, aiohttp

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `nju_electric_query.py` | Modify | Add retry loop to `scan_single` function |

---

### Task 1: Add Retry Loop to scan_single

**Files:**
- Modify: `nju_electric_query.py:356-407`

- [ ] **Step 1: Rewrite scan_single with retry loop**

Replace the entire `scan_single` function with:

```python
    async def scan_single(session, room_id):
        nonlocal processed
        async with semaphore:
            url = urljoin(base_url, f"/epay/h5/nju/electric/charge?id={room_id}")
            
            while True:
                try:
                    async with session.get(url, cookies=cookies, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=30)) as response:
                        if response.status != 200:
                            # 可重试错误，继续循环
                            error_counts["http_error"] += 1
                            await asyncio.sleep(1)  # 短暂等待后重试
                            continue

                        html = await response.text()

                        # 检查是否是错误页面（房间不存在）- 永久错误
                        if "房间查询失败" in html or ("查询房间信息失败" in html):
                            error_counts["room_not_found"] += 1
                            break

                        # 检查是否需要登录 - 可重试错误
                        if "login" in html.lower() or "登录" in html:
                            error_counts["auth_failed"] += 1
                            await asyncio.sleep(1)
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
                    await asyncio.sleep(1)
                    continue
                except aiohttp.ClientConnectorError as e:
                    # 可重试错误
                    error_counts["network_error"] += 1
                    print(f"{e}")
                    await asyncio.sleep(1)
                    continue
                except Exception:
                    # 可重试错误
                    error_counts["network_error"] += 1
                    await asyncio.sleep(1)
                    continue

            # 只在函数退出时更新进度
            processed += 1
            if show_progress and processed % 100 == 0:
                print(f"\r[{processed}/{total}] 已发现: {len(seen_rooms)}", end="", flush=True)
```

- [ ] **Step 2: Commit**

```bash
git add nju_electric_query.py
git commit -m "feat: add infinite retry for transient errors in scan mode

Only room_not_found and parse_error are treated as permanent failures.
Network, timeout, HTTP, and auth errors will retry indefinitely."
```

---

## Verification

After implementation, verify:

1. **Retry works**: Manually test with a small range and observe retry behavior on network errors
2. **Permanent errors exit**: Room not found and parse errors should not trigger retry
