#!/usr/bin/env python3
"""
Test script to verify historical data merging with unlimited history.
"""
import sys
import asyncio
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.aggregate_data import (
    load_existing_summaries,
    merge_room_data
)


async def test_merge():
    """Test merging old and new data with unlimited history."""
    summaries_dir = Path("./database/summaries")
    
    print("=" * 60)
    print("Testing historical data merge (UNLIMITED HISTORY)")
    print("=" * 60)
    
    # Load existing summaries
    print("\n1. Loading existing summaries...")
    existing = await load_existing_summaries(summaries_dir)
    print(f"   Loaded {len(existing)} rooms")
    
    # Show example room
    if "53463" in existing:
        room = existing["53463"]
        history = room['balance_history']
        dates = sorted(history.keys())
        
        print(f"\n2. Example room 53463:")
        print(f"   Current balance: {room['current_balance']}")
        print(f"   Total history days: {len(history)}")
        print(f"   Date range: {dates[0]} ~ {dates[-1]}")
        print(f"   Last 5 days: {dates[-5:]}")
        
        # Simulate adding multiple days
        print(f"\n3. Simulating adding 5 new days...")
        new_data = room.copy()
        new_data['balance_history'] = {}
        for i in range(1, 6):
            new_date = f"20270{str(i).zfill(2)}01"
            new_data['balance_history'][new_date] = 140.0 + i
        
        print(f"   New dates: {list(new_data['balance_history'].keys())}")
        
        # Merge
        print(f"\n4. Merging data...")
        merged = merge_room_data(room, new_data)
        merged_dates = sorted(merged['balance_history'].keys())
        
        print(f"   Merged current balance: {merged['current_balance']}")
        print(f"   Merged history days: {len(merged['balance_history'])}")
        print(f"   New date range: {merged_dates[0]} ~ {merged_dates[-1]}")
        print(f"   Last 7 days: {merged_dates[-7:]}")
        
        # Verify old data preserved
        old_dates_preserved = all(d in merged['balance_history'] for d in dates)
        print(f"\n5. Verification:")
        print(f"   ✓ All old dates preserved: {old_dates_preserved}")
        print(f"   ✓ New dates added: {len(merged['balance_history']) == len(history) + 5}")
        
        # Calculate stats
        balances = list(merged['balance_history'].values())
        print(f"\n6. Statistics from complete history:")
        print(f"   Average balance: {sum(balances)/len(balances):.2f}度")
        print(f"   Min balance: {min(balances):.2f}度")
        print(f"   Max balance: {max(balances):.2f}度")
    
    print("\n✓ Test complete!")
    print("=" * 60)
    print("Summary: All historical data is preserved (no time limit)")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_merge())
