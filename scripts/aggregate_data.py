#!/usr/bin/env python3
"""
Optimized hierarchical aggregation script using async IO.
Generates lightweight summaries with date → balance mapping only.
"""
import json
import sys
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List
from collections import defaultdict
import asyncio
import aiofiles

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)
logger = logging.getLogger(__name__)


async def read_json_file(file_path: Path) -> Dict[str, Any]:
    """Asynchronously read and parse JSON file."""
    try:
        async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
            content = await f.read()
            return json.loads(content)
    except Exception as e:
        logger.warning(f"Failed to read {file_path}: {e}")
        return None


async def write_json_file(file_path: Path, data: Dict[str, Any]) -> None:
    """Asynchronously write JSON file."""
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(file_path, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(data, ensure_ascii=False, indent=2))
    except Exception as e:
        logger.error(f"Failed to write {file_path}: {e}")


async def process_room(room_dir: Path) -> Dict[str, Any]:
    """
    Process a single room directory asynchronously.
    Returns simplified data: date → balance mapping.
    """
    # Extract room ID from directory name
    dir_name = room_dir.name
    parts = dir_name.rsplit('-', 1)
    if len(parts) != 2 or not parts[1].isdigit():
        return None
    
    room_id = parts[1]
    room_name = parts[0]
    
    # Get all JSON files in room directory
    json_files = sorted(room_dir.glob("*.json"), key=lambda f: f.stem)
    
    if not json_files:
        return None
    
    # Read all JSON files concurrently
    tasks = [read_json_file(f) for f in json_files]
    results = await asyncio.gather(*tasks)
    
    # Build date → balance mapping
    balance_history = {}
    campus = None
    building = None
    
    for result in results:
        if not result or not result.get('success', False):
            continue
        
        # Extract metadata from first successful result
        if not campus:
            campus = result.get('校区', 'Unknown')
            building = result.get('楼栋', 'Unknown')
        
        # Extract balance
        balance_str = result.get('剩余电量', '0度')
        balance = float(balance_str.replace('度', ''))
        
        # Extract date from filename
        json_file = json_files[results.index(result)]
        date = json_file.stem  # YYYYMMDD
        
        balance_history[date] = balance
    
    if not balance_history:
        return None
    
    # Get latest balance
    latest_date = max(balance_history.keys())
    current_balance = balance_history[latest_date]
    
    return {
        'room_id': room_id,
        'room_name': room_name,
        'campus': campus,
        'building': building,
        'current_balance': current_balance,
        'balance_history': balance_history,  # {date: balance}
        'last_updated': latest_date
    }


async def process_all_rooms(database_dir: Path) -> List[Dict[str, Any]]:
    """
    Process all rooms concurrently with controlled concurrency.
    """
    # Find all room directories
    room_dirs = []
    for campus_dir in database_dir.iterdir():
        if not campus_dir.is_dir() or campus_dir.name in ('archives', 'summaries'):
            continue
        
        for building_dir in campus_dir.iterdir():
            if not building_dir.is_dir():
                continue
            
            for room_dir in building_dir.iterdir():
                if room_dir.is_dir() and '-' in room_dir.name:
                    room_dirs.append(room_dir)
    
    logger.info(f"Found {len(room_dirs)} room directories")
    
    # Process rooms with limited concurrency to avoid "too many open files"
    semaphore = asyncio.Semaphore(100)  # Limit concurrent file operations
    
    async def process_with_limit(room_dir):
        async with semaphore:
            return await process_room(room_dir)
    
    # Process all rooms concurrently
    tasks = [process_with_limit(room_dir) for room_dir in room_dirs]
    results = await asyncio.gather(*tasks)
    
    # Filter out None results
    return [r for r in results if r is not None]


def organize_by_hierarchy(rooms_data: List[Dict[str, Any]]) -> Dict[str, Dict[str, Dict[str, Dict]]]:
    """
    Organize processed room data by hierarchy.
    Returns: {campus: {building: {room_id: room_data}}}
    """
    hierarchy = defaultdict(lambda: defaultdict(dict))
    
    for room_data in rooms_data:
        campus = room_data['campus']
        building = room_data['building']
        room_id = room_data['room_id']
        
        hierarchy[campus][building][room_id] = room_data
    
    return hierarchy


