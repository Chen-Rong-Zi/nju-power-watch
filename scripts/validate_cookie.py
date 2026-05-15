#!/usr/bin/env python3
"""
Cookie validation script for NJU epay system.
Validates authentication cookie before batch query operations.
"""
import asyncio
import aiohttp
import json
import sys
from pathlib import Path
from urllib.parse import urljoin


async def validate_cookie(cookie_file: str, test_room_id: str = "53463") -> bool:
    """
    Validate cookie by making test query to epay system.
    
    Args:
        cookie_file: Path to JSON file containing cookie array
        test_room_id: Room ID to use for test query (default: first known room)
    
    Returns:
        True if cookie is valid
    
    Raises:
        FileNotFoundError: If cookie file doesn't exist
        json.JSONDecodeError: If cookie file is not valid JSON
        ValueError: If cookie is expired or invalid
    """
    # Load cookie from file
    cookie_path = Path(cookie_file)
    if not cookie_path.exists():
        raise FileNotFoundError(f"Cookie file not found: {cookie_file}")
    
    with open(cookie_path, 'r', encoding='utf-8') as f:
        cookies_list = json.load(f)
    
    # Convert to cookie dict
    cookies = {}
    for cookie in cookies_list:
        name = cookie.get("name")
        value = cookie.get("value")
        if name and value:
            cookies[name] = value
    
    # Test query
    base_url = "https://epay.nju.edu.cn"
    url = f"{base_url}/epay/h5/nju/electric/charge?id={test_room_id}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Referer": base_url,
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, cookies=cookies, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status in (401, 403):
                    raise ValueError("Cookie expired or invalid. Please update EPAY_COOKIE secret.")
                
                html = await response.text()
                
                # Check if redirected to login
                if "login" in html.lower() or "登录" in html:
                    raise ValueError("Cookie expired. Session redirected to login page.")
                
                return True
    
    except asyncio.TimeoutError:
        raise ValueError("Cookie validation timed out. Network may be slow.")
    except aiohttp.ClientError as e:
        raise ValueError(f"Network error during cookie validation: {e}")


def main():
    """Main entry point for cookie validation."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Validate epay cookie")
    parser.add_argument("cookie_file", help="Path to cookie JSON file")
    parser.add_argument("--test-room", default="53463", help="Test room ID for validation")
    args = parser.parse_args()
    
    try:
        result = asyncio.run(validate_cookie(args.cookie_file, args.test_room))
        if result:
            print("✓ Cookie is valid")
            print(f"✓ Successfully authenticated to epay.nju.edu.cn")
            sys.exit(0)
    except Exception as e:
        print(f"✗ Cookie validation failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
