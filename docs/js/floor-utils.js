/**
 * 楼层提取引擎
 * 从房间名中提取楼层号，支持规则解析和手动映射覆盖
 */

const FloorUtils = {
  _floorMap: null,

  async loadFloorMap() {
    if (this._floorMap) return this._floorMap;
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
    if (!roomName) return null;
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

    // 5. 规则: 纯数字房间名
    // 3位数字 "101" → 1层, 4位数字 "1103" → 11层
    if (/^\d+$/.test(roomName)) {
      if (roomName.length === 3) return parseInt(roomName[0]);
      if (roomName.length >= 4) return parseInt(roomName.slice(0, 2));
    }

    // 6. 规则: 带后缀数字房间
    // "321房间" → 截取 "321" → 3层, "105-1" → 截取 "105" → 1层
    const suffixMatch = roomName.match(/^(\d+)(?:-\d+)?(?:房间|厨房|商户)?$/);
    if (suffixMatch) {
      const num = suffixMatch[1];
      if (num.length === 3) return parseInt(num[0]);
      if (num.length >= 4) return parseInt(num.slice(0, 2));
    }

    // 7. 无法识别
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