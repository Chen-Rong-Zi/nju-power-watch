#!/usr/bin/env python3
"""
Optimized hierarchical aggregation script with historical data merging.
Reads existing summaries, merges with new daily data, generates updated summaries.
"""
import json
import sys
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
import asyncio
import aiofiles

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)
logger = logging.getLogger(__name__)

LOW_CONFIDENCE = "low"
HIGH_CONFIDENCE = "high"
ANOMALY_CREDIT_OR_ADJUSTMENT = "credit_or_adjustment"
ANOMALY_INSUFFICIENT_HISTORY = "insufficient_history"


def build_daily_analysis(balance_history: Dict[str, float]) -> Dict[str, Dict[str, Any]]:
    """Infer daily consumption and confidence from balance history."""
    if not balance_history:
        return {}

    analysis = {}
    dates = sorted(balance_history.keys())

    for index, date in enumerate(dates):
        curr_balance = balance_history[date]
        prev_balance: Optional[float] = balance_history[dates[index - 1]] if index > 0 else None

        entry = {
            "prev_balance": prev_balance,
            "curr_balance": curr_balance,
            "balance_delta": None if prev_balance is None else round(curr_balance - prev_balance, 2),
            "inferred_consumption": None,
            "confidence": HIGH_CONFIDENCE,
            "anomaly_type": None,
            "exclude_from_aggregation": False,
            "reason_codes": []
        }

        if prev_balance is None:
            entry["confidence"] = LOW_CONFIDENCE
            entry["anomaly_type"] = ANOMALY_INSUFFICIENT_HISTORY
            entry["exclude_from_aggregation"] = True
            entry["reason_codes"].append("missing_previous_balance")
        elif curr_balance > prev_balance:
            entry["confidence"] = LOW_CONFIDENCE
            entry["anomaly_type"] = ANOMALY_CREDIT_OR_ADJUSTMENT
            entry["exclude_from_aggregation"] = True
            entry["reason_codes"].append("balance_increase")
        else:
            entry["inferred_consumption"] = round(prev_balance - curr_balance, 2)
            if curr_balance == prev_balance:
                entry["reason_codes"].append("balance_unchanged")
            else:
                entry["reason_codes"].append("balance_decrease")

        analysis[date] = entry

    return analysis

# Configuration
# Keep ALL historical data (no limit)
# Each room JSON will contain all queried dates and their balances
# Estimated size: ~11KB per room per year (365 days * ~30 bytes per entry)
# For 500 rooms: ~5.5MB per year, ~27.5MB for 5 years


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


async def load_existing_summaries(summaries_dir: Path) -> Dict[str, Dict[str, Any]]:
    """
    Load existing room summaries from database/summaries/.
    Returns: {room_id: room_data}
    """
    existing_data = {}

    if not summaries_dir.exists():
        logger.info("No existing summaries found, starting fresh")
        return existing_data

    logger.info("Loading existing summaries...")

    room_files = list(summaries_dir.rglob("rooms/*.json"))

    if not room_files:
        logger.info("No existing room summaries found")
        return existing_data

    semaphore = asyncio.Semaphore(100)

    async def read_with_limit(file_path: Path):
        async with semaphore:
            return await read_json_file(file_path)

    tasks = [read_with_limit(f) for f in room_files]
    results = await asyncio.gather(*tasks)

    for room_file, result in zip(room_files, results):
        if result and 'room_id' in result:
            existing_data[result['room_id']] = result

    logger.info(f"Loaded {len(existing_data)} existing room summaries")
    return existing_data


async def process_room(room_dir: Path, read_semaphore: asyncio.Semaphore) -> Dict[str, Any]:
    """
    Process a single room directory asynchronously.
    Returns simplified data: date → balance mapping.
    """
    dir_name = room_dir.name
    parts = dir_name.rsplit('-', 1)
    if len(parts) != 2 or not parts[1].isdigit():
        return None

    room_id = parts[1]
    room_name = parts[0]

    json_files = sorted(room_dir.glob("*.json"), key=lambda f: f.stem)

    if not json_files:
        return None

    async def read_with_limit(f: Path):
        async with read_semaphore:
            return await read_json_file(f)

    tasks = [read_with_limit(f) for f in json_files]
    results = await asyncio.gather(*tasks)

    balance_history = {}
    campus = None
    building = None

    for idx, result in enumerate(results):
        if not result or not result.get('success', False):
            continue

        if not campus:
            campus = result.get('校区', 'Unknown')
            building = result.get('楼栋', 'Unknown')

        balance_str = result.get('剩余电量', '0度')
        balance = float(balance_str.replace('度', ''))

        date = json_files[idx].stem

        balance_history[date] = balance

    if not balance_history:
        return None

    latest_date = max(balance_history.keys())
    current_balance = balance_history[latest_date]

    return {
        'room_id': room_id,
        'room_name': room_name,
        'campus': campus,
        'building': building,
        'current_balance': current_balance,
        'balance_history': balance_history,
        'daily_analysis': build_daily_analysis(balance_history),
        'last_updated': latest_date
    }


