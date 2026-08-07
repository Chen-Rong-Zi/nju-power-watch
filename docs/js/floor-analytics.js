/**
 * 楼层聚合计算
 * 在排行榜数据基础上，按楼层聚合统计
 */

const FloorAnalytics = {
  calculateFloorStats(rankings, floorGroups) {
    const floors = {};

    Object.entries(floorGroups.groups).forEach(([floor, rooms]) => {
      const floorNum = parseInt(floor);
      const floorRankings = rankings.filter(r => rooms.includes(r.roomName));

      if (floorRankings.length === 0) {
        floors[floorNum] = {
          roomCount: rooms.length,
          rooms: rooms,
          totalConsumption: 0,
          avgConsumption: 0,
          maxConsumption: 0,
          minConsumption: 0
        };
        return;
      }

      const consumptions = floorRankings.map(r => r.consumption);
      const total = consumptions.reduce((s, v) => s + v, 0);

      floors[floorNum] = {
        roomCount: floorRankings.length,
        rooms: rooms,
        totalConsumption: total,
        avgConsumption: total / floorRankings.length,
        maxConsumption: Math.max(...consumptions),
        minConsumption: Math.min(...consumptions)
      };
    });

    // 处理 unknown 房间
    if (floorGroups.unknown && floorGroups.unknown.length > 0) {
      const unknownRankings = rankings.filter(r => floorGroups.unknown.includes(r.roomName));
      floors.unknown = {
        roomCount: floorGroups.unknown.length,
        rooms: floorGroups.unknown,
        totalConsumption: unknownRankings.reduce((s, r) => s + r.consumption, 0),
        avgConsumption: unknownRankings.length > 0
          ? unknownRankings.reduce((s, r) => s + r.consumption, 0) / unknownRankings.length
          : 0,
        maxConsumption: unknownRankings.length > 0 ? Math.max(...unknownRankings.map(r => r.consumption)) : 0,
        minConsumption: unknownRankings.length > 0 ? Math.min(...unknownRankings.map(r => r.consumption)) : 0
      };
    }

    // 排序楼层号
    const sortedFloors = Object.keys(floors)
      .filter(k => k !== 'unknown')
      .map(Number)
      .sort((a, b) => a - b);

    if (floors.unknown) sortedFloors.push('unknown');

    return { floors, sortedFloors };
  },

  filterRoomsByFloors(rooms, floorGroups, selectedFloors) {
    if (selectedFloors === null) return rooms;

    const allowedRooms = new Set();
    selectedFloors.forEach(floor => {
      if (floor === 'unknown') {
        floorGroups.unknown.forEach(r => allowedRooms.add(r));
      } else if (floorGroups.groups[floor]) {
        floorGroups.groups[floor].forEach(r => allowedRooms.add(r));
      }
    });

    return rooms.filter(r => allowedRooms.has(r.roomName));
  },

  getFilteredRankings(rankings, floorGroups, selectedFloors) {
    return FloorAnalytics.filterRoomsByFloors(rankings, floorGroups, selectedFloors);
  },

  computePageSlices(displayRankings, noDataRooms, currentPage, itemsPerPage) {
    const dataPages = Math.ceil(displayRankings.length / itemsPerPage);
    const noDataPages = noDataRooms.length > 0
      ? Math.ceil(noDataRooms.length / itemsPerPage)
      : 0;
    const totalPages = Math.max(1, dataPages + noDataPages);
    const page = Math.max(1, Math.min(currentPage, totalPages));

    let pageRankings = [];
    let pageNoDataRooms = [];

    if (page <= dataPages) {
      const start = (page - 1) * itemsPerPage;
      pageRankings = displayRankings.slice(start, start + itemsPerPage);
    } else {
      const noDataPage = page - dataPages;
      const start = (noDataPage - 1) * itemsPerPage;
      pageNoDataRooms = noDataRooms.slice(start, start + itemsPerPage);
    }

    return { pageRankings, pageNoDataRooms, totalPages };
  },
};