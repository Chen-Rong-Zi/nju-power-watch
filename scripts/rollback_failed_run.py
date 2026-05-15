#!/usr/bin/env python3
"""
Rollback script for failed daily query runs.
Removes partial results to maintain data consistency.
"""
import json
import sys
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)
logger = logging.getLogger(__name__)


def rollback_partial_results(database_dir: str, date: Optional[str] = None) -> int:
    """
    Remove partial daily data files for specified date (default: today).
    
    Args:
        database_dir: Path to database directory
        date: Date to rollback (YYYYMMDD format), defaults to today
    
    Returns:
        Number of files removed
    """
    if date is None:
        date = datetime.now().strftime("%Y%m%d")
    
    database_path = Path(database_dir)
    if not database_path.exists():
        logger.warning(f"Database directory does not exist: {database_dir}")
        return 0
    
    removed_count = 0
    target_filename = f"{date}.json"
    
    # Walk through all subdirectories
    for json_file in database_path.rglob("*.json"):
        # Only remove files matching target date
        if json_file.name == target_filename:
            try:
                json_file.unlink()
                logger.info(f"Removed partial file: {json_file}")
                removed_count += 1
            except Exception as e:
                logger.error(f"Failed to remove {json_file}: {e}")
    
    logger.info(f"Rollback complete: removed {removed_count} partial files for {date}")
    return removed_count


def main():
    """Main entry point for rollback script."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Rollback partial daily query results")
    parser.add_argument(
        "--database", "-d",
        required=True,
        help="Path to database directory"
    )
    parser.add_argument(
        "--date",
        help="Date to rollback (YYYYMMDD format, default: today)"
    )
    args = parser.parse_args()
    
    try:
        count = rollback_partial_results(args.database, args.date)
        print(f"✓ Rollback complete: {count} files removed")
        sys.exit(0)
    except Exception as e:
        print(f"✗ Rollback failed: {e}", file=sys.stderr)
        logger.error(f"Rollback failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
