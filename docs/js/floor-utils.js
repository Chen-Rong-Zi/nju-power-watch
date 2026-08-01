/**
 * 楼层提取引擎
 * 从房间名中提取楼层号，支持规则解析和手动映射覆盖
 */

const FloorUtils = {
  _floorMap: null,

  async loadFloorMap() {
    try {
      const resp = await fetch('../config/floor_map.json');
      if (!resp.ok) {
        this._floorMap = {};
        return {};
      }
      this._floorMap = await resp.json();
      return this._floorMap;
    } catch (e) {
      this._floorMap = {};
      return {};
    }
  },

  extractFloor(roomName, campus, building, floorMap) {
    const map = floorMap || this._floorMap || {};

    // 1. 检查手动映射
    if (map[campus] && map[campus][building]) {
      const buildingMap = map[campus][building];
      if (buildingMap.manual && buildingMap.manual[roomName] !== undefined) {
        return buildingMap.manual[roomName];
      }
      if (buildingMap.mode === 'manual') {
        return null;
      }
    }

    // 2. 规则: "第X层" 模式
    const floorMatch = roomName.match(/第(\d+)层/);
    if (floorMatch) return parseInt(floorMatch[1]);

    // 3. 规则: 字母后首数字
    const letterNumMatch = roomName.match(/[A-Za-z](\d)/);
    if (letterNumMatch) return parseInt(letterNumMatch[1]);

    // 4. 规则: 中文前缀后首数字
    const chinesePrefixMatch = roomName.match(/^[^\dA-Za-z]+(\d)/);
    if (chinesePrefixMatch) return parseInt(chinesePrefixMatch[1]);

    // 5. 无法识别
    return null;
  },

  groupRoomsByFloor(roomNames, campus, building, floorMap) {
    const groups = {};
    let unknown = [];

    roomNames.forEach(name => {
      const floor = this.extractFloor(name, campus, building, floorMap);
      if (floor !== null) {
        if (!groups[floor]) groups[floor] = [];
        groups[floor].push(name);
      } else {
        unknown.push(name);
      }
    });

    return { groups, unknown };
  }
};