async def generate_hierarchical_summaries(database_dir: str, output_dir: str) -> Dict[str, Any]:
    """
    Generate lightweight hierarchical summaries.
    """
    database_path = Path(database_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Process all rooms concurrently
    logger.info("Processing rooms...")
    rooms_data = await process_all_rooms(database_path)
    logger.info(f"Processed {len(rooms_data)} rooms successfully")
    
    # Organize by hierarchy
    logger.info("Organizing by hierarchy...")
    hierarchy = organize_by_hierarchy(rooms_data)
    
    # Track statistics
    all_campuses_stats = {}
    total_rooms = len(rooms_data)
    
    # Semaphore for write operations
    write_semaphore = asyncio.Semaphore(50)  # Limit concurrent writes
    
    async def write_with_limit(file_path: Path, data: Dict[str, Any]):
        async with write_semaphore:
            await write_json_file(file_path, data)
    
    # Prepare all write tasks
    write_tasks = []
    
    # Generate summaries for each campus
    for campus, buildings in hierarchy.items():
        campus_dir = output_path / "campuses" / campus
        campus_dir.mkdir(parents=True, exist_ok=True)
        
        campus_rooms_count = 0
        buildings_stats = {}
        
        # Generate summaries for each building
        for building, rooms in buildings.items():
            building_dir = campus_dir / "buildings" / building
            building_dir.mkdir(parents=True, exist_ok=True)
            
            # Building summary: room_id → {room_name, current_balance, last_updated}
            building_rooms = {}
            for room_id, room_data in rooms.items():
                building_rooms[room_id] = {
                    'room_name': room_data['room_name'],
                    'current_balance': room_data['current_balance'],
                    'last_updated': room_data['last_updated']
                }
            
            building_summary = {
                'building': building,
                'campus': campus,
                'total_rooms': len(rooms),
                'rooms': building_rooms
            }
            
            # Write building summary
            building_file = building_dir / "summary.json"
            write_tasks.append(write_with_limit(building_file, building_summary))
            
            # Write individual room files
            for room_id, room_data in rooms.items():
                room_file = building_dir / "rooms" / f"{room_id}.json"
                room_summary = {
                    'room_id': room_id,
                    'room_name': room_data['room_name'],
                    'campus': campus,
                    'building': building,
                    'current_balance': room_data['current_balance'],
                    'balance_history': room_data['balance_history'],
                    'last_updated': room_data['last_updated']
                }
                write_tasks.append(write_with_limit(room_file, room_summary))
            
            buildings_stats[building] = {
                'total_rooms': len(rooms),
                'avg_balance': round(sum(r['current_balance'] for r in rooms.values()) / len(rooms), 2)
            }
            
            campus_rooms_count += len(rooms)
        
        # Campus summary
        campus_summary = {
            'campus': campus,
            'total_rooms': campus_rooms_count,
            'buildings': buildings_stats
        }
        
        campus_file = campus_dir / "summary.json"
        write_tasks.append(write_with_limit(campus_file, campus_summary))
        
        all_campuses_stats[campus] = {
            'total_rooms': campus_rooms_count,
            'buildings_count': len(buildings)
        }
    
    # Overview
    overview = {
        'generated_at': datetime.now().isoformat(),
        'total_rooms': total_rooms,
        'campuses': all_campuses_stats
    }
    
    overview_file = output_path / "overview.json"
    write_tasks.append(write_with_limit(overview_file, overview))
    
    # Execute all writes with controlled concurrency
    logger.info(f"Writing {len(write_tasks)} files...")
    await asyncio.gather(*write_tasks)
    
    logger.info(f"✓ Generated summaries for {total_rooms} rooms")
    
    return overview


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate hierarchical summaries with async IO")
    parser.add_argument(
        "--database", "-d",
        required=True,
        help="Path to database directory"
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Path to output summaries directory (default: database/summaries/)"
    )
    args = parser.parse_args()
    
    # Default output location
    output_dir = args.output or str(Path(args.database) / "summaries")
    
    try:
        # Run async main
        overview = asyncio.run(generate_hierarchical_summaries(args.database, output_dir))
        
        print(f"✓ Hierarchical summaries generated:")
        print(f"  Total rooms: {overview['total_rooms']}")
        print(f"  Campuses: {len(overview['campuses'])}")
        print(f"  Output: {output_dir}")
        sys.exit(0)
    
    except Exception as e:
        print(f"✗ Aggregation failed: {e}", file=sys.stderr)
        logger.error(f"Aggregation failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