def ensure_room_analysis(room_data: Dict[str, Any]) -> Dict[str, Any]:
    """Backfill derived analysis fields for older summary records."""
    if not room_data:
        return room_data

    normalized = room_data.copy()
    normalized['daily_analysis'] = build_daily_analysis(normalized.get('balance_history', {}))
    return normalized


async def process_all_rooms(database_dir: Path) -> List[Dict[str, Any]]:
    """
    Process all rooms concurrently with controlled concurrency.
    """
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
    
    logger.info(f"Found {len(room_dirs)} room directories with new data")
    
    if not room_dirs:
        return []
    
    read_semaphore = asyncio.Semaphore(100)
    process_semaphore = asyncio.Semaphore(100)
    
    async def process_with_limit(room_dir):
        async with process_semaphore:
            return await process_room(room_dir, read_semaphore)
    
    tasks = [process_with_limit(room_dir) for room_dir in room_dirs]
    results = await asyncio.gather(*tasks)
    
    return [r for r in results if r is not None]


def merge_room_data(existing: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merge existing room data with new data.
    Combines balance_history from both, keeping most recent balance.
    Keeps ALL historical data (no limit).
    """
    if not existing:
        return new

    # Merge balance_history (keep ALL dates)
    merged_history = existing.get('balance_history', {}).copy()
    merged_history.update(new.get('balance_history', {}))

    # Get latest balance
    if merged_history:
        latest_date = max(merged_history.keys())
        current_balance = merged_history[latest_date]
    else:
        current_balance = new.get('current_balance', 0.0)
        latest_date = new.get('last_updated', datetime.now().strftime("%Y%m%d"))

    return {
        'room_id': new['room_id'],
        'room_name': new.get('room_name', existing.get('room_name', 'Unknown')),
        'campus': new.get('campus', existing.get('campus', 'Unknown')),
        'building': new.get('building', existing.get('building', 'Unknown')),
        'current_balance': current_balance,
        'balance_history': merged_history,
        'daily_analysis': build_daily_analysis(merged_history),
        'last_updated': latest_date
    }


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


async def generate_hierarchical_summaries(
    database_dir: str, 
    output_dir: str,
    merge_existing: bool = True
) -> Dict[str, Any]:
    """
    Generate lightweight hierarchical summaries with historical data merging.
    """
    database_path = Path(database_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Load existing summaries if they exist
    existing_summaries = {}
    if merge_existing:
        existing_summaries = await load_existing_summaries(output_path)
    
    # Process new data from raw database
    logger.info("Processing new data...")
    new_rooms_data = await process_all_rooms(database_path)
    logger.info(f"Processed {len(new_rooms_data)} rooms with new data")
    
    # Merge new data with existing
    logger.info("Merging with existing data...")
    all_rooms_data = {}

    # Start with existing data
    for room_id, room_data in existing_summaries.items():
        all_rooms_data[room_id] = ensure_room_analysis(room_data)
    # Merge new data
    for new_data in new_rooms_data:
        room_id = new_data['room_id']
        if room_id in all_rooms_data:
            all_rooms_data[room_id] = merge_room_data(all_rooms_data[room_id], new_data)
        else:
            all_rooms_data[room_id] = ensure_room_analysis(new_data)
    
    logger.info(f"Total rooms after merge: {len(all_rooms_data)}")
    
    # Organize by hierarchy
    logger.info("Organizing by hierarchy...")
    hierarchy = organize_by_hierarchy(list(all_rooms_data.values()))
    
    # Track statistics
    all_campuses_stats = {}
    total_rooms = len(all_rooms_data)
    
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
                write_tasks.append(write_with_limit(room_file, room_data))
            
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
        'campuses': all_campuses_stats,
        'config': {
            'history_policy': 'keep_all',
            'note': 'Each room contains ALL historical balance data'
        }
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
    
    parser = argparse.ArgumentParser(description="Generate hierarchical summaries with historical merging")
    parser.add_argument(
        "--database", "-d",
        required=True,
        help="Path to database directory (raw daily data)"
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Path to output summaries directory (default: database/summaries/)"
    )
    parser.add_argument(
        "--no-merge",
        action="store_true",
        help="Do not merge with existing summaries (fresh start)"
    )
    args = parser.parse_args()
    
    # Default output location
    output_dir = args.output or str(Path(args.database) / "summaries")
    
    try:
        # Run async main
        overview = asyncio.run(generate_hierarchical_summaries(
            args.database, 
            output_dir,
            merge_existing=not args.no_merge
        ))
        
        print(f"✓ Hierarchical summaries generated:")
        print(f"  Total rooms: {overview['total_rooms']}")
        print(f"  Campuses: {len(overview['campuses'])}")
        print(f"  History policy: keep_all")
        print(f"  Output: {output_dir}")
        sys.exit(0)
    
    except Exception as e:
        print(f"✗ Aggregation failed: {e}", file=sys.stderr)
        logger.error(f"Aggregation failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
