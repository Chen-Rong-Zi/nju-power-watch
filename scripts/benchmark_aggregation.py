#!/usr/bin/env python3
"""
Performance comparison script for aggregation optimization.
Compares sync vs async file processing.
"""
import time
import json
from pathlib import Path
from datetime import datetime, timedelta
import asyncio
import aiofiles


def create_test_data(database_dir: Path, num_rooms: int, days: int = 30):
    """Create test data for performance testing."""
    print(f"Creating test data: {num_rooms} rooms, {days} days each...")
    
    for i in range(num_rooms):
        room_id = f"53{str(i).zfill(3)}"
        campus = "仙林校区"
        building = f"{(i // 50) + 1}幢"
        room_name = f"{building}第{(i % 50) + 1}层{str(i).zfill(4)}"
        
        room_dir = database_dir / campus / building / f"{room_name}-{room_id}"
        room_dir.mkdir(parents=True, exist_ok=True)
        
        # Create daily files
        for days_ago in range(days):
            date = datetime.now() - timedelta(days=days_ago)
            date_str = date.strftime("%Y%m%d")
            
            data = {
                "id": room_id,
                "校区": campus,
                "楼栋": building,
                "房间": room_name,
                "宿舍ID": room_id,
                "剩余电量": f"{100.0 + i}度",
                "timestamp": date.isoformat(),
                "success": True
            }
            
            file_path = room_dir / f"{date_str}.json"
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
    
    print(f"✓ Created {num_rooms * days} files")


def sync_read_files(database_dir: Path):
    """Synchronously read all JSON files."""
    start_time = time.time()
    
    file_count = 0
    for json_file in database_dir.rglob("*.json"):
        with open(json_file, 'r', encoding='utf-8') as f:
            json.load(f)
        file_count += 1
    
    elapsed = time.time() - start_time
    return file_count, elapsed


async def async_read_file(file_path: Path):
    """Asynchronously read single JSON file."""
    async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
        content = await f.read()
        return json.loads(content)


async def async_read_files(database_dir: Path):
    """Asynchronously read all JSON files concurrently."""
    start_time = time.time()
    
    # Collect all file paths
    file_paths = list(database_dir.rglob("*.json"))
    
    # Read all files concurrently
    tasks = [async_read_file(fp) for fp in file_paths]
    results = await asyncio.gather(*tasks)
    
    elapsed = time.time() - start_time
    return len(results), elapsed


def benchmark(database_dir: Path, test_name: str, num_rooms: int):
    """Run benchmark comparison."""
    print(f"\n{'='*60}")
    print(f"Benchmark: {test_name}")
    print(f"{'='*60}")
    
    # Create test data
    database_dir.mkdir(parents=True, exist_ok=True)
    create_test_data(database_dir, num_rooms, days=30)
    
    # Sync benchmark
    print("\nTesting synchronous file reading...")
    sync_count, sync_time = sync_read_files(database_dir)
    print(f"  Files: {sync_count}")
    print(f"  Time: {sync_time:.2f}s")
    print(f"  Speed: {sync_count / sync_time:.1f} files/s")
    
    # Async benchmark
    print("\nTesting asynchronous file reading...")
    async_count, async_time = asyncio.run(async_read_files(database_dir))
    print(f"  Files: {async_count}")
    print(f"  Time: {async_time:.2f}s")
    print(f"  Speed: {async_count / async_time:.1f} files/s")
    
    # Comparison
    speedup = sync_time / async_time
    print(f"\n{'='*60}")
    print(f"Results:")
    print(f"{'='*60}")
    print(f"  Speedup: {speedup:.1f}x faster")
    print(f"  Time saved: {sync_time - async_time:.2f}s")
    print(f"  Performance improvement: {((sync_time - async_time) / sync_time * 100):.1f}%")
    
    return sync_time, async_time, speedup


def cleanup(database_dir: Path):
    """Clean up test data."""
    import shutil
    if database_dir.exists():
        shutil.rmtree(database_dir)


def main():
    """Run benchmarks with different scales."""
    import tempfile
    
    results = []
    
    # Test 1: 100 rooms
    with tempfile.TemporaryDirectory() as tmpdir:
        database_dir = Path(tmpdir) / "database"
        sync1, async1, speedup1 = benchmark(database_dir, "100 rooms (3,000 files)", 100)
        results.append(("100 rooms", sync1, async1, speedup1))
    
    # Test 2: 500 rooms
    with tempfile.TemporaryDirectory() as tmpdir:
        database_dir = Path(tmpdir) / "database"
        sync2, async2, speedup2 = benchmark(database_dir, "500 rooms (15,000 files)", 500)
        results.append(("500 rooms", sync2, async2, speedup2))
    
    # Test 3: 1000 rooms
    with tempfile.TemporaryDirectory() as tmpdir:
        database_dir = Path(tmpdir) / "database"
        sync3, async3, speedup3 = benchmark(database_dir, "1000 rooms (30,000 files)", 1000)
        results.append(("1000 rooms", sync3, async3, speedup3))
    
    # Summary
    print(f"\n{'='*60}")
    print("Summary:")
    print(f"{'='*60}")
    print(f"{'Scale':<20} {'Sync (s)':<15} {'Async (s)':<15} {'Speedup':<10}")
    print(f"{'-'*60}")
    for name, sync, async_t, speedup in results:
        print(f"{name:<20} {sync:<15.2f} {async_t:<15.2f} {speedup:<10.1f}x")
    
    print(f"\n✓ Async IO provides {results[-1][3]:.1f}x speedup for {results[-1][0]}")


if __name__ == "__main__":
    main()
