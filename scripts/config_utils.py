"""Type-safe room ID mapping utilities.

config/room_ids.json structure:
    {campus: {building: {room_name: id_str}}}
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TypeAlias

RoomIdMapping: TypeAlias = dict[str, str]
"""{room_name: id}"""

BuildingMapping: TypeAlias = dict[str, RoomIdMapping]
"""{building_name: {room_name: id}}"""

CampusMapping: TypeAlias = dict[str, BuildingMapping]
"""{campus_name: {building_name: {room_name: id}}}"""


def load_mapping(path: str | Path) -> CampusMapping:
    """Load room ID mapping from JSON file.

    Returns empty dict if file does not exist or is invalid.
    """
    p = Path(path)
    if not p.exists():
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            result: CampusMapping = json.load(f)
            return result
    except (json.JSONDecodeError, OSError):
        return {}


def save_mapping(mapping: CampusMapping, path: str | Path) -> None:
    """Save room ID mapping to JSON file."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)


def extract_ids(mapping: CampusMapping) -> list[str]:
    """Extract all current IDs as a flat sorted list."""
    ids: list[str] = []
    for buildings in mapping.values():
        for rooms in buildings.values():
            ids.extend(rooms.values())
    return sorted(set(ids))


def is_room_known(mapping: CampusMapping, campus: str, building: str, room_name: str) -> bool:
    """Check if a room (by campus+building+room_name) exists in the mapping."""
    bldg = mapping.get(campus, {}).get(building)
    return bldg is not None and room_name in bldg


def update_id(mapping: CampusMapping, campus: str, building: str, room_name: str, new_id: str) -> bool:
    """Add or update a room's ID.

    Returns True if a NEW room entry was created.
    Returns False if an existing entry was updated (ID replaced).
    """
    is_new = not is_room_known(mapping, campus, building, room_name)
    bldg = mapping.setdefault(campus, {}).setdefault(building, {})
    bldg[room_name] = new_id
    return is_new
