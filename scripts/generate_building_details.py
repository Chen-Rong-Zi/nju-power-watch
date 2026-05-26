#!/usr/bin/env python3
"""
Generate details.json files for each building.

This script reads existing room JSON files from the summaries directory
and creates a single details.json per building that contains all rooms' data.
This optimizes campus view loading by reducing N room requests to 1 building request.

Usage:
    python scripts/generate_building_details.py --summaries ./docs/database/summaries

The script should be run AFTER aggregate_data.py in the GitHub Action workflow.
"""
import json
import sys
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any
import asyncio
import aiofiles

# Limit concurrent file operations to avoid "Too many open files" (Errno 24)
_FILE_SEMAPHORE = asyncio.Semaphore(50)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)
logger = logging.getLogger(__name__)


async def read_json_file(file_path: Path) -> Dict[str, Any]:
    """Asynchronously read and parse JSON file."""
    try:
        async with _FILE_SEMAPHORE:
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


async def process_building(building_dir: Path) -> Dict[str, Any]:
    """
    Process a single building directory.
    Reads room list from summary.json and loads corresponding room JSON files.
    """
    # Read building summary for metadata and room list
    summary_file = building_dir / "summary.json"
    summary = await read_json_file(summary_file)
    if not summary:
        return None

    building_name = summary.get('building', building_dir.name)
    campus_name = summary.get('campus', '')
    rooms_list = summary.get('rooms', {})

    if not rooms_list:
        return None

    # Read room files based on room IDs from summary.json
    rooms_dir = building_dir / "rooms"
    rooms = {}

    async def read_room_file(room_id: str) -> tuple:
        room_file = rooms_dir / f"{room_id}.json"
        room_data = await read_json_file(room_file)
        return room_id, room_data

    tasks = [read_room_file(room_id) for room_id in rooms_list.keys()]
    results = await asyncio.gather(*tasks)

    for room_id, room_data in results:
        if room_data and 'room_id' in room_data:
            rooms[room_id] = room_data

    if not rooms:
        return None

    # Create details.json content
    details = {
        'building': building_name,
        'campus': campus_name,
        'total_rooms': len(rooms),
        'rooms': rooms
    }

    # Write details.json
    details_file = building_dir / "details.json"
    await write_json_file(details_file, details)

    return {
        'building': building_name,
        'campus': campus_name,
        'rooms': len(rooms),
        'file_size': details_file.stat().st_size if details_file.exists() else 0
    }


async def generate_all_details(summaries_dir: Path) -> Dict[str, Any]:
    """
    Generate details.json for all buildings in the summaries directory.
    """
    campuses_dir = summaries_dir / "campuses"
    if not campuses_dir.exists():
        logger.error(f"Campuses directory not found: {campuses_dir}")
        return None

    # Find all building directories
    building_dirs = []
    for campus_dir in campuses_dir.iterdir():
        if not campus_dir.is_dir():
            continue
        buildings_dir = campus_dir / "buildings"
        if not buildings_dir.exists():
            continue
        for building_dir in buildings_dir.iterdir():
            if building_dir.is_dir():
                building_dirs.append(building_dir)

    logger.info(f"Found {len(building_dirs)} building directories")

    if not building_dirs:
        return None

    # Process all buildings concurrently (with limited concurrency via chunking)
    chunk_size = 20
    results = []

    for i in range(0, len(building_dirs), chunk_size):
        chunk = building_dirs[i:i + chunk_size]
        chunk_results = await asyncio.gather(*[process_building(bd) for bd in chunk])
        results.extend(chunk_results)
        logger.info(f"Processed {min(i + chunk_size, len(building_dirs))}/{len(building_dirs)} buildings")

    # Filter out None results and compute statistics
    successful = [r for r in results if r is not None]
    total_rooms = sum(r['rooms'] for r in successful)
    total_size = sum(r['file_size'] for r in successful)

    stats = {
        'generated_at': datetime.now().isoformat(),
        'buildings_processed': len(successful),
        'total_rooms': total_rooms,
        'total_size_bytes': total_size,
        'total_size_mb': round(total_size / (1024 * 1024), 2)
    }

    return stats


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate details.json files for campus view optimization"
    )
    parser.add_argument(
        "--summaries", "-s",
        required=True,
        help="Path to summaries directory (e.g., ./docs/database/summaries)"
    )
    args = parser.parse_args()

    summaries_path = Path(args.summaries)
    if not summaries_path.exists():
        print(f"✗ Summaries directory not found: {summaries_path}", file=sys.stderr)
        sys.exit(1)

    try:
        stats = asyncio.run(generate_all_details(summaries_path))

        if stats:
            print(f"✓ Building details generated:")
            print(f"  Buildings processed: {stats['buildings_processed']}")
            print(f"  Total rooms: {stats['total_rooms']}")
            print(f"  Total size: {stats['total_size_mb']} MB")
            sys.exit(0)
        else:
            print("✗ No buildings processed", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"✗ Generation failed: {e}", file=sys.stderr)
        logger.error(f"Generation failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
