#!/usr/bin/env python3
"""
Generate split index files for static frontend.
Creates separate files per campus for lazy loading.
"""
import json
import sys
from pathlib import Path
from collections import defaultdict


def scan_database(database_dir: str = "./database"):
    """Scan database directory and build hierarchical index."""
    database_path = Path(database_dir)
    
    if not database_path.exists():
        print(f"Error: Database directory not found: {database_dir}")
        sys.exit(1)
    
    # Build hierarchical structure
    structure = defaultdict(lambda: defaultdict(list))
    
    for campus_dir in database_path.iterdir():
        if not campus_dir.is_dir() or campus_dir.name in ['archives']:
            continue
        
        campus_name = campus_dir.name
        
        for building_dir in campus_dir.iterdir():
            if not building_dir.is_dir():
                continue
            
            building_name = building_dir.name
            
            for room_dir in building_dir.iterdir():
                if not room_dir.is_dir():
                    continue

                dir_name = room_dir.name

                json_files = list(room_dir.glob("*.json"))
                date_count = len(json_files)

                if date_count > 0:
                    structure[campus_name][building_name].append({
                        "n": dir_name,  # room name
                        "p": str(room_dir.relative_to(database_path)),  # path
                        "r": date_count  # records
                    })
    
    return structure


def main():
    """Main entry point."""
    database_dir = "./database"
    output_dir = Path("./docs/data")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Scanning database: {database_dir}")
    structure = scan_database(database_dir)
    
    # Create campus list (small index)
    campus_list = sorted(structure.keys())
    
    campus_index = {
        "campuses": campus_list,
        "version": "1.0"
    }
    
    # Write main index
    index_file = output_dir / "index.json"
    with open(index_file, 'w', encoding='utf-8') as f:
        json.dump(campus_index, f, ensure_ascii=False, indent=2)
    
    print(f"Main index: {index_file} ({index_file.stat().st_size} bytes)")
    
    # Write per-campus files
    for campus_name, buildings in structure.items():
        # Safe filename (replace special chars)
        safe_name = campus_name.replace('/', '-').replace('\\', '-')
        campus_file = output_dir / f"campus_{safe_name}.json"
        
        # Convert to sorted dict
        campus_data = {}
        for building_name, rooms in sorted(buildings.items()):
            campus_data[building_name] = sorted(rooms, key=lambda r: r['n'])
        
        with open(campus_file, 'w', encoding='utf-8') as f:
            json.dump(campus_data, f, ensure_ascii=False, separators=(',', ':'))
        
        room_count = sum(len(rooms) for rooms in buildings.values())
        building_count = len(buildings)
        print(f"  {campus_name}: {building_count} buildings, {room_count} rooms ({campus_file.stat().st_size} bytes)")
    
    # Summary
    total_campuses = len(structure)
    total_buildings = sum(len(buildings) for buildings in structure.values())
    total_rooms = sum(
        len(rooms) 
        for buildings in structure.values() 
        for rooms in buildings.values()
    )
    
    print(f"\nTotal: {total_campuses} campuses, {total_buildings} buildings, {total_rooms} rooms")


if __name__ == "__main__":
    main()
