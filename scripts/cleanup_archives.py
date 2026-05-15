#!/usr/bin/env python3
"""
Cleanup and archival script for electricity data.
Archives old daily files and deletes ancient archives.
"""
import json
import sys
import tarfile
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)
logger = logging.getLogger(__name__)


def archive_month(database_dir: str, year: int, month: int, archive_dir: str) -> Path:
    """
    Create tar.gz archive of daily data files for specified month.
    
    Args:
        database_dir: Path to database directory
        year: Year to archive
        month: Month to archive (1-12)
        archive_dir: Path to archives directory
    
    Returns:
        Path to created archive file
    """
    database_path = Path(database_dir)
    archive_path = Path(archive_dir)
    archive_path.mkdir(parents=True, exist_ok=True)
    
    archive_name = f"{year}-{month:02d}.tar.gz"
    archive_file = archive_path / archive_name
    
    # Calculate date range for target month
    month_start = datetime(year, month, 1)
    if month == 12:
        month_end = datetime(year + 1, 1, 1)
    else:
        month_end = datetime(year, month + 1, 1)
    
    logger.info(f"Archiving data for {year}-{month:02d}")
    
    # Collect files to archive
    files_to_archive = []
    for json_file in database_path.rglob("*.json"):
        try:
            # Parse date from filename
            date_str = json_file.stem
            file_date = datetime.strptime(date_str, "%Y%m%d")
            
            if month_start <= file_date < month_end:
                files_to_archive.append(json_file)
        except ValueError:
            # Skip files that don't match date format
            continue
    
    if not files_to_archive:
        logger.warning(f"No files found for {year}-{month:02d}")
        return None
    
    logger.info(f"Found {len(files_to_archive)} files to archive")
    
    # Create archive
    with tarfile.open(archive_file, "w:gz") as tar:
        # Add daily files
        for json_file in files_to_archive:
            arcname = str(json_file.relative_to(database_path))
            tar.add(json_file, arcname=arcname)
        
        # Add manifest
        manifest = {
            "archive_month": f"{year}-{month:02d}",
            "created_at": datetime.now().isoformat(),
            "total_files": len(files_to_archive),
            "total_rooms": len(set(f.parent.name for f in files_to_archive)),
        }
        
        manifest_file = database_path / "manifest.json"
        with open(manifest_file, 'w') as f:
            json.dump(manifest, f, indent=2)
        
        tar.add(manifest_file, arcname="manifest.json")
        manifest_file.unlink()
    
    logger.info(f"Archive created: {archive_file}")
    return archive_file


def verify_archive(archive_path: str) -> bool:
    """
    Verify archive integrity.
    
    Args:
        archive_path: Path to archive file
    
    Returns:
        True if archive is valid
    
    Raises:
        ValueError: If archive is empty or corrupt
    """
    archive_file = Path(archive_path)
    
    if not archive_file.exists():
        raise ValueError(f"Archive not found: {archive_path}")
    
    try:
        with tarfile.open(archive_file, "r:gz") as tar:
            members = tar.getmembers()
            
            if len(members) == 0:
                raise ValueError(f"Archive is empty: {archive_path}")
            
            # Try to read all members
            for member in members:
                if member.isfile():
                    tar.extractfile(member)
            
            logger.info(f"Archive verified: {archive_file} ({len(members)} files)")
            return True
    
    except tarfile.TarError as e:
        raise ValueError(f"Archive is corrupt: {e}")


def delete_old_archives(archive_dir: str, days: int = 365) -> int:
    """
    Delete archives older than specified number of days.
    
    Args:
        archive_dir: Path to archives directory
        days: Number of days to retain (default: 365)
    
    Returns:
        Number of archives deleted
    """
    archive_path = Path(archive_dir)
    if not archive_path.exists():
        logger.warning(f"Archive directory does not exist: {archive_dir}")
        return 0
    
    cutoff_date = datetime.now() - timedelta(days=days)
    deleted_count = 0
    
    for archive_file in archive_path.glob("*.tar.gz"):
        # Get file modification time
        import os
        mtime = datetime.fromtimestamp(archive_file.stat().st_mtime)
        
        if mtime < cutoff_date:
            try:
                archive_file.unlink()
                logger.info(f"Deleted old archive: {archive_file}")
                deleted_count += 1
            except Exception as e:
                logger.error(f"Failed to delete {archive_file}: {e}")
    
    logger.info(f"Deleted {deleted_count} archives older than {days} days")
    return deleted_count


def main():
    """Main entry point for cleanup script."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Archive old daily data and delete ancient archives")
    parser.add_argument(
        "--database", "-d",
        required=True,
        help="Path to database directory"
    )
    parser.add_argument(
        "--archive-dir", "-a",
        required=True,
        help="Path to archives directory"
    )
    parser.add_argument(
        "--days-to-keep",
        type=int,
        default=30,
        help="Days to keep daily files before archiving (default: 30)"
    )
    parser.add_argument(
        "--archive-retention",
        type=int,
        default=365,
        help="Days to keep archives before deletion (default: 365)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )
    args = parser.parse_args()
    
    try:
        # Calculate which months to archive
        cutoff_date = datetime.now() - timedelta(days=args.days_to_keep)
        
        # Archive previous months
        archived_count = 0
        current_date = cutoff_date.replace(day=1)
        
        while current_date < datetime.now().replace(day=1):
            if not args.dry_run:
                archive_file = archive_month(
                    args.database,
                    current_date.year,
                    current_date.month,
                    args.archive_dir
                )
                if archive_file:
                    # Verify archive
                    verify_archive(str(archive_file))
                    archived_count += 1
            else:
                logger.info(f"[DRY RUN] Would archive {current_date.year}-{current_date.month:02d}")
            
            # Move to next month
            if current_date.month == 12:
                current_date = current_date.replace(year=current_date.year + 1, month=1)
            else:
                current_date = current_date.replace(month=current_date.month + 1)
        
        # Delete old archives
        if not args.dry_run:
            deleted_count = delete_old_archives(args.archive_dir, args.archive_retention)
        else:
            logger.info(f"[DRY RUN] Would delete archives older than {args.archive_retention} days")
        
        print(f"✓ Cleanup complete: {archived_count} months archived")
        sys.exit(0)
    
    except Exception as e:
        print(f"✗ Cleanup failed: {e}", file=sys.stderr)
        logger.error(f"Cleanup failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
