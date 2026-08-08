/**
 * 楼层聚合计算
 * 在统一房间列表（含 is_noRoom 标记）基础上，按楼层聚合统计
 */

const FloorAnalytics = {
  calculateFloorStats(allRooms, floorGroups) {
    const floors = {};

    Object.entries(floorGroups.groups).forEach(([floor, rooms]) => {
      const floorNum = parseInt(floor);
      const dataRooms = allRooms.filter(r => !r.is_noRoom && rooms.includes(r.roomName));
      const consumptions = dataRooms.map(r => r.consumption);

      floors[floorNum] = {
        withDataCount: dataRooms.length,
        totalCount: rooms.length,
        rooms: rooms,
        totalConsumption: consumptions.reduce((s, v) => s + v, 0),
        avgConsumption: dataRooms.length > 0
          ? consumptions.reduce((s, v) => s + v, 0) / dataRooms.length
          : 0,
        maxConsumption: dataRooms.length > 0 ? Math.max(...consumptions) : 0,
        minConsumption: dataRooms.length > 0 ? Math.min(...consumptions) : 0
      };
    });

    // 处理 unknown 房间
    if (floorGroups.unknown && floorGroups.unknown.length > 0) {
      const uData = allRooms.filter(r => !r.is_noRoom && floorGroups.unknown.includes(r.roomName));
      const uCons = uData.map(r => r.consumption);
      floors.unknown = {
        withDataCount: uData.length,
        totalCount: floorGroups.unknown.length,
        rooms: floorGroups.unknown,
        totalConsumption: uCons.reduce((s, v) => s + v, 0),
        avgConsumption: uData.length > 0 ? uCons.reduce((s, v) => s + v, 0) / uData.length : 0,
        maxConsumption: uData.length > 0 ? Math.max(...uCons) : 0,
        minConsumption: uData.length > 0 ? Math.min(...uCons) : 0
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

  buildDisplayOrder(allRooms, sortDesc) {
    const dataRooms = allRooms.filter(r => !r.is_noRoom);
    const noDataRooms = allRooms.filter(r => r.is_noRoom);
    if (sortDesc) return [...dataRooms, ...noDataRooms];
    return [...dataRooms].reverse().concat(noDataRooms);
  },

  computePageSlices(displayOrder, currentPage, itemsPerPage) {
    const dataRooms = displayOrder.filter(r => !r.is_noRoom);
    const noDataRooms = displayOrder.filter(r => r.is_noRoom);

    const dataPages = Math.ceil(dataRooms.length / itemsPerPage);
    const noDataPages = noDataRooms.length > 0
      ? Math.ceil(noDataRooms.length / itemsPerPage)
      : 0;
    const totalPages = Math.max(1, dataPages + noDataPages);
    const page = Math.max(1, Math.min(currentPage, totalPages));

    let pageRankings = [];
    let pageNoDataRooms = [];

    if (page <= dataPages) {
      const start = (page - 1) * itemsPerPage;
      pageRankings = dataRooms.slice(start, start + itemsPerPage);
    } else {
      const noDataPage = page - dataPages;
      const start = (noDataPage - 1) * itemsPerPage;
      pageNoDataRooms = noDataRooms.slice(start, start + itemsPerPage);
    }

    return { pageRankings, pageNoDataRooms, totalPages };
  },
};
