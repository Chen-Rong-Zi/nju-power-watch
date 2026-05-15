#!/usr/bin/env python3
"""
Data aggregation script for electricity data.
Generates summary JSON files for frontend consumption.
"""
import json
import sys
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

import pandas as pd
import numpy as np


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)
logger = logging.getLogger(__name__)


def load_room_data(database_dir: str, room_id: str, days: int = 30) -> Optional[pd.DataFrame]:
    """
    Load last N days of data for a specific room.
    
    Args:
        database_dir: Path to database directory
        room_id: Room ID to load data for
        days: Number of days to load (default: 30)
    
    Returns:
        DataFrame with balance data, or None if no data found
    """
    database_path = Path(database_dir)
    
    # Find room directory
    room_dirs = list(database_path.rglob(f"*-{room_id}"))
    if not room_dirs:
        logger.warning(f"No data found for room {room_id}")
        return None
    
    room_dir = room_dirs[0]
    
    # Load JSON files
    records = []
    cutoff_date = datetime.now() - timedelta(days=days)
    
    for json_file in sorted(room_dir.glob("*.json"), reverse=True):
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Skip failed queries
            if not data.get('success', False):
                continue
            
            # Parse date from filename
            date_str = json_file.stem
            record_date = datetime.strptime(date_str, "%Y%m%d")
            
            if record_date < cutoff_date:
                break  # Files are sorted, can stop early
            
            # Extract balance
            balance_str = data.get('剩余电量', '0度')
            balance = float(balance_str.replace('度', ''))
            
            records.append({
                'date': record_date,
                'balance': balance,
                'timestamp': data.get('timestamp'),
                'campus': data.get('校区'),
                'building': data.get('楼栋'),
                'room': data.get('房间')
            })
        
        except Exception as e:
            logger.warning(f"Failed to load {json_file}: {e}")
            continue
    
    if not records:
        return None
    
    df = pd.DataFrame(records)
    df = df.sort_values('date', ascending=False)
    
    return df


def compute_statistics(df: pd.DataFrame, room_id: str, database_dir: str) -> Optional[Dict[str, Any]]:
    """
    Compute statistics for a room.
    
    Args:
        df: DataFrame with balance data
        room_id: Room ID
        database_dir: Database directory (for metadata extraction)
    
    Returns:
        Dictionary with statistics, or None if insufficient data
    """
    if df is None or len(df) == 0:
        return None
    
    # Current balance (most recent)
    current_balance = df.iloc[0]['balance']
    
    # 7-day average
    df_7d = df.head(7)
    avg_7d = df_7d['balance'].mean()
    
    # 30-day statistics
    avg_30d = df['balance'].mean()
    min_30d = df['balance'].min()
    max_30d = df['balance'].max()
    
    # Compute trend (linear regression slope)
    if len(df) >= 2:
        x = np.arange(len(df))
        y = df['balance'].values
        slope, _ = np.polyfit(x, y, 1)
        trend_30d = float(slope)
    else:
        trend_30d = 0.0
    
    # Get metadata from most recent record
    latest = df.iloc[0]
    
    return {
        'campus': latest.get('campus', 'Unknown'),
        'building': latest.get('building', 'Unknown'),
        'room': latest.get('room', 'Unknown'),
        'current_balance': round(current_balance, 2),
        'avg_7d': round(avg_7d, 2),
        'avg_30d': round(avg_30d, 2),
        'trend_30d': round(trend_30d, 4),
        'min_30d': round(min_30d, 2),
        'max_30d': round(max_30d, 2),
        'last_updated': latest.get('timestamp', datetime.now().isoformat())
    }


def generate_summary(database_dir: str, output_file: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate aggregated summary for all rooms.
    
    Args:
        database_dir: Path to database directory
        output_file: Optional path to write summary JSON
    
    Returns:
        Summary dictionary
    """
    database_path = Path(database_dir)
    
    # Find all unique room IDs
    room_ids = set()
    for json_file in database_path.rglob("*.json"):
        # Room ID is in directory name (format: {room_name}-{room_id})
        dir_name = json_file.parent.name
        parts = dir_name.rsplit('-', 1)
        if len(parts) == 2 and parts[1].isdigit():
            room_ids.add(parts[1])
    
    logger.info(f"Found {len(room_ids)} unique rooms")
    
    # Compute statistics for each room
    rooms_stats = {}
    success_count = 0
    total_count = len(room_ids)
    
    for room_id in sorted(room_ids):
        df = load_room_data(database_dir, room_id)
        stats = compute_statistics(df, room_id, database_dir)
        
        if stats:
            rooms_stats[room_id] = stats
            success_count += 1
    
    # Calculate success rate
    success_rate = success_count / total_count if total_count > 0 else 0.0
    
    # Build summary
    summary = {
        'generated_at': datetime.now().isoformat(),
        'total_rooms': len(rooms_stats),
        'query_success_rate': round(success_rate, 2),
        'rooms': rooms_stats
    }
    
    logger.info(f"Generated summary for {len(rooms_stats)} rooms")
    
    # Write to file if specified
    if output_file:
        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        file_size = output_path.stat().st_size
        logger.info(f"Summary written to {output_path} ({file_size} bytes)")
        
        # Validate file size
        if file_size > 500 * 1024:  # 500KB
            logger.warning(f"Summary file size ({file_size} bytes) exceeds 500KB limit")
    
    return summary


def main():
    """Main entry point for aggregation script."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate aggregated summary from daily data")
    parser.add_argument(
        "--database", "-d",
        required=True,
        help="Path to database directory"
    )
    parser.add_argument(
        "--output", "-o",
        required=True,
        help="Path to output summary JSON file"
    )
    args = parser.parse_args()
    
    try:
        summary = generate_summary(args.database, args.output)
        
        file_size = Path(args.output).stat().st_size
        print(f"✓ Summary generated: {summary['total_rooms']} rooms")
        print(f"✓ Output: {args.output} ({file_size} bytes)")
        sys.exit(0)
    
    except Exception as e:
        print(f"✗ Aggregation failed: {e}", file=sys.stderr)
        logger.error(f"Aggregation failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
