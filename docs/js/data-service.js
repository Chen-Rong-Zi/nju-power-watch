/**
 * 电费数据服务模块
 * 从本地数据库文件夹获取真实数据
 *
 * 数据结构：
 * - ./database/summaries/overview.json - 总览数据
 * - ./database/summaries/campuses/校区名/summary.json - 校区汇总
 * - ./database/summaries/campuses/校区名/buildings/楼栋名/summary.json - 楼栋汇总
 * - ./database/summaries/campuses/校区名/buildings/楼栋名/rooms/宿舍ID.json - 房间历史
 * - ./database/校区/楼栋/房间名-宿舍ID/日期.json - 每日详细数据
 */

const DataService = {
  // 数据库路径（相对路径）
  SUMMARIES_PATH: './database/summaries',
  DATABASE_PATH: './database',

  // 内存缓存
  _overviewCache: null,
  _campusCache: new Map(),
  _buildingCache: new Map(),
  _roomCache: new Map(),

  // localStorage 缓存键前缀
  CACHE_PREFIX: '',
  CACHE_VERSION: 'v2',

  /**
   * ==================== 缓存层键值对格式设计 ====================
   *
   * 1. 排序结果缓存：
   *    键: `{校区}.{楼栋}.耗电排序`
   *    值: {
   *      '20250127': [
   *        { roomId, roomName, consumption, balance, rank },
   *        ...
   *      ],
   *      '20250128': [...]
   *    }
   *
   * 2. 房间耗电量缓存：
   *    键: `{校区}.{楼栋}.{房间名}`
   *    值: {
   *      '20250127': { electricity: 45.2, consumption: 3.5 },
   *      '20250128': { electricity: 48.7, consumption: 2.8 },
   *      ...
   *    }
   *
   * 3. 楼栋房间列表缓存：
   *    键: `{校区}.{楼栋}.房间列表`
   *    值: {
   *      '房间ID': { name: '101', room_name: '4A211', current_balance: 45.2, last_updated: '...' },
   *      ...
   *    }
   */

  /**
   * 生成缓存键
   */
  _getCacheKey(type, ...parts) {
    // 新格式：直接使用中文键名
    if (type === 'ranking') {
      // {校区}.{楼栋}.耗电排序
      return `${parts[0]}.${parts[1]}.耗电排序`;
    } else if (type === 'room') {
      // {校区}.{楼栋}.{房间名}
      return `${parts[0]}.${parts[1]}.${parts[2]}`;
    } else if (type === 'rooms') {
      // {校区}.{楼栋}.房间列表
      return `${parts[0]}.${parts[1]}.房间列表`;
    } else if (type === 'campus') {
      // {校区}.校区耗电
      return `${parts[0]}.校区耗电`;
    }
    return `${this.CACHE_PREFIX}${type}_${parts.join('.')}`;
  },

  /**
   * 格式化日期为 YYYYMMDD 格式
   * @param {string} date 日期字符串，如 '2025-01-27' 或 '20250127'
   */
  _formatDateCompact(date) {
    if (!date) return '';
    // 如果是相对日期，先转换为具体日期
    if (date === 'today' || date === 'yesterday' || date === 'week') {
      const now = new Date();
      if (date === 'today') {
        return this._dateToCompact(now);
      } else if (date === 'yesterday') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return this._dateToCompact(yesterday);
      } else if (date === 'week') {
        // 周平均使用特殊键 'week_YYYYMMDD'，包含当天日期以区分不同周
        return 'week_' + this._dateToCompact(now);
      }
    }
    // 如果已经是 YYYYMMDD 格式，直接返回
    if (/^\d{8}$/.test(date)) return date;
    // 如果是 YYYY-MM-DD 格式，转换为 YYYYMMDD
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date.replace(/-/g, '');
    }
    return date;
  },

  /**
   * 将Date对象转换为YYYYMMDD格式
   */
  _dateToCompact(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  },

  /**
   * 格式化日期为 YYYY-MM-DD 格式
   * @param {string} date 日期字符串，如 '20250127' 或 '2025-01-27'
   */
  formatDate(date) {
    if (!date) return '';
    // 如果已经是 YYYY-MM-DD 格式，直接返回
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    // 如果是 YYYYMMDD 格式，转换为 YYYY-MM-DD
    if (/^\d{8}$/.test(date)) {
      return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    }
    return date;
  },

  /**
   * 初始化 IndexedDB 数据库
   */
  async initDB() {
    await IDB.init();
    this._dbReady = true;
  },

  /**
   * 清除所有缓存
   */
  async clearAllCache() {
    await IDB.clear();

    // 清除内存缓存
    this._overviewCache = null;
    this._campusCache.clear();
    this._buildingCache.clear();
    this._roomCache.clear();
    console.log('[DataService] 所有缓存已清除');
  },

  /**
   * 获取缓存统计信息
   */
  async getCacheStats() {
    return await IDB.getStats();
  },

  /**
   * 获取总览数据
   */
  async getOverview() {
    if (this._overviewCache) return this._overviewCache;

    try {
      const response = await fetch(`${this.SUMMARIES_PATH}/overview.json`);
      const data = await response.json();
      this._overviewCache = data;
      return data;
    } catch (error) {
      console.error('获取总览数据失败:', error);
      return null;
    }
  },

  /**
   * 获取校区列表
   */
  async getCampuses() {
    const overview = await this.getOverview();
    if (overview && overview.campuses) {
      return Object.keys(overview.campuses);
    }
    return ['仙林校区', '浦口校区', '苏州校区', '鼓楼校区'];
  },

  /**
   * 获取校区汇总数据
   */
  async getCampusSummary(campusName) {
    if (this._campusCache.has(campusName)) {
      return this._campusCache.get(campusName);
    }

    try {
      const response = await fetch(
        `${this.SUMMARIES_PATH}/campuses/${encodeURIComponent(campusName)}/summary.json`
      );
      const data = await response.json();
      this._campusCache.set(campusName, data);
      return data;
    } catch (error) {
      console.error(`获取${campusName}汇总数据失败:`, error);
      return null;
    }
  },

  /**
   * 获取楼栋列表（从校区汇总）
   */
  async getBuildings(campusName) {
    const campusSummary = await this.getCampusSummary(campusName);
    if (campusSummary && campusSummary.buildings) {
      return Object.keys(campusSummary.buildings).map(name => ({
        name,
        ...campusSummary.buildings[name]
      }));
    }
    return [];
  },

  /**
   * 获取楼栋汇总数据
   */
  async getBuildingSummary(campusName, buildingName) {
    const cacheKey = `${campusName}/${buildingName}`;
    if (this._buildingCache.has(cacheKey)) {
      return this._buildingCache.get(cacheKey);
    }

    try {
      const response = await fetch(
        `${this.SUMMARIES_PATH}/campuses/${encodeURIComponent(campusName)}/buildings/${encodeURIComponent(buildingName)}/summary.json`
      );
      const data = await response.json();
      this._buildingCache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`获取${campusName}/${buildingName}汇总数据失败:`, error);
      return null;
    }
  },

  /**
   * 获取楼栋详情数据（包含所有房间的完整历史）
   * 用于校区视角快速计算耗电量，避免请求大量单独房间文件
   * @returns {Object|null} { building, campus, total_rooms, rooms: { roomId: { room_id, room_name, ... } } }
   */
  async getBuildingDetails(campusName, buildingName) {
    const cacheKey = `details:${campusName}/${buildingName}`;
    if (this._buildingCache.has(cacheKey)) {
      return this._buildingCache.get(cacheKey);
    }

    try {
      const response = await fetch(
        `${this.SUMMARIES_PATH}/campuses/${encodeURIComponent(campusName)}/buildings/${encodeURIComponent(buildingName)}/details.json`
      );
      if (!response.ok) {
        console.log(`[详情文件不存在] ${campusName}/${buildingName}/details.json，将使用单独房间文件`);
        return null;
      }
      const data = await response.json();
      this._buildingCache.set(cacheKey, data);
      console.log(`[详情加载成功] ${campusName}/${buildingName}，共 ${data.total_rooms} 个房间`);
      return data;
    } catch (error) {
      console.warn(`获取${campusName}/${buildingName}详情数据失败:`, error);
      return null;
    }
  },

  /**
   * 获取房间列表（从楼栋汇总）
   */
  async getRooms(campusName, buildingName) {
    const buildingSummary = await this.getBuildingSummary(campusName, buildingName);
    if (buildingSummary && buildingSummary.rooms) {
      return Object.entries(buildingSummary.rooms).map(([id, data]) => ({
        id,
        name: data.room_name,
        currentBalance: data.current_balance,
        lastUpdated: data.last_updated
      }));
    }
    return [];
  },

  /**
   * 获取房间历史数据（从汇总文件）
   */
  async getRoomHistory(campusName, buildingName, roomId) {
    const cacheKey = `${campusName}/${buildingName}/${roomId}`;
    if (this._roomCache.has(cacheKey)) {
      return this._roomCache.get(cacheKey);
    }

    try {
      const response = await fetch(
        `${this.SUMMARIES_PATH}/campuses/${encodeURIComponent(campusName)}/buildings/${encodeURIComponent(buildingName)}/rooms/${roomId}.json`
      );
      const data = await response.json();

      // 转换历史数据为数组格式
      const history = [];
      if (data.balance_history) {
        for (const [date, balance] of Object.entries(data.balance_history)) {
          history.push({
            date,
            electricity: balance,
            formattedDate: this.formatDate(date)
          });
        }
        // 按日期排序
        history.sort((a, b) => a.date.localeCompare(b.date));

        // 计算每日消耗
        for (let i = 1; i < history.length; i++) {
          const prev = history[i - 1];
          const curr = history[i];
          curr.consumption = Math.max(0, prev.electricity - curr.electricity);
        }
      }

      const result = {
        ...data,
        history,
        dailyConsumption: history.length > 1 ?
          history[history.length - 1].consumption : 0,
        avgConsumption: this.calculateAvgConsumption(history)
      };

      this._roomCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('获取房间历史数据失败:', error);
      return null;
    }
  },

  /**
   * 获取特定日期的消耗数据
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} roomId 房间ID
   * @param {string} dateType 日期类型: 'today', 'yesterday', 'week', 或具体日期(YYYY-MM-DD)
   */
  async getConsumptionByDate(campusName, buildingName, roomId, dateType) {
    const history = await this.getRoomHistory(campusName, buildingName, roomId);
    if (!history || !history.history || history.history.length === 0) {
      return 0;
    }

    const hist = history.history;

    if (dateType === 'today') {
      return hist[hist.length - 1]?.consumption || 0;
    } else if (dateType === 'yesterday') {
      return hist[hist.length - 2]?.consumption || 0;
    } else if (dateType === 'week') {
      const weekData = hist.slice(-7);
      return weekData.reduce((sum, h) => sum + (h.consumption || 0), 0) / 7;
    } else {
      // 特定日期 (YYYY-MM-DD 或 YYYYMMDD)
      const targetDate = dateType.includes('-') ? dateType.replace(/-/g, '') : dateType;
      const found = hist.find(h => h.date === targetDate || h.formattedDate === dateType);
      return found?.consumption || 0;
    }
  },

  /**
   * 计算平均日消耗
   */
  calculateAvgConsumption(history) {
    if (history.length < 2) return 0;

    const consumptions = history.slice(1).map(h => h.consumption).filter(c => c > 0);
    if (consumptions.length === 0) return 0;

    return consumptions.reduce((a, b) => a + b, 0) / consumptions.length;
  },

  /**
   * 格式化日期
   */
  formatDate(dateStr) {
    // 20260515 -> 2026-05-15
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  },

  /**
   * 请求池模式 - 维护固定数量的并发请求
   * 当一个请求完成时，立即开始下一个请求
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string[]} roomIds 房间ID列表
   * @param {Function} onRoomLoaded 单个房间加载完成回调 (roomId, roomData, loaded, total)
   * @param {number} poolSize 请求池大小（默认100）
   */
  async poolRoomHistory(campusName, buildingName, roomIds, onRoomLoaded, poolSize = 100) {
    let loaded = 0;
    const total = roomIds.length;
    let currentIndex = 0;
    const activeRequests = new Set();

    // 处理单个房间的请求
    const processRoom = async (roomId) => {
      const cacheKey = `${campusName}/${buildingName}/${roomId}`;

      // 检查缓存
      if (this._roomCache.has(cacheKey)) {
        const data = this._roomCache.get(cacheKey);
        loaded++;
        onRoomLoaded(roomId, data, loaded, total);
        return { roomId, data };
      }

      try {
        const response = await fetch(
          `${this.SUMMARIES_PATH}/campuses/${encodeURIComponent(campusName)}/buildings/${encodeURIComponent(buildingName)}/rooms/${roomId}.json`
        );
        const rawData = await response.json();

        // 转换历史数据
        const history = [];
        if (rawData.balance_history) {
          for (const [date, balance] of Object.entries(rawData.balance_history)) {
            history.push({
              date,
              electricity: balance,
              formattedDate: this.formatDate(date)
            });
          }
          history.sort((a, b) => a.date.localeCompare(b.date));

          // 计算每日消耗
          for (let j = 1; j < history.length; j++) {
            const prev = history[j - 1];
            const curr = history[j];
            curr.consumption = Math.max(0, prev.electricity - curr.electricity);
          }
        }

        const data = {
          ...rawData,
          history,
          dailyConsumption: history.length > 1 ? history[history.length - 1].consumption : 0,
          avgConsumption: this.calculateAvgConsumption(history)
        };

        this._roomCache.set(cacheKey, data);
        loaded++;
        onRoomLoaded(roomId, data, loaded, total);

        return { roomId, data };
      } catch (error) {
        loaded++;
        onRoomLoaded(roomId, null, loaded, total);
        return { roomId, data: null, error };
      }
    };

    // 启动一个工作请求
    const startNext = async () => {
      if (currentIndex >= total) return null;

      const roomIndex = currentIndex++;
      const roomId = roomIds[roomIndex];

      const promise = processRoom(roomId);
      activeRequests.add(promise);

      const result = await promise;
      activeRequests.delete(promise);

      // 当前请求完成后，立即启动下一个
      if (currentIndex < total) {
        startNext();
      }

      return result;
    };

    // 初始化：启动 poolSize 个并发请求
    const initialCount = Math.min(poolSize, total);
    for (let i = 0; i < initialCount; i++) {
      startNext();
    }

    // 等待所有请求完成
    while (loaded < total) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  },

  /**
   * 流式获取房间历史数据 - 每获取一个房间就立即回调
   * 支持实时计算和排序动画
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string[]} roomIds 房间ID列表
   * @param {Function} onRoomLoaded 单个房间加载完成回调 (roomId, roomData)
   * @param {number} concurrency 并发数（默认10）
   */
  async streamRoomHistory(campusName, buildingName, roomIds, onRoomLoaded, concurrency = 100) {
    // 使用请求池模式，更高效
    return this.poolRoomHistory(campusName, buildingName, roomIds, onRoomLoaded, concurrency);
  },

  /**
   * 批量获取房间历史数据（请求池模式，更高效）
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string[]} roomIds 房间ID列表
   * @param {number} poolSize 请求池大小（默认100）
   * @param {Function} onProgress 进度回调 (loaded, total)
   */
  async batchGetRoomHistory(campusName, buildingName, roomIds, poolSize = 100, onProgress = null) {
    const results = new Map();

    // 使用请求池模式获取数据
    await this.poolRoomHistory(
      campusName,
      buildingName,
      roomIds,
      (roomId, data, loaded, total) => {
        if (data) results.set(roomId, data);
        if (onProgress) onProgress(loaded, total);
      },
      poolSize
    );

    return results;
  },

  /**
   * 快速获取楼栋耗电量排行（缓存优先 + 请求池优化版）
   * 1. 先检查缓存中是否有该日期的排序结果
   * 2. 如果有缓存，直接返回
   * 3. 如果没有缓存，获取数据后计算并保存到缓存
   */
  async getBuildingConsumptionRankingFast(campusName, buildingName, date = null, onProgress = null, forceRefresh = false) {
    // 确定日期
    const targetDate = date || new Date().toISOString().slice(0, 10);

    // 检查缓存
    if (!forceRefresh) {
      const cached = await this.getRankingCache(campusName, buildingName, targetDate);
      if (cached) {
        console.log(`[缓存命中] 使用缓存的排序结果`);
        if (onProgress) onProgress(1, 1); // 立即完成进度
        return cached;
      }
    }

    const buildingSummary = await this.getBuildingSummary(campusName, buildingName);
    if (!buildingSummary || !buildingSummary.rooms) return [];

    const roomIds = Object.keys(buildingSummary.rooms);
    const roomMap = buildingSummary.rooms;

    // 使用请求池模式批量获取房间数据（100并发）
    const roomDataMap = await this.batchGetRoomHistory(
      campusName,
      buildingName,
      roomIds,
      100, // 请求池大小
      onProgress
    );

    // 批量保存房间耗电量到缓存
    await this.batchSaveRoomConsumptionCache(campusName, buildingName, roomDataMap);

    // 格式化目标日期
    const targetCompactDate = this._formatDateCompact(targetDate);

    // 构建排行数据
    const rankings = [];
    for (const roomId of roomIds) {
      const roomInfo = roomMap[roomId];
      const roomData = roomDataMap.get(roomId);

      if (roomData && roomData.history && roomData.history.length > 0) {
        // 尝试从历史中找到指定日期的消耗
        const targetEntry = roomData.history.find(h =>
          h.date === targetCompactDate || h.formattedDate === targetDate
        );

        // 如果找到指定日期则用该日期，否则用最新一天
        const entry = targetEntry || roomData.history[roomData.history.length - 1];

        rankings.push({
          roomId,
          roomName: roomInfo.room_name,
          consumption: entry?.consumption || 0,
          balance: entry?.electricity || roomInfo.current_balance
          // 注意：不再保存 campus、building、history 等冗余字段
          // campus/building 可从缓存键推断，history 在点击详情时会重新请求
        });
      }
    }

    // 保存排序结果到缓存
    await this.saveRankingCache(campusName, buildingName, targetDate, rankings);

    return rankings;
  },

  /**
   * 从房间消耗缓存构建楼栋排名（避免重复请求）
   * 如果指定日期没有缓存，使用最近的可用日期
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} date 日期
   * @returns {Object|null} 排名数据或 null
   */
  async getBuildingConsumptionFromRoomCache(campusName, buildingName, date) {
    const compactDate = this._formatDateCompact(date);

    // 获取楼栋房间列表
    const buildingSummary = await this.getBuildingSummary(campusName, buildingName);
    if (!buildingSummary || !buildingSummary.rooms) return null;

    const roomMap = buildingSummary.rooms;
    const roomIds = Object.keys(roomMap);

    // 尝试从房间缓存读取每个房间的指定日期消耗
    const rankings = [];
    let cachedCount = 0;
    let usedDate = compactDate;

    for (const roomId of roomIds) {
      const roomInfo = roomMap[roomId];
      let roomCache = await this.getRoomConsumptionCache(campusName, buildingName, roomId, compactDate);

      // 如果指定日期没有缓存，尝试获取该房间最新的可用日期
      if (!roomCache || roomCache.consumption === undefined) {
        const allRoomCache = await this.getRoomConsumptionCache(campusName, buildingName, roomId);
        if (allRoomCache) {
          // 找到最新的可用日期
          const dates = Object.keys(allRoomCache).sort().reverse();
          if (dates.length > 0) {
            const latestDate = dates[0];
            roomCache = allRoomCache[latestDate];
            usedDate = latestDate; // 记录实际使用的日期
          }
        }
      }

      if (roomCache && roomCache.consumption !== undefined) {
        rankings.push({
          roomId,
          roomName: roomInfo.room_name,
          consumption: roomCache.consumption,
          balance: roomCache.electricity
        });
        cachedCount++;
      }
    }

    // 如果没有任何缓存数据，返回 null
    if (cachedCount === 0) {
      return null;
    }

    console.log(`[缓存构建] ${campusName}.${buildingName}: ${cachedCount}/${roomIds.length} 间从缓存读取 (请求:${compactDate}, 实际:${usedDate})`);

    // 保存到排名缓存以便下次更快访问（使用请求的日期作为键）
    await this.saveRankingCache(campusName, buildingName, date, rankings);

    return {
      data: rankings,
      totalConsumption: rankings.reduce((sum, r) => sum + r.consumption, 0),
      roomCount: rankings.length,
      usedDate: usedDate
    };
  },

  /**
   * 获取楼栋耗电量排行
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} date 日期（可选，格式：20260515）
   */
  async getBuildingConsumptionRanking(campusName, buildingName, date = null) {
    const rooms = await this.getRooms(campusName, buildingName);
    const rankings = [];

    // 获取每个房间的历史数据以计算消耗
    for (const room of rooms) {
      const history = await this.getRoomHistory(campusName, buildingName, room.id);
      if (history && history.history) {
        // 找到最近一天的消耗
        const lastEntry = history.history[history.history.length - 1];
        rankings.push({
          roomId: room.id,
          roomName: room.name,
          consumption: lastEntry?.consumption || 0,
          balance: room.currentBalance,
          avgConsumption: history.avgConsumption
        });
      }
    }

    // 按消耗量排序（降序）
    rankings.sort((a, b) => b.consumption - a.consumption);

    // 添加排名
    rankings.forEach((r, i) => r.rank = i + 1);

    return rankings;
  },

  /**
   * 获取校区统计数据
   */
  async getCampusStatistics(campusName) {
    const campusSummary = await this.getCampusSummary(campusName);
    if (!campusSummary) return null;

    const buildings = campusSummary.buildings || {};
    let totalRooms = 0;
    let totalAvgBalance = 0;
    let buildingCount = 0;

    for (const [name, data] of Object.entries(buildings)) {
      totalRooms += data.total_rooms || 0;
      totalAvgBalance += data.avg_balance || 0;
      buildingCount++;
    }

    return {
      campus: campusName,
      buildings: buildingCount,
      rooms: totalRooms,
      avgBalance: buildingCount > 0 ? (totalAvgBalance / buildingCount).toFixed(2) : 0,
      buildingDetails: Object.entries(buildings).map(([name, data]) => ({
        name,
        ...data
      }))
    };
  },

  /**
   * 获取所有校区统计数据
   */
  async getAllCampusStatistics() {
    const overview = await this.getOverview();
    if (!overview) return [];

    const results = [];
    for (const [campusName, data] of Object.entries(overview.campuses || {})) {
      results.push({
        name: campusName,
        ...data
      });
    }
    return results;
  },

  /**
   * 用户配置管理
   */
  getUserConfig() {
    const stored = localStorage.getItem('electricity_user_config');
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  },

  setUserConfig(config) {
    localStorage.setItem('electricity_user_config', JSON.stringify(config));
  },

  clearUserConfig() {
    localStorage.removeItem('electricity_user_config');
  },

  /**
   * 耗电量直观描述
   * 根据消耗度数返回各种类比描述
   */
  getConsumptionDescriptions(kwh) {
    if (!kwh || kwh <= 0) return [];

    const descriptions = [];

    // 1. 烧开水量（约0.1度电烧开1升水）
    const boiledWater = (kwh * 10).toFixed(1);
    descriptions.push({
      icon: '💧',
      title: '烧开水量',
      value: `${boiledWater} 升`,
      desc: `相当于烧开 ${boiledWater} 升水`
    });

    // 2. LED灯泡照明时长（10W LED灯泡）
    const ledHours = (kwh * 100).toFixed(0);
    descriptions.push({
      icon: '💡',
      title: 'LED灯照明',
      value: `${ledHours} 小时`,
      desc: `可点亮10W LED灯 ${ledHours} 小时`
    });

    // 3. 手机充电次数（约0.015度充满一次）
    const phoneCharges = Math.floor(kwh / 0.015);
    descriptions.push({
      icon: '📱',
      title: '手机充电',
      value: `${phoneCharges} 次`,
      desc: `可给智能手机充满电 ${phoneCharges} 次`
    });

    // 4. 笔记本电脑使用时长（约0.05度/小时）
    const laptopHours = (kwh / 0.05).toFixed(1);
    descriptions.push({
      icon: '💻',
      title: '笔记本使用',
      value: `${laptopHours} 小时`,
      desc: `可供笔记本电脑工作 ${laptopHours} 小时`
    });

    // 5. 空调运行时长（约1度/小时，1.5匹）
    const acHours = kwh.toFixed(1);
    descriptions.push({
      icon: '❄️',
      title: '空调运行',
      value: `${acHours} 小时`,
      desc: `可供1.5匹空调运行 ${acHours} 小时`
    });

    // 6. 洗衣机洗衣次数（约0.5度/次）
    const laundryTimes = Math.floor(kwh / 0.5);
    descriptions.push({
      icon: '🧺',
      title: '洗衣机',
      value: `${laundryTimes} 次`,
      desc: `可用洗衣机洗衣服 ${laundryTimes} 次`
    });

    // 7. 电视机观看时长（约0.1度/小时）
    const tvHours = (kwh / 0.1).toFixed(0);
    descriptions.push({
      icon: '📺',
      title: '电视观看',
      value: `${tvHours} 小时`,
      desc: `可观看电视 ${tvHours} 小时`
    });

    // 8. 电风扇运行时长（约0.05度/小时）
    const fanHours = (kwh / 0.05).toFixed(0);
    descriptions.push({
      icon: '🌀',
      title: '电风扇',
      value: `${fanHours} 小时`,
      desc: `可运行电风扇 ${fanHours} 小时`
    });

    // 9. 电动自行车行驶距离（约0.02度/公里）
    const bikeKm = (kwh / 0.02).toFixed(1);
    descriptions.push({
      icon: '🚲',
      title: '电动自行车',
      value: `${bikeKm} 公里`,
      desc: `可骑行电动自行车 ${bikeKm} 公里`
    });

    // 10. 木材燃烧能量等价（1kg木材约4.5度电）
    const woodKg = (kwh / 4.5).toFixed(2);
    descriptions.push({
      icon: '🪵',
      title: '木材等价',
      value: `${woodKg} kg`,
      desc: `相当于燃烧 ${woodKg} kg 木材所得能量`
    });

    return descriptions;
  },

  /**
   * 预测剩余电量可用天数
   */
  predictDaysRemaining(currentBalance, avgConsumption) {
    if (!avgConsumption || avgConsumption <= 0) {
      return { days: Infinity, status: 'unknown' };
    }

    const days = Math.floor(currentBalance / avgConsumption);

    let status = 'good';
    if (days <= 3) status = 'critical';
    else if (days <= 7) status = 'warning';
    else if (days <= 14) status = 'caution';

    return { days, status };
  },

  /**
   * 生成充值建议
   */
  getRechargeSuggestion(avgConsumption) {
    if (!avgConsumption || avgConsumption <= 0) {
      return { amount: 100, reason: '建议充值100度作为基础储备' };
    }

    // 建议充值一个月的用量
    const monthlyUsage = avgConsumption * 30;

    if (monthlyUsage <= 30) {
      return { amount: 50, reason: '按您的用电习惯，50度约可用1-2个月' };
    } else if (monthlyUsage <= 60) {
      return { amount: 100, reason: '按您的用电习惯，100度约可用1-2个月' };
    } else if (monthlyUsage <= 120) {
      return { amount: 200, reason: '按您的用电习惯，200度约可用1-2个月' };
    } else {
      return { amount: 300, reason: '按您的用电习惯，300度约可用1个月' };
    }
  },

  // ==================== 排序结果缓存 ====================

  /**
   * 获取排序结果缓存
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} date 日期 (YYYY-MM-DD 或 YYYYMMDD)
   */
  /**
   * 获取排序结果缓存
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} date 日期
   * @returns {Object|null} 返回 { data: [], totalConsumption, roomCount, updatedAt } 或 null
   */
  async getRankingCache(campusName, buildingName, date) {
    const compactDate = this._formatDateCompact(date);
    const key = this._getCacheKey('ranking', campusName, buildingName);
    const cache = await IDB.get(key);

    if (cache && cache[compactDate]) {
      console.log(`[缓存命中] 排序结果: ${key} -> ${compactDate}`);
      const cachedData = cache[compactDate];

      // 兼容旧格式（直接是数组）和新格式（包含 data 字段的对象）
      if (Array.isArray(cachedData)) {
        // 旧格式，直接返回数组
        return { data: cachedData, totalConsumption: 0, roomCount: cachedData.length };
      }
      return cachedData;
    }
    return null;
  },

  /**
   * 保存排序结果到缓存
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} date 日期
   * @param {Array} rankingData 排序结果数组
   * @param {boolean} sorted 是否已排序（默认 false，校区页面创建的缓存不排序）
   */
  async saveRankingCache(campusName, buildingName, date, rankingData, sorted = false) {
    const compactDate = this._formatDateCompact(date);
    const key = this._getCacheKey('ranking', campusName, buildingName);

    // 计算总消耗量
    const totalConsumption = rankingData.reduce((sum, item) => sum + (item.consumption || 0), 0);

    // 获取现有缓存或创建新的
    let cache = await IDB.get(key) || {};

    // 保存排序结果，包含总消耗量统计和排序状态
    cache[compactDate] = {
      data: rankingData,
      totalConsumption: totalConsumption,
      roomCount: rankingData.length,
      sorted: sorted,
      updatedAt: Date.now()
    };

    await IDB.set(key, cache);
    console.log(`[缓存保存] 排序结果: ${key} -> ${compactDate}, 共${rankingData.length}条, 总消耗: ${totalConsumption.toFixed(2)}度, 已排序: ${sorted}`);
  },

  // ==================== 校区耗电量缓存 ====================

  /**
   * 获取校区级耗电量缓存
   * @param {string} campusName 校区名
   * @param {string} date 日期
   * @returns {Object|null}
   */
  async getCampusConsumptionCache(campusName, date) {
    const compactDate = this._formatDateCompact(date);
    const key = this._getCacheKey('campus', campusName);
    const cache = await IDB.get(key);

    if (cache && cache[compactDate]) {
      console.log(`[缓存命中] 校区耗电: ${key} -> ${compactDate}`);
      return cache[compactDate];
    }
    return null;
  },

  /**
   * 保存校区级耗电量到缓存
   * @param {string} campusName 校区名
   * @param {string} date 日期
   * @param {Object} data 校区耗电量数据
   */
  async saveCampusConsumptionCache(campusName, date, data) {
    const compactDate = this._formatDateCompact(date);
    const key = this._getCacheKey('campus', campusName);

    let cache = await IDB.get(key) || {};
    cache[compactDate] = {
      ...data,
      updatedAt: Date.now()
    };

    await IDB.set(key, cache);
    console.log(`[缓存保存] 校区耗电: ${key} -> ${compactDate}`);
  },

  /**
   * 获取校区耗电量数据（渐进加载）
   *
   * 三层策略：
   * 1. 校区级缓存 → 瞬时返回
   * 2. 楼栋排名缓存聚合 → 零成本聚合已有楼栋数据
   * 3. 批量加载未缓存楼栋 → 逐栋完成后触发 onProgress
   *
   * @param {string} campusName 校区名
   * @param {string} date 日期类型: 'today', 'yesterday', 'week', 或具体日期 YYYY-MM-DD
   * @param {Function} onProgress 进度回调 (loadedBuildings, totalBuildings, partialResult)
   * @param {boolean} forceRefresh 强制刷新
   * @returns {Promise<Object>} 校区耗电量结果
   */
  async getCampusConsumption(campusName, date = 'today', onProgress = null, forceRefresh = false) {
    const targetDate = date || 'today';

    // Layer 1: 校区级缓存
    if (!forceRefresh) {
      const cached = await this.getCampusConsumptionCache(campusName, targetDate);
      if (cached) {
        if (onProgress) onProgress(1, 1, cached);
        return cached;
      }
    }

    // 获取校区统计（楼栋列表）
    const campusStats = await this.getCampusStatistics(campusName);
    if (!campusStats) return null;

    const buildingDetails = campusStats.buildingDetails || [];
    const totalBuildings = buildingDetails.length;

    // Layer 2 & 3: 逐栋加载
    const buildingsWithData = [];

    // 先检查已有排名缓存的楼栋
    for (const building of buildingDetails) {
      const rankingCache = await this.getRankingCache(campusName, building.name, targetDate);
      if (rankingCache && rankingCache.totalConsumption !== undefined) {
        buildingsWithData.push({
          name: building.name,
          total_rooms: building.total_rooms,
          consumption: rankingCache.totalConsumption,
          roomCount: rankingCache.roomCount,
          avgConsumption: rankingCache.roomCount > 0
            ? rankingCache.totalConsumption / rankingCache.roomCount : 0,
          fromCache: true
        });
      }
    }

    // 从缓存楼栋发出初步结果
    let partialResult = this._aggregateCampusResult(campusName, campusStats, buildingsWithData);
    if (onProgress && buildingsWithData.length > 0) {
      onProgress(buildingsWithData.length, totalBuildings, partialResult);
    }

    // Layer 3: 逐栋加载未缓存的楼栋
    for (const building of buildingDetails) {
      // 跳过已有缓存数据的楼栋
      if (buildingsWithData.some(b => b.name === building.name)) continue;

      try {
        // 优先尝试从 details.json 加载（单个请求获取整个楼栋数据）
        let totalConsumption = 0;
        let roomCount = 0;
        let fromDetails = false;

        const buildingDetails = await this.getBuildingDetails(campusName, building.name);
        if (buildingDetails && buildingDetails.rooms) {
          // 从 details.json 计算耗电量
          const compactDate = this._formatDateCompact(targetDate);
          for (const roomId in buildingDetails.rooms) {
            const roomData = buildingDetails.rooms[roomId];
            if (roomData.balance_history) {
              const consumption = this._calculateConsumptionFromHistory(
                roomData.balance_history,
                targetDate,
                compactDate
              );
              if (consumption !== null) {
                totalConsumption += consumption;
                roomCount++;
              }
            }
          }
          fromDetails = true;
          console.log(`[details.json] ${building.name}: ${roomCount} 房间, ${totalConsumption.toFixed(2)} 度`);
        } else {
          // 回退到原来的方式：从房间缓存或单独文件加载
          let ranking = await this.getBuildingConsumptionFromRoomCache(
            campusName,
            building.name,
            targetDate
          );

          if (!ranking) {
            ranking = await this.getBuildingConsumptionRankingFast(
              campusName,
              building.name,
              targetDate === 'today' ? null : this._formatDateCompact(targetDate),
              null,
              false
            );
          }

          if (Array.isArray(ranking)) {
            totalConsumption = ranking.reduce((sum, r) => sum + (r.consumption || 0), 0);
            roomCount = ranking.length;
          } else if (ranking && ranking.data) {
            totalConsumption = ranking.totalConsumption || ranking.data.reduce((sum, r) => sum + (r.consumption || 0), 0);
            roomCount = ranking.roomCount || ranking.data.length;
          }
        }

        buildingsWithData.push({
          name: building.name,
          total_rooms: building.total_rooms,
          consumption: totalConsumption,
          roomCount: roomCount,
          avgConsumption: roomCount > 0 ? totalConsumption / roomCount : 0,
          fromCache: fromDetails
        });
      } catch (error) {
        console.warn(`加载楼栋 ${building.name} 失败:`, error);
        buildingsWithData.push({
          name: building.name,
          total_rooms: building.total_rooms,
          consumption: 0,
          roomCount: 0,
          avgConsumption: 0,
          fromCache: false,
          error: true
        });
      }

      // 每完成一栋楼触发进度更新
      partialResult = this._aggregateCampusResult(campusName, campusStats, buildingsWithData);
      if (onProgress) {
        onProgress(buildingsWithData.length, totalBuildings, partialResult);
      }
    }

    // 缓存最终结果
    await this.saveCampusConsumptionCache(campusName, targetDate, partialResult);

    return partialResult;
  },

  /**
   * 从 balance_history 计算指定日期的消耗量
   * @param {Object} balanceHistory - { 'YYYYMMDD': balance } 格式的历史数据
   * @param {string} dateType - 'today', 'yesterday', 'week' 或具体日期
   * @param {string} compactDate - 格式化后的日期 YYYYMMDD
   * @returns {number|null} 消耗量（度）或 null
   * @private
   */
  _calculateConsumptionFromHistory(balanceHistory, dateType, compactDate) {
    if (!balanceHistory) return null;

    // 将对象转为排序后的数组
    const dates = Object.keys(balanceHistory).sort();
    if (dates.length === 0) return null;

    // 找到目标日期的索引
    let targetIdx;
    if (dateType === 'today') {
      targetIdx = dates.length - 1;
    } else if (dateType === 'yesterday') {
      targetIdx = dates.length - 2;
    } else if (dateType === 'week') {
      // 计算最近7天的平均消耗
      const recentDates = dates.slice(-7);
      if (recentDates.length < 2) return null;

      let totalConsumption = 0;
      let count = 0;
      for (let i = 1; i < recentDates.length; i++) {
        const prevBalance = balanceHistory[recentDates[i - 1]];
        const currBalance = balanceHistory[recentDates[i]];
        if (prevBalance > currBalance) {
          totalConsumption += prevBalance - currBalance;
          count++;
        }
      }
      return count > 0 ? totalConsumption / count : 0;
    } else {
      // 自定义日期
      targetIdx = dates.indexOf(compactDate);
      if (targetIdx === -1 || targetIdx === 0) return null;
    }

    if (targetIdx <= 0) return null;

    // 计算消耗量：前一天余额 - 当天余额
    const prevBalance = balanceHistory[dates[targetIdx - 1]];
    const currBalance = balanceHistory[dates[targetIdx]];

    // 只有余额减少才算消耗（充值会导致余额增加）
    return prevBalance > currBalance ? prevBalance - currBalance : 0;
  },

  /**
   * 聚合楼栋数据为校区结果
   * @private
   */
  _aggregateCampusResult(campusName, campusStats, buildingsWithData) {
    let totalConsumption = 0;
    let totalRoomCount = 0;
    const buildings = {};

    for (const b of buildingsWithData) {
      totalConsumption += b.consumption || 0;
      totalRoomCount += b.roomCount || 0;
      buildings[b.name] = {
        consumption: b.consumption || 0,
        roomCount: b.roomCount || 0,
        total_rooms: b.total_rooms || 0,
        avgConsumption: b.avgConsumption || 0
      };
    }

    const campusRoomCount = campusStats.rooms || 0;
    return {
      campus: campusName,
      totalConsumption,
      buildingCount: campusStats.buildings || 0,
      roomCount: campusRoomCount,
      roomsWithData: totalRoomCount,
      avgConsumption: campusRoomCount > 0 ? totalConsumption / campusRoomCount : 0,
      buildings
    };
  },

  // ==================== 房间耗电量缓存 ====================

  /**
   * 获取房间某日的耗电量缓存
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} roomId 房间ID
   * @param {string} date 日期 (可选，不传则返回所有日期)
   */
  /**
   * 获取房间耗电量缓存
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} roomId 房间ID或房间名
   * @param {string} date 日期（可选）
   */
  async getRoomConsumptionCache(campusName, buildingName, roomId, date = null) {
    const key = this._getCacheKey('room', campusName, buildingName, roomId);
    const cache = await IDB.get(key);

    if (!cache) return null;

    if (date) {
      const compactDate = this._formatDateCompact(date);
      return cache[compactDate] || null;
    }

    return cache;
  },

  /**
   * 保存房间耗电量到缓存
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} roomId 房间ID或房间名
   * @param {string} date 日期
   * @param {Object} data { electricity, consumption }
   */
  async saveRoomConsumptionCache(campusName, buildingName, roomId, date, data) {
    const compactDate = this._formatDateCompact(date);
    const key = this._getCacheKey('room', campusName, buildingName, roomId);

    // 获取现有缓存或创建新的
    let cache = await IDB.get(key) || {};
    cache[compactDate] = {
      electricity: data.electricity,
      consumption: data.consumption,
      updatedAt: Date.now()
    };

    await IDB.set(key, cache);
    console.log(`[缓存保存] 房间耗电量: ${key} -> ${compactDate}`);
  },

  /**
   * 批量保存房间耗电量到缓存
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {Map} roomDataMap roomId -> roomData 的映射
   */
  async batchSaveRoomConsumptionCache(campusName, buildingName, roomDataMap) {
    const entries = [];
    const now = Date.now();

    for (const [roomId, roomData] of roomDataMap) {
      if (!roomData || !roomData.history) continue;

      const key = this._getCacheKey('room', campusName, buildingName, roomId);
      let cache = await IDB.get(key) || {};

      // 遍历历史数据，保存每个日期的耗电量
      for (const entry of roomData.history) {
        const date = entry.formattedDate || this.formatDate(entry.date);
        const compactDate = this._formatDateCompact(date);
        cache[compactDate] = {
          electricity: entry.electricity,
          consumption: entry.consumption || 0,
          updatedAt: now
        };
      }

      entries.push({ key, value: cache });
    }

    // 使用批量写入提高性能
    if (entries.length > 0) {
      await IDB.batchSet(entries);
    }
    console.log(`[缓存保存] 房间耗电量: ${campusName}.${buildingName}, 共${roomDataMap.size}个房间`);
  },

  // ==================== 楼栋房间列表缓存 ====================

  /**
   * 获取楼栋房间列表缓存
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   */
  async getRoomsListCache(campusName, buildingName) {
    const key = this._getCacheKey('rooms', campusName, buildingName);
    const cache = await IDB.get(key);

    if (cache) {
      console.log(`[缓存命中] 房间列表: ${key}`);
    }
    return cache;
  },

  /**
   * 保存楼栋房间列表到缓存
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {Object} roomsData 房间数据 { roomId: roomInfo }
   */
  async saveRoomsListCache(campusName, buildingName, roomsData) {
    const key = this._getCacheKey('rooms', campusName, buildingName);
    await IDB.set(key, roomsData);
    console.log(`[缓存保存] 房间列表: ${key}, 共${Object.keys(roomsData).length}个房间`);
  },

  // ==================== 异步加载楼栋房间列表 ====================

  /**
   * 异步加载楼栋房间列表（支持缓存和渐进式回调）
   * @param {string} campusName 校区名
   * @param {Function} onBuildingLoaded 单个楼栋加载完成回调 (buildingName, rooms)
   */
  async loadBuildingsRoomsAsync(campusName, onBuildingLoaded) {
    // 先获取楼栋列表
    const buildings = await this.getBuildings(campusName);

    // 并行加载所有楼栋的房间列表
    const promises = buildings.map(async (building) => {
      // 检查缓存
      const cached = await this.getRoomsListCache(campusName, building.name);
      if (cached) {
        // 缓存命中，立即回调
        const rooms = Object.entries(cached).map(([id, data]) => ({
          id,
          name: data.room_name,
          currentBalance: data.current_balance,
          lastUpdated: data.last_updated
        }));
        onBuildingLoaded(building.name, rooms);
        return { building: building.name, rooms, fromCache: true };
      }

      // 缓存未命中，从网络获取
      try {
        const buildingSummary = await this.getBuildingSummary(campusName, building.name);
        if (buildingSummary && buildingSummary.rooms) {
          // 保存到缓存
          await this.saveRoomsListCache(campusName, building.name, buildingSummary.rooms);

          const rooms = Object.entries(buildingSummary.rooms).map(([id, data]) => ({
            id,
            name: data.room_name,
            currentBalance: data.current_balance,
            lastUpdated: data.last_updated
          }));

          onBuildingLoaded(building.name, rooms);
          return { building: building.name, rooms, fromCache: false };
        }
      } catch (error) {
        console.warn(`加载楼栋 ${building.name} 失败:`, error);
      }

      return { building: building.name, rooms: [], fromCache: false };
    });

    // 等待所有楼栋加载完成
    const results = await Promise.all(promises);
    return results;
  },

  /**
   * 获取所有楼栋的所有房间（用于搜索）
   * 优先从缓存获取，异步加载缺失的楼栋
   * @param {string} campusName 校区名
   * @param {Function} onProgress 进度回调 (loaded, total)
   */
  async getAllRoomsForSearch(campusName, onProgress = null) {
    const buildings = await this.getBuildings(campusName);
    const total = buildings.length;
    let loaded = 0;
    const allRooms = [];

    // 并行加载，但使用较小的并发数避免阻塞
    const concurrency = 3;
    const chunks = [];
    for (let i = 0; i < buildings.length; i += concurrency) {
      chunks.push(buildings.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (building) => {
        // 检查缓存
        const cached = await this.getRoomsListCache(campusName, building.name);
        if (cached) {
          const rooms = Object.entries(cached).map(([id, data]) => ({
            id,
            name: data.room_name,
            campus: campusName,
            building: building.name,
            currentBalance: data.current_balance
          }));
          loaded++;
          if (onProgress) onProgress(loaded, total);
          return rooms;
        }

        // 缓存未命中，从网络获取
        try {
          const buildingSummary = await this.getBuildingSummary(campusName, building.name);
          if (buildingSummary && buildingSummary.rooms) {
            await this.saveRoomsListCache(campusName, building.name, buildingSummary.rooms);

            const rooms = Object.entries(buildingSummary.rooms).map(([id, data]) => ({
              id,
              name: data.room_name,
              campus: campusName,
              building: building.name,
              currentBalance: data.current_balance
            }));
            loaded++;
            if (onProgress) onProgress(loaded, total);
            return rooms;
          }
        } catch (error) {
          console.warn(`加载楼栋 ${building.name} 失败:`, error);
        }

        loaded++;
        if (onProgress) onProgress(loaded, total);
        return [];
      });

      const results = await Promise.all(promises);
      for (const rooms of results) {
        allRooms.push(...rooms);
      }
    }

    return allRooms;
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.DataService = DataService;
}
