/**
 * 电费数据服务模块
 * 从本地数据库文件夹获取真实数据
 *
 * 数据结构：
 * - ./database/summaries/overview.json - 总览数据
 * - ./database/summaries/campuses/校区名/summary.json - 校区汇总
 * - ./database/summaries/campuses/校区名/buildings/楼栋名/summary.json - 楼栋汇总
 * - ./database/summaries/campuses/校区名/buildings/楼栋名/rooms/房间名.json - 房间历史
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
  _beatPercentageCache: new Map(),
  _buildingConsumptionStatsCache: new Map(),
  _balanceHistoryDatesCache: new WeakMap(),

  // localStorage 缓存键前缀
  CACHE_PREFIX: '',
  CACHE_VERSION: 'v2',
  RANKING_PERCENT_TTL_MS: 5 * 60 * 1000,

  // 数据版本缓存键
  DATA_VERSION_KEY: '__data_version__',

  /**
   * ==================== 缓存层键值对格式设计 ====================
   *
   * 1. 排序结果缓存：
   *    键: `{校区}.{楼栋}.耗电排序`
   *    值: {
   *      '20250127': [
   *        { roomName, consumption, balance, rank },
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
   *      '房间名': { name: '101', room_name: '4A211', current_balance: 45.2, last_updated: '...' },
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
   * 同时检查数据版本，版本变化时自动清除缓存
   */
  async initDB() {
    await IDB.init();
    this._dbReady = true;

    // 检查数据版本
    await this._checkDataVersion();
  },

  /**
   * 检查数据版本，版本变化时清除缓存
   */
  async _checkDataVersion() {
    try {
      // 获取 overview.json 中的版本号
      const response = await fetch(`${this.SUMMARIES_PATH}/overview.json`);
      const overview = await response.json();
      const serverVersion = overview.data_version || overview.generated_at;

      if (!serverVersion) {
        console.log('[版本检查] 服务器未提供版本号，跳过缓存检查');
        return;
      }

      // 获取本地缓存的版本号
      const localVersion = await IDB.get(this.DATA_VERSION_KEY);

      if (localVersion && localVersion !== serverVersion) {
        console.log(`[版本检查] 数据版本已更新: ${localVersion} → ${serverVersion}，清除缓存`);
        await IDB.clear();
        this._overviewCache = null;
        this._campusCache.clear();
        this._buildingCache.clear();
        this._roomCache.clear();
        this._beatPercentageCache.clear();
        this._buildingConsumptionStatsCache.clear();
        this._balanceHistoryDatesCache = new WeakMap();
        this._clearCampusWideRankingSessionCache();
        this._clearBeatPercentageSessionCache();
      }

      // 保存当前版本号
      await IDB.set(this.DATA_VERSION_KEY, serverVersion);
      console.log(`[版本检查] 当前数据版本: ${serverVersion}`);
    } catch (error) {
      console.warn('[版本检查] 检查数据版本失败:', error);
    }
  },

  /**
   * 清除所有缓存
   */
  async clearAllCache() {
    await IDB.clear();
    this._clearCampusWideRankingSessionCache();

    // 清除内存缓存
    this._overviewCache = null;
    this._campusCache.clear();
    this._buildingCache.clear();
    this._roomCache.clear();
    this._beatPercentageCache.clear();
    this._buildingConsumptionStatsCache.clear();
    this._balanceHistoryDatesCache = new WeakMap();
    this._clearBeatPercentageSessionCache();
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
   * @returns {Object|null} { building, campus, total_rooms, rooms: { roomName: { room_name, ... } } }
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
      return Object.entries(buildingSummary.rooms).map(([roomName, data]) => ({
        name: roomName,
        currentBalance: data.current_balance,
        lastUpdated: data.last_updated
      }));
    }
    return [];
  },

  /**
   * 获取房间历史数据（从汇总文件）
   */
  async getRoomHistory(campusName, buildingName, roomName) {
    const cacheKey = `${campusName}/${buildingName}/${roomName}`;
    if (this._roomCache.has(cacheKey)) {
      return this._roomCache.get(cacheKey);
    }

    try {
      const response = await fetch(
        `${this.SUMMARIES_PATH}/campuses/${encodeURIComponent(campusName)}/buildings/${encodeURIComponent(buildingName)}/rooms/${encodeURIComponent(roomName)}.json`
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

      // dailyConsumption 改为今日消耗（按日期匹配）
      const todayCompact = this._formatDateCompact('today');
      const todayEntry = history.find(h => h.date === todayCompact);

      const result = {
        ...data,
        history,
        dailyConsumption: todayEntry?.consumption ?? null,
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
   * @param {string} roomName 房间名
   * @param {string} dateType 日期类型: 'today', 'yesterday', 'week', 或具体日期(YYYY-MM-DD)
   */
  async getConsumptionByDate(campusName, buildingName, roomName, dateType) {
    const history = await this.getRoomHistory(campusName, buildingName, roomName);
    if (!history || !history.history || history.history.length === 0) {
      return null;
    }

    const hist = history.history;
    const compactDate = this._formatDateCompact(dateType);

    // 使用统一的方法计算
    return this._calculateConsumptionFromHistoryArray(hist, dateType, compactDate);
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
   * @param {string[]} roomNames 房间名列表
   * @param {Function} onRoomLoaded 单个房间加载完成回调 (roomName, roomData, loaded, total)
   * @param {number} poolSize 请求池大小（默认100）
   */
  async poolRoomHistory(campusName, buildingName, roomNames, onRoomLoaded, poolSize = 100) {
    let loaded = 0;
    const total = roomNames.length;
    let currentIndex = 0;
    const activeRequests = new Set();

    // 处理单个房间的请求
    const processRoom = async (roomName) => {
      const cacheKey = `${campusName}/${buildingName}/${roomName}`;

      // 检查缓存
      if (this._roomCache.has(cacheKey)) {
        const data = this._roomCache.get(cacheKey);
        loaded++;
        onRoomLoaded(roomName, data, loaded, total);
        return { roomName, data };
      }

      try {
        const response = await fetch(
          `${this.SUMMARIES_PATH}/campuses/${encodeURIComponent(campusName)}/buildings/${encodeURIComponent(buildingName)}/rooms/${encodeURIComponent(roomName)}.json`
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
        onRoomLoaded(roomName, data, loaded, total);

        return { roomName, data };
      } catch (error) {
        loaded++;
        onRoomLoaded(roomName, null, loaded, total);
        return { roomName, data: null, error };
      }
    };

    // 启动一个工作请求
    const startNext = async () => {
      if (currentIndex >= total) return null;

      const roomIndex = currentIndex++;
      const roomName = roomNames[roomIndex];

      const promise = processRoom(roomName);
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
   * @param {string[]} roomNames 房间名列表
   * @param {Function} onRoomLoaded 单个房间加载完成回调 (roomName, roomData)
   * @param {number} concurrency 并发数（默认10）
   */
  async streamRoomHistory(campusName, buildingName, roomNames, onRoomLoaded, concurrency = 100) {
    // 使用请求池模式，更高效
    return this.poolRoomHistory(campusName, buildingName, roomNames, onRoomLoaded, concurrency);
  },

  /**
   * 通用异步任务并发池
   * 以 concurrency 上限并行执行一组零参异步函数
   * @param {Array<() => Promise>} taskFactories
   * @param {number} concurrency 并发上限（默认6）
   * @returns {Promise<Array<{status: string, value?: any, reason?: Error}>>}
   */
  async _poolTasks(taskFactories, concurrency = 6) {
    const results = new Array(taskFactories.length);
    let nextIndex = 0;
    let completed = 0;
    const total = taskFactories.length;

    return new Promise((resolve) => {
      if (total === 0) { resolve(results); return; }

      const startNext = () => {
        if (nextIndex >= total) return;
        const idx = nextIndex++;
        const task = taskFactories[idx];

        Promise.resolve().then(() => task()).then(
          (value) => {
            results[idx] = { status: 'fulfilled', value };
          },
          (reason) => {
            results[idx] = { status: 'rejected', reason };
          }
        ).finally(() => {
          completed++;
          if (completed < total) {
            startNext();
          } else {
            resolve(results);
          }
        });
      };

      const initialCount = Math.min(concurrency, total);
      for (let i = 0; i < initialCount; i++) {
        startNext();
      }
    });
  },

  /**
   * 批量获取房间历史数据（请求池模式，更高效）
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string[]} roomNames 房间名列表
   * @param {number} poolSize 请求池大小（默认100）
   * @param {Function} onProgress 进度回调 (loaded, total)
   */
  async batchGetRoomHistory(campusName, buildingName, roomNames, poolSize = 100, onProgress = null) {
    const results = new Map();

    // 使用请求池模式获取数据
    await this.poolRoomHistory(
      campusName,
      buildingName,
      roomNames,
      (roomName, data, loaded, total) => {
        if (data) results.set(roomName, data);
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

    const roomNames = Object.keys(buildingSummary.rooms);
    const roomMap = buildingSummary.rooms;

    // 使用请求池模式批量获取房间数据（100并发）
    const roomDataMap = await this.batchGetRoomHistory(
      campusName,
      buildingName,
      roomNames,
      100, // 请求池大小
      onProgress
    );

    // 批量保存房间耗电量到缓存
    await this.batchSaveRoomConsumptionCache(campusName, buildingName, roomDataMap);

    // 格式化目标日期
    const targetCompactDate = this._formatDateCompact(targetDate);

    // 构建排行数据
    // 构建排行数据 - 只包含指定日期有数据的房间
    const rankings = [];
    let roomsWithData = 0;

    for (const roomName of roomNames) {
      const roomInfo = roomMap[roomName];
      const roomData = roomDataMap.get(roomName);

      if (roomData && roomData.history && roomData.history.length > 0) {
        // 尝试从历史中找到指定日期的消耗
        const targetEntry = roomData.history.find(h =>
          h.date === targetCompactDate || h.formattedDate === targetDate
        );

        // 只有找到指定日期的数据才加入排行榜（不使用 fallback）
        if (targetEntry && targetEntry.consumption !== undefined && targetEntry.consumption !== null) {
          rankings.push({
            roomName,
            consumption: targetEntry.consumption,
            balance: targetEntry.electricity || roomInfo.current_balance
          });
          roomsWithData++;
        }
      }
    }

    // 保存排序结果到缓存，包含完整度信息
    await this.saveRankingCache(campusName, buildingName, targetDate, rankings, true, {
      totalRooms: roomNames.length,
      roomsWithData: roomsWithData
    });

    return rankings;
  },

  /**
   * 从房间消耗缓存构建楼栋排名（避免重复请求）
   * 只使用指定日期的数据，不进行 fallback
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
    const roomNames = Object.keys(roomMap);

    // 尝试从房间缓存读取每个房间的指定日期消耗
    const rankings = [];
    let cachedCount = 0;

    for (const roomName of roomNames) {
      const roomInfo = roomMap[roomName];
      const roomCache = await this.getRoomConsumptionCache(campusName, buildingName, roomName, compactDate);

      // 只有指定日期有缓存数据才加入（不使用 fallback）
      if (roomCache && roomCache.consumption !== undefined) {
        rankings.push({
          roomName,
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

    // 计算无数据房间列表
    const noDataRooms = roomNames.filter(rn => !rankings.some(r => r.roomName === rn));

    console.log(`[缓存构建] ${campusName}.${buildingName}: ${cachedCount}/${roomNames.length} 间从缓存读取 (日期:${compactDate})`);

    // 保存到排名缓存
    await this.saveRankingCache(campusName, buildingName, date, rankings, false, {
      totalRooms: roomNames.length,
      roomsWithData: cachedCount,
      noDataRooms: noDataRooms
    });

    return {
      data: rankings,
      noDataRooms: noDataRooms,
      totalConsumption: rankings.reduce((sum, r) => sum + r.consumption, 0),
      roomCount: rankings.length,
      totalRooms: roomNames.length,
      roomsWithData: cachedCount
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
      const history = await this.getRoomHistory(campusName, buildingName, room.name);
      if (history && history.history) {
        // 找到最近一天的消耗
        const lastEntry = history.history[history.history.length - 1];
        rankings.push({
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
   * @param {Object} metadata 元数据（totalRooms, roomsWithData, noDataRooms）
   */
  async saveRankingCache(campusName, buildingName, date, rankingData, sorted = false, metadata = null) {
    const compactDate = this._formatDateCompact(date);
    const key = this._getCacheKey('ranking', campusName, buildingName);

    // 计算总消耗量
    const totalConsumption = rankingData.reduce((sum, item) => sum + (item.consumption || 0), 0);

    // 获取现有缓存或创建新的
    let cache = await IDB.get(key) || {};

    // 保存排序结果，包含总消耗量统计、排序状态和元数据
    cache[compactDate] = {
      data: rankingData,
      totalConsumption: totalConsumption,
      roomCount: rankingData.length,
      sorted: sorted,
      updatedAt: Date.now(),
      // 新增元数据字段
      totalRooms: metadata?.totalRooms || rankingData.length,
      roomsWithData: metadata?.roomsWithData || rankingData.length,
      noDataRooms: metadata?.noDataRooms || []
    };

    await IDB.set(key, cache);
    const completenessPct = metadata?.totalRooms ? Math.floor((metadata.roomsWithData / metadata.totalRooms) * 100) : 100;
    console.log(`[缓存保存] 排序结果: ${key} -> ${compactDate}, 共${rankingData.length}条, 总消耗: ${totalConsumption.toFixed(2)}度, 已排序: ${sorted}, 数据完整度: ${completenessPct}%`);
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
          for (const roomName in buildingDetails.rooms) {
            const roomData = buildingDetails.rooms[roomName];
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
              targetDate === 'today' ? null : targetDate,
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

    const dates = this._getBalanceHistoryDates(balanceHistory);
    if (dates.length === 0) return null;

    // today/yesterday 转换为具体日期
    let targetDate = compactDate;
    if (dateType === 'today' || dateType === 'yesterday') {
      targetDate = this._formatDateCompact(dateType);
    }

    if (dateType === 'week') {
      // 计算最近7天的日期范围
      const today = new Date();
      const weekDates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        weekDates.push(this._dateToCompact(d));
      }

      // 筛选该范围内的日期
      const validDates = dates.filter(d => weekDates.includes(d));
      if (validDates.length < 2) return null;

      let totalConsumption = 0;
      let count = 0;
      for (let i = 1; i < validDates.length; i++) {
        const prevBalance = balanceHistory[validDates[i - 1]];
        const currBalance = balanceHistory[validDates[i]];
        if (prevBalance > currBalance) {
          totalConsumption += prevBalance - currBalance;
          count++;
        }
      }
      return count > 0 ? totalConsumption / count : 0;
    }

    // 按日期查找
    const targetIdx = dates.indexOf(targetDate);
    if (targetIdx === -1 || targetIdx === 0) return null;

    // 计算消耗量：前一天余额 - 当天余额
    const prevBalance = balanceHistory[dates[targetIdx - 1]];
    const currBalance = balanceHistory[dates[targetIdx]];

    return prevBalance > currBalance ? prevBalance - currBalance : 0;
  },

  /**
   * 获取 balance_history 的升序日期列表，并在对象生命周期内复用。
   * @private
   */
  _getBalanceHistoryDates(balanceHistory) {
    if (!balanceHistory || typeof balanceHistory !== 'object') return [];

    const cachedDates = this._balanceHistoryDatesCache.get(balanceHistory);
    if (cachedDates) return cachedDates;

    const dates = Object.keys(balanceHistory);
    for (let i = 1; i < dates.length; i++) {
      if (dates[i - 1] > dates[i]) {
        dates.sort();
        break;
      }
    }

    this._balanceHistoryDatesCache.set(balanceHistory, dates);
    return dates;
  },

  /**
   * 聚合楼栋数据为校区结果
   * @private
   */
  _aggregateCampusResult(campusName, campusStats, buildingsWithData) {
    let totalConsumption = 0;
    let totalRooms = 0;
    let totalRoomsWithData = 0;
    const buildings = {};

    for (const b of buildingsWithData) {
      totalConsumption += b.consumption || 0;
      totalRooms += b.total_rooms || 0;
      totalRoomsWithData += b.roomCount || 0;  // roomCount 是有数据的房间数
      buildings[b.name] = {
        consumption: b.consumption || 0,
        roomCount: b.roomCount || 0,           // 有数据房间数
        total_rooms: b.total_rooms || 0,       // 总房间数
        avgConsumption: b.avgConsumption || 0,
        dataCompleteness: b.total_rooms > 0 ? (b.roomCount / b.total_rooms) : 0
      };
    }

    const campusRoomCount = campusStats.rooms || 0;
    return {
      campus: campusName,
      totalConsumption,
      buildingCount: campusStats.buildings || 0,
      roomCount: campusRoomCount,
      roomsWithData: totalRoomsWithData,
      dataCompleteness: campusRoomCount > 0 ? totalRoomsWithData / campusRoomCount : 0,
      avgConsumption: totalRoomsWithData > 0 ? totalConsumption / totalRoomsWithData : 0,
      buildings
    };
  },

  // ==================== 房间耗电量缓存 ====================

  /**
   * 获取房间某日的耗电量缓存
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} roomName 房间名
   * @param {string} date 日期 (可选，不传则返回所有日期)
   */
  /**
   * 获取房间耗电量缓存
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} roomName 房间名
   * @param {string} date 日期（可选）
   */
  async getRoomConsumptionCache(campusName, buildingName, roomName, date = null) {
    const key = this._getCacheKey('room', campusName, buildingName, roomName);
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
   * @param {string} roomName 房间名
   * @param {string} date 日期
   * @param {Object} data { electricity, consumption }
   */
  async saveRoomConsumptionCache(campusName, buildingName, roomName, date, data) {
    const compactDate = this._formatDateCompact(date);
    const key = this._getCacheKey('room', campusName, buildingName, roomName);

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
   * @param {Map} roomDataMap roomName -> roomData 的映射
   */
  async batchSaveRoomConsumptionCache(campusName, buildingName, roomDataMap) {
    const entries = [];
    const now = Date.now();

    for (const [roomName, roomData] of roomDataMap) {
      if (!roomData || !roomData.history) continue;

      const key = this._getCacheKey('room', campusName, buildingName, roomName);
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
   * @param {Object} roomsData 房间数据 { roomName: roomInfo }
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
        const rooms = Object.entries(cached).map(([roomName, data]) => ({
          name: roomName,
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

          const rooms = Object.entries(buildingSummary.rooms).map(([roomName, data]) => ({
            name: roomName,
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
          const rooms = Object.entries(cached).map(([roomName, data]) => ({
            name: roomName,
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

            const rooms = Object.entries(buildingSummary.rooms).map(([roomName, data]) => ({
              name: roomName,
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
  },

  /**
   * 获取校区耗电趋势（多日）
   * 遍历所有楼栋的 details.json，聚合所有房间的 balance_history
   * 计算每栋楼中每个房间每天的历史消耗，返回按日期排序的趋势数据
   * 包含所有有余额记录的日期（即使消耗为0，因充值或余额不变也会记录）
   * @param {string} campusName 校区名
   * @param {number} maxDays 最大天数（默认30）
   * @returns {Promise<Object|null>} { dates: ['05-16', '05-17', ...], consumption: [120, 135, ...], roomCounts: [80, 82, ...] }
   */
  async getCampusConsumptionTrend(campusName, maxDays = 30) {
    const campusStats = await this.getCampusStatistics(campusName);
    if (!campusStats) return null;

    const buildingDetails = campusStats.buildingDetails || [];

    // 先收集所有楼栋的所有房间的 balance_history
    // dailyConsumption[date][roomName] = consumption （可为0）
    const dailyConsumption = {};
    const allDateSet = new Set();

    for (const bd of buildingDetails) {
      const details = await this.getBuildingDetails(campusName, bd.name);
      if (!details || !details.rooms) continue;

      for (const roomName in details.rooms) {
        const bh = details.rooms[roomName].balance_history;
        if (!bh) continue;

        const dates = Object.keys(bh).sort();
        if (dates.length < 2) continue;

        for (let i = 1; i < dates.length; i++) {
          const date = dates[i];
          const prev = bh[dates[i - 1]];
          const curr = bh[date];
          // 消耗 = max(0, 前日余额 - 当日余额)，充值或不变记为0
          const cons = prev > curr ? prev - curr : 0;
          allDateSet.add(date);

          if (!dailyConsumption[date]) dailyConsumption[date] = {};
          if (!dailyConsumption[date][roomName]) {
            dailyConsumption[date][roomName] = cons;
          }
        }
      }
    }

    if (allDateSet.size === 0) return null;

    // 取最近 maxDays 天
    const sortedDates = Array.from(allDateSet).sort();
    const recentDates = sortedDates.slice(-maxDays);

    // 按日期聚合所有房间消耗
    const dates = [];
    const consumption = [];
    const roomCounts = [];

    for (const d of recentDates) {
      const roomsOnDate = dailyConsumption[d];
      if (!roomsOnDate) continue;

      let totalCons = 0;
      let count = 0;
      for (const roomName in roomsOnDate) {
        totalCons += roomsOnDate[roomName];
        count++;
      }

      const month = d.substring(4, 6);
      const day = d.substring(6, 8);
      dates.push(`${month}-${day}`);
      consumption.push(Math.round(totalCons * 10) / 10);
      roomCounts.push(count);
    }

    return { dates, consumption, roomCounts };
  },

  /**
   * 获取楼栋耗电趋势（多日）
   * 遍历指定楼栋的所有房间的 balance_history
   * 计算该楼栋每天的历史消耗，返回按日期排序的趋势数据
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {number} maxDays 最大天数（默认30）
   * @returns {Promise<Object|null>} { dates: ['05-16', ...], consumption: [120, ...], roomCounts: [80, ...] }
   */
  async getBuildingConsumptionTrend(campusName, buildingName, maxDays = 30) {
    const details = await this.getBuildingDetails(campusName, buildingName);
    if (!details || !details.rooms) return null;

    const dailyConsumption = {};
    const allDateSet = new Set();

    for (const roomName in details.rooms) {
      const bh = details.rooms[roomName].balance_history;
      if (!bh) continue;

      const dates = Object.keys(bh).sort();
      if (dates.length < 2) continue;

      for (let i = 1; i < dates.length; i++) {
        const date = dates[i];
        const prev = bh[dates[i - 1]];
        const curr = bh[date];
        const cons = prev > curr ? prev - curr : 0;
        allDateSet.add(date);

        if (!dailyConsumption[date]) dailyConsumption[date] = {};
        if (!dailyConsumption[date][roomName]) {
          dailyConsumption[date][roomName] = cons;
        }
      }
    }

    if (allDateSet.size === 0) return null;

    const sortedDates = Array.from(allDateSet).sort();
    const recentDates = sortedDates.slice(-maxDays);

    const dates = [];
    const consumption = [];
    const roomCounts = [];

    for (const d of recentDates) {
      const roomsOnDate = dailyConsumption[d];
      if (!roomsOnDate) continue;

      let totalCons = 0;
      let count = 0;
      for (const roomName in roomsOnDate) {
        totalCons += roomsOnDate[roomName];
        count++;
      }

      const month = d.substring(4, 6);
      const day = d.substring(6, 8);
      dates.push(`${month}-${day}`);
      consumption.push(Math.round(totalCons * 10) / 10);
      roomCounts.push(count);
    }

    return { dates, consumption, roomCounts };
  },

  /**
   * 获取整个校区所有房间的耗电排名
   * @param {string} campusName 校区名
   * @param {string} date 日期类型：'today', 'yesterday', 'week', 或具体日期 YYYY-MM-DD
   * @param {Function} onProgress 进度回调：(loaded, total, partialResult)
   * @param {number} limit 返回的排名数量限制（默认 100）
   * @returns {Promise<Array>} 排序后的房间数据数组
   */
  async getCampusWideRanking(campusName, date = 'today', onProgress = null, limit = 100) {
    const targetDate = date || 'today';
    const compactDate = this._formatDateCompact(targetDate);
    const overview = await this.getOverview();
    const dataVersion = overview?.generated_at || 'unknown';
    const cachedRanking = this._getCampusWideRankingSessionCache(campusName, targetDate, limit, dataVersion);
    if (cachedRanking) {
      if (onProgress) onProgress(1, 1, cachedRanking);
      return cachedRanking;
    }

    const campusStats = await this.getCampusStatistics(campusName);
    if (!campusStats) return [];

    const buildingDetails = campusStats.buildingDetails || [];
    const totalBuildings = buildingDetails.length;
    let loadedBuildings = 0;
    const topRooms = [];

    for (const building of buildingDetails) {
      try {
        // 尝试从 details.json 加载楼栋数据（快速）
        const details = await this.getBuildingDetails(campusName, building.name);
        
        if (details && details.rooms) {
          // 从 details.json 提取房间消耗数据
          for (const roomName in details.rooms) {
            const roomData = details.rooms[roomName];
            if (roomData.balance_history) {
              const consumption = this._calculateConsumptionFromHistory(
                roomData.balance_history,
                targetDate,
                compactDate
              );
              if (consumption !== null) {
                this._insertIntoTopRooms(topRooms, {
                  roomName,
                  building: building.name,
                  campus: campusName,
                  consumption,
                  balance: roomData.current_balance || 0
                }, limit);
              }
            }
          }
        } else {
          // 回退到原来的方式：从排名缓存或加载
          let ranking = await this.getBuildingConsumptionFromRoomCache(
            campusName,
            building.name,
            targetDate
          );
          
          if (!ranking) {
            ranking = await this.getBuildingConsumptionRankingFast(
              campusName,
              building.name,
              targetDate === 'today' ? null : targetDate,
              null,
              false
            );
          }

          if (Array.isArray(ranking)) {
            ranking.forEach(r => {
              this._insertIntoTopRooms(topRooms, {
                roomName: r.roomName,
                building: building.name,
                campus: campusName,
                consumption: r.consumption || 0,
                balance: r.balance || 0
              }, limit);
            });
          } else if (ranking && ranking.data) {
            ranking.data.forEach(r => {
              this._insertIntoTopRooms(topRooms, {
                roomName: r.roomName,
                building: building.name,
                campus: campusName,
                consumption: r.consumption || 0,
                balance: r.balance || 0
              }, limit);
            });
          }
        }
      } catch (error) {
        console.warn(`加载楼栋 ${building.name} 房间数据失败:`, error);
      }

      loadedBuildings++;
      
      // 每次加载完一栋楼，触发进度回调并更新部分结果
      if (onProgress) {
        const partialSorted = this._rankTopRooms(topRooms);
        if (onProgress(loadedBuildings, totalBuildings, partialSorted) === false) {
          return partialSorted;
        }
      }
    }

    const result = this._rankTopRooms(topRooms);
    this._saveCampusWideRankingSessionCache(campusName, targetDate, limit, dataVersion, result);

    return result;
  },

  /**
   * 将房间插入到固定长度的降序 TOP N 列表，避免全校区房间全量排序。
   * @private
   */
  _insertIntoTopRooms(topRooms, room, limit) {
    if (!room || limit <= 0) return;
    const consumption = Number(room.consumption) || 0;
    const normalizedRoom = {
      ...room,
      consumption
    };

    if (topRooms.length < limit) {
      topRooms.push(normalizedRoom);
      this._bubbleTopRoomUp(topRooms, topRooms.length - 1);
      return;
    }

    if (consumption <= topRooms[topRooms.length - 1].consumption) return;

    topRooms[topRooms.length - 1] = normalizedRoom;
    this._bubbleTopRoomUp(topRooms, topRooms.length - 1);
  },

  /**
   * 将新插入的元素向前移动，保持列表按耗电量降序排列。
   * @private
   */
  _bubbleTopRoomUp(topRooms, index) {
    while (index > 0 && topRooms[index].consumption > topRooms[index - 1].consumption) {
      const prev = topRooms[index - 1];
      topRooms[index - 1] = topRooms[index];
      topRooms[index] = prev;
      index--;
    }
  },

  /**
   * 为 TOP N 列表补充排名，返回新数组避免污染缓存中的基础数据。
   * @private
   */
  _rankTopRooms(topRooms) {
    return topRooms.map((room, index) => ({
      ...room,
      rank: index + 1
    }));
  },

  /**
   * 校区 TOP N 排行榜使用 sessionStorage 缓存，避免一次会话内切换校区时重复计算。
   * @private
   */
  _getCampusWideRankingSessionCache(campusName, date, limit, dataVersion = 'unknown') {
    try {
      if (typeof sessionStorage === 'undefined') return null;
      const key = this._getCampusWideRankingSessionKey(campusName, date, limit, dataVersion);
      const cached = sessionStorage.getItem(key);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      if (!parsed || !Array.isArray(parsed.data)) return null;

      console.log(`[SessionStorage命中] 校区排行榜: ${campusName} -> ${this._formatDateCompact(date)}, TOP ${limit}`);
      return parsed.data;
    } catch (error) {
      console.warn('[SessionStorage] 读取校区排行榜缓存失败:', error);
      return null;
    }
  },

  /**
   * @private
   */
  _saveCampusWideRankingSessionCache(campusName, date, limit, dataVersion, ranking) {
    try {
      if (typeof sessionStorage === 'undefined') return;
      const key = this._getCampusWideRankingSessionKey(campusName, date, limit, dataVersion);
      sessionStorage.setItem(key, JSON.stringify({
        data: ranking,
        updatedAt: Date.now()
      }));
      console.log(`[SessionStorage保存] 校区排行榜: ${campusName} -> ${this._formatDateCompact(date)}, TOP ${limit}`);
    } catch (error) {
      console.warn('[SessionStorage] 保存校区排行榜缓存失败:', error);
    }
  },

  /**
   * @private
   */
  _getCampusWideRankingSessionKey(campusName, date, limit, dataVersion = 'unknown') {
    return `campus-wide-ranking:v1:${dataVersion}:${campusName}:${this._formatDateCompact(date)}:${limit}`;
  },

  /**
   * @private
   */
  _clearCampusWideRankingSessionCache() {
    try {
      if (typeof sessionStorage === 'undefined') return;
      const prefix = 'campus-wide-ranking:';
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(prefix)) keysToRemove.push(key);
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch (error) {
      console.warn('[SessionStorage] 清除校区排行榜缓存失败:', error);
    }
  },

  /**
   * 获取单个房间的消耗数据（支持 details.json、房间文件和缓存回退）
   * @private
   */
  async _getRoomConsumption(campusName, buildingName, roomName, date, compactDate, options = {}) {
    if (!roomName) return null;

    if (!options.skipDetailsLookup) {
      const details = await this.getBuildingDetails(campusName, buildingName);
      const roomData = details?.rooms?.[roomName];
      const consumption = this._calculateConsumptionFromHistory(
        roomData?.balance_history,
        date,
        compactDate
      );
      if (consumption !== null) return consumption;
    }

    try {
      const roomHistory = await this.getRoomHistory(campusName, buildingName, roomName);
      const consumption = this._calculateConsumptionFromHistoryArray(
        roomHistory?.history,
        date,
        compactDate
      );
      if (consumption !== null) return consumption;
    } catch (error) {
      console.warn(`获取房间 ${roomName} 历史失败:`, error);
    }

    return null;
  },

  /**
   * 获取楼栋内可比较房间的消耗统计。
   * 结果按消耗量升序保存，后续计算“打败多少房间”可用二分而不是逐个扫描。
   * @private
   */
  async _getBuildingConsumptionStats(campusName, buildingName, date, compactDate) {
    const cacheKey = this._getBuildingConsumptionStatsCacheKey(campusName, buildingName, compactDate);
    const cachedStats = this._buildingConsumptionStatsCache.get(cacheKey);
    if (cachedStats) return cachedStats;

    const stats = {
      consumptions: [],
      roomConsumptions: new Map()
    };

    const addConsumption = (roomName, roomData, consumption) => {
      if (consumption === null || consumption === undefined) return;
      const numericConsumption = Number(consumption);
      if (!Number.isFinite(numericConsumption)) return;

      stats.consumptions.push(numericConsumption);
      this._rememberRoomConsumption(stats.roomConsumptions, roomName, numericConsumption);
    };

    const cachedRanking = await this.getRankingCache(campusName, buildingName, date);
    const cachedRows = Array.isArray(cachedRanking)
      ? cachedRanking
      : (Array.isArray(cachedRanking?.data) ? cachedRanking.data : null);

    if (cachedRows && cachedRows.length > 0) {
      for (const row of cachedRows) {
        addConsumption(row.roomName, row, row.consumption);
      }
    } else {
      const details = await this.getBuildingDetails(campusName, buildingName);
      if (details?.rooms) {
        for (const [roomName, roomData] of Object.entries(details.rooms)) {
          addConsumption(
            roomName,
            roomData,
            this._calculateConsumptionFromHistory(roomData.balance_history, date, compactDate)
          );
        }
      } else {
        const buildingSummary = await this.getBuildingSummary(campusName, buildingName);
        const roomNames = Object.keys(buildingSummary?.rooms || {});
        for (const roomName of roomNames) {
          addConsumption(
            roomName,
            buildingSummary.rooms[roomName],
            await this._getRoomConsumption(
              campusName,
              buildingName,
              roomName,
              date,
              compactDate,
              { skipDetailsLookup: true }
            )
          );
        }
      }
    }

    stats.consumptions.sort((a, b) => a - b);
    stats.roomCount = stats.consumptions.length;
    this._buildingConsumptionStatsCache.set(cacheKey, stats);
    return stats;
  },

  /**
   * @private
   */
  _getBuildingConsumptionStatsCacheKey(campusName, buildingName, compactDate) {
    return `${campusName}|${buildingName}|${compactDate}`;
  },

  /**
   * @private
   */
  _rememberRoomConsumption(roomConsumptions, roomName, consumption) {
    if (!roomName) return;
    roomConsumptions.set(roomName, consumption);
  },

  /**
   * @private
   */
  _getRoomConsumptionFromStats(stats, roomName) {
    if (!stats?.roomConsumptions || !roomName) return null;
    if (!stats.roomConsumptions.has(roomName)) return null;
    return stats.roomConsumptions.get(roomName);
  },

  /**
   * @private
   */
  _hasRoomConsumptionInStats(stats, roomName) {
    if (!stats?.roomConsumptions || !roomName) return false;
    return stats.roomConsumptions.has(roomName);
  },

  /**
   * 返回升序数组中小于 value 的元素数量。
   * @private
   */
  _countLessThan(sortedValues, value) {
    let low = 0;
    let high = sortedValues.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (sortedValues[mid] < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  },

  /**
   * 从房间历史数组计算消耗量
   * @private
   */
  _calculateConsumptionFromHistoryArray(history, dateType, compactDate) {
    if (!Array.isArray(history) || history.length === 0) return null;

    // today/yesterday 转换为具体日期后匹配
    let targetDate = compactDate;

    if (dateType === 'today' || dateType === 'yesterday') {
      targetDate = this._formatDateCompact(dateType);
    }

    if (dateType === 'week') {
      // 计算最近7天的日期范围
      const today = new Date();
      const weekDates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        weekDates.push(this._dateToCompact(d));
      }

      // 筛选该范围内的数据
      const weekData = history.filter(item => weekDates.includes(item.date));
      if (weekData.length === 0) return null;

      const sum = weekData.reduce((total, item) => total + (item.consumption ?? 0), 0);
      return sum / weekData.length;
    }

    // 按日期匹配
    const targetEntry = history.find(item =>
      item.date === targetDate || item.formattedDate === dateType
    );
    return targetEntry?.consumption !== undefined && targetEntry.consumption !== null
      ? targetEntry.consumption
      : null;
  },

  /**
   * @private
   */
  _getBeatPercentageCacheKey(campusName, buildingName, roomName, compactDate) {
    return `beat-percentage:v1:${campusName}|${buildingName}|${roomName}|${compactDate}`;
  },

  /**
   * @private
   */
  _getBeatPercentageCache(cacheKey) {
    const now = Date.now();
    const memoryEntry = this._beatPercentageCache.get(cacheKey);
    if (memoryEntry) {
      if (memoryEntry.expiry > now) return memoryEntry.value;
      this._beatPercentageCache.delete(cacheKey);
    }

    try {
      if (typeof sessionStorage === 'undefined') return null;
      const cached = sessionStorage.getItem(cacheKey);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      if (!parsed || parsed.expiry <= now || !parsed.value) {
        sessionStorage.removeItem(cacheKey);
        return null;
      }

      this._beatPercentageCache.set(cacheKey, parsed);
      return parsed.value;
    } catch (error) {
      console.warn('[SessionStorage] 读取排名百分比缓存失败:', error);
      return null;
    }
  },

  /**
   * @private
   */
  _saveBeatPercentageCache(cacheKey, result) {
    const entry = {
      value: result,
      expiry: Date.now() + this.RANKING_PERCENT_TTL_MS
    };
    this._beatPercentageCache.set(cacheKey, entry);

    try {
      if (typeof sessionStorage === 'undefined') return;
      sessionStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch (error) {
      console.warn('[SessionStorage] 保存排名百分比缓存失败:', error);
    }
  },

  /**
   * @private
   */
  _clearBeatPercentageSessionCache() {
    try {
      if (typeof sessionStorage === 'undefined') return;
      const prefix = 'beat-percentage:';
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(prefix)) keysToRemove.push(key);
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch (error) {
      console.warn('[SessionStorage] 清除排名百分比缓存失败:', error);
    }
  },

  /**
   * 计算某个房间在楼栋和校区中的排名百分比
   * @param {string} campusName 校区名
   * @param {string} buildingName 楼栋名
   * @param {string} roomName 房间名
   * @param {string} date 日期类型：'today', 'yesterday', 'week', 或具体日期
   * @returns {Promise<Object>} 包含 beatBuildingPercent 和 beatCampusPercent 的对象
   */
  async calculateBeatPercentage(campusName, buildingName, roomName, date = 'today') {
    const compactDate = this._formatDateCompact(date);
    const cacheKey = this._getBeatPercentageCacheKey(campusName, buildingName, roomName, compactDate);
    const cachedResult = this._getBeatPercentageCache(cacheKey);
    if (cachedResult) return cachedResult;

    const emptyResult = {
      beatBuildingPercent: 0,
      beatCampusPercent: 0,
      buildingRoomCount: 0,
      campusRoomCount: 0,
      buildingBeaten: 0,
      campusBeaten: 0
    };

    try {
      const campusStats = await this.getCampusStatistics(campusName);
      if (!campusStats?.buildingDetails) {
        this._saveBeatPercentageCache(cacheKey, emptyResult);
        return emptyResult;
      }

      const currentBuildingStats = await this._getBuildingConsumptionStats(
        campusName,
        buildingName,
        date,
        compactDate
      );

      let currentRoomConsumption = this._getRoomConsumptionFromStats(currentBuildingStats, roomName);
      if (currentRoomConsumption === null) {
        currentRoomConsumption = await this._getRoomConsumption(
          campusName,
          buildingName,
          roomName,
          date,
          compactDate
        );
      }

      if (currentRoomConsumption === null) {
        this._saveBeatPercentageCache(cacheKey, emptyResult);
        return emptyResult;
      }

      let buildingRoomCount = 0;
      let buildingBeaten = 0;
      let campusRoomCount = 0;
      let campusBeaten = 0;

      const otherBuildings = campusStats.buildingDetails.filter(
        b => b.name !== buildingName
      );

      const results = otherBuildings.length > 0
        ? await this._poolTasks(
            otherBuildings.map(b => () =>
              this._getBuildingConsumptionStats(campusName, b.name, date, compactDate)
            ),
            6
          )
        : [];

      for (let i = 0; i < results.length; i++) {
        const building = otherBuildings[i];
        if (results[i].status === 'rejected') {
          console.warn(`跳过楼栋 ${building.name}:`, results[i].reason);
          continue;
        }
        const stats = results[i].value;
        const beatenInBuilding = this._countLessThan(stats.consumptions, currentRoomConsumption);
        campusRoomCount += stats.roomCount;
        campusBeaten += beatenInBuilding;
      }

      // 自己的楼栋：使用已加载的统计数据
      {
        const stats = currentBuildingStats;
        const beatenInBuilding = this._countLessThan(stats.consumptions, currentRoomConsumption);
        const excludesCurrentRoom = this._hasRoomConsumptionInStats(stats, roomName);
        buildingRoomCount = Math.max(0, stats.roomCount - (excludesCurrentRoom ? 1 : 0));
        buildingBeaten = beatenInBuilding;
        campusRoomCount += buildingRoomCount;
        campusBeaten += beatenInBuilding;
      }

      const result = {
        beatBuildingPercent: buildingRoomCount > 0 ? (buildingBeaten / buildingRoomCount) * 100 : 0,
        beatCampusPercent: campusRoomCount > 0 ? (campusBeaten / campusRoomCount) * 100 : 0,
        buildingRoomCount,
        campusRoomCount,
        buildingBeaten,
        campusBeaten
      };

      this._saveBeatPercentageCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[calculateBeatPercentage] 计算失败:', error);
      return emptyResult;
    }
  }
};

/**
 * 耗电量的直观类比工具
 * 将kWh转换为年轻人有感知的科技生活场景
 */
const EnergyAnalogies = {
  _analogies: [
    { min: 0, category: 'daily', icon: '📺', label: kwh => `📺 相当于bilibili自2008年以来用爱发电总量` },
    { min: 0, category: 'daily', icon: '⚛️', label: kwh => `⚛️ 实现了人体小型核聚变，靠意念维持运转` },
    { min: 0, category: 'daily', icon: '🌙', label: kwh => `🌙 开启了超级黑暗模式，连空气都不敢动` },
    { min: 0, category: 'daily', icon: '🔥', label: kwh => `🔥 靠燃烧卡路里供能，健身房看了都沉默` },
    { min: 0, category: 'daily', icon: '☀️', label: kwh => `☀️ 可能是光合作用了一天，建议检查是否为植物人` },
    { min: 0, category: 'daily', icon: '🧘', label: kwh => `🧘 达到了"电费禅"的最高境界，万物皆空` },
    { min: 0, category: 'daily', icon: '🤖', label: kwh => `🤖 永动机研发成功？中科院连夜发贺电` },
    { min: 0, category: 'daily', icon: '⚡', label: kwh => `⚡ 零碳排放达成，北极熊发来感谢信` },
    { min: 0.01, category: 'daily', icon: '📱', label: kwh => `📱 iPhone 16充满约 ${Math.round(kwh / 0.0135)} 次` },
    { min: 0.05, category: 'daily', icon: '💡', label: kwh => `💡 10W LED灯照明约 ${Math.round(kwh / 0.01)} 小时` },
    { min: 0.1, category: 'daily', icon: '☕', label: kwh => `☕ 煮约 ${Math.round(kwh / 0.05)} 杯咖啡` },
    { min: 0.1, category: 'daily', icon: '💧', label: kwh => `💧 烧开约 ${Math.round(kwh * 10)} 升水` },
    { min: 0.3, category: 'daily', icon: '💻', label: kwh => `💻 笔记本工作约 ${Math.round(kwh / 0.05)} 小时` },
    { min: 0.5, category: 'daily', icon: '📺', label: kwh => `📺 电视播放约 ${Math.round(kwh / 0.1)} 小时` },
    { min: 1, category: 'daily', icon: '🧺', label: kwh => `🧺 洗衣机洗约 ${Math.round(kwh / 0.5)} 桶衣服` },
    { min: 1.5, category: 'daily', icon: '❄️', label: kwh => `❄️ 1.5匹空调运行约 ${Math.round(kwh / 1.5)} 小时` },
    { min: 2, category: 'daily', icon: '🚲', label: kwh => `🚲 电动车骑行约 ${Math.round(kwh * 50)} 公里` },
    { min: 10, category: 'daily', icon: '🍜', label: kwh => `🍜 电饭煲煮饭约 ${Math.round(kwh / 0.8)} 锅` },
    { min: 30, category: 'daily', icon: '🏠', label: kwh => `🏠 单人公寓约 ${Math.round(kwh / 5)} 天的用电量` },
    { min: 100, category: 'daily', icon: '🏠', label: kwh => `🏠 三口之家一个月的用电量` },
    { min: 500, category: 'daily', icon: '🏘️', label: kwh => `🏘️ ${Math.round(kwh / 100)} 个三口之家一个月的用电` },

    // ========== AI/科技类 ==========
    { min: 0.001, category: 'ai', icon: '🤖', label: kwh => `🤖 ChatGPT回答约 ${Math.round(kwh / 0.00034)} 个问题` },
    { min: 0.1, category: 'ai', icon: '🧠', label: kwh => `🧠 GPT-4生成约 ${Math.round(kwh / 0.002)} 张图` },
    { min: 5, category: 'ai', icon: '🦾', label: kwh => `🦾 特斯拉Optimus工作约 ${(kwh / 0.5).toFixed(0)} 小时` },
    { min: 100, category: 'ai', icon: '🤖', label: kwh => `🤖 100台Optimus同时工作 ${(kwh / 50).toFixed(0)} 小时` },
    { min: 1000, category: 'ai', icon: '🧠', label: kwh => `🧠 DeepSeek-R1回答约 ${Math.round(kwh / 0.01)} 道高中数学题` },
    { min: 50000, category: 'ai', icon: '🧠', label: kwh => `🧠 DeepSeek-V3训练的 ${(kwh / 1087000 * 100).toFixed(2)}%` },

    // ========== 电动汽车类 ==========
    { min: 0.1, category: 'ev', icon: '🚗', label: kwh => `🚗 小米SU7跑 ${(kwh * 7).toFixed(1)} 公里` },
    { min: 5, category: 'ev', icon: '🚗', label: kwh => `🚗 小米SU7跑约 ${(kwh * 7).toFixed(0)} 公里（≈${(kwh * 7 / 300).toFixed(1)}个南京市区）` },
    { min: 40, category: 'ev', icon: '🚗', label: kwh => `🚗 小米SU7从南京开到上海（${Math.round(kwh * 7)}公里）` },
    { min: 140, category: 'ev', icon: '🚗', label: kwh => `🚗 小米SU7从南京开到北京（${Math.round(kwh * 7)}公里）` },
    { min: 500, category: 'ev', icon: '🚗', label: kwh => `🚗 小米SU7跑约 ${(kwh * 7).toFixed(0)} 公里（≈${(kwh * 7 / 1200).toFixed(1)}个南京→北京）` },
    { min: 5000, category: 'ev', icon: '🌍', label: kwh => `🌍 小米SU7绕地球跑 ${((kwh * 7) / 40000).toFixed(1)} 圈` },

    // ========== 比特币类 ==========
    { min: 5, category: 'btc', icon: '₿', label: kwh => `₿ 挖矿收益约 $${(kwh * 0.00003).toFixed(4)}` },
    { min: 20, category: 'btc', icon: '₿', label: kwh => `₿ 蚂蚁S21 Pro挖矿约 ${(kwh / 3.5).toFixed(1)} 小时` },
    { min: 100, category: 'btc', icon: '₿', label: kwh => `₿ 蚂蚁S21 Pro挖矿约 ${(kwh / 84 * 24).toFixed(1)} 小时` },
    { min: 20000, category: 'btc', icon: '₿', label: kwh => `₿ 全球比特币网络 ${(kwh / 138000000000 * 365 * 24 * 60).toFixed(2)} 秒耗电` },

    // ========== 家庭用电类（楼栋/校区级别）==========
    { min: 3000, category: 'home', icon: '🏢', label: kwh => `🏢 ${Math.round(kwh / 3000)} 栋居民楼一天的用电` },
    { min: 10000, category: 'home', icon: '🏫', label: kwh => `🏫 ${Math.round(kwh / 5000)} 栋居民楼一周的用电` },

    // ========== 数据中心类 ==========
    { min: 1000, category: 'datacenter', icon: '🖥️', label: kwh => `🖥️ 小型服务器机房运行约 ${(kwh / 500).toFixed(1)} 小时` },
    { min: 10000, category: 'datacenter', icon: '🏢', label: kwh => `🏢 中型数据中心运行约 ${(kwh / 50000).toFixed(2)} 小时` },

    // ========== 碳排放类 ==========
    { min: 1, category: 'carbon', icon: '🌳', label: kwh => `🌳 需 ${Math.round(kwh * 0.5)} 棵树吸收一天的碳排放` },
    { min: 100, category: 'carbon', icon: '🌲', label: kwh => `🌲 需 ${Math.round(kwh * 0.5)} 棵树吸收一天的碳排放` },
    { min: 1000, category: 'carbon', icon: '🏭', label: kwh => `🏭 约排放 ${(kwh * 0.5).toFixed(0)} kg CO₂` },
  ],

  get(kwh, deterministic = false) {
    if (kwh === undefined || kwh === null || kwh < 0) return null;
    
    let matches;
    if (kwh === 0) {
      matches = this._analogies.filter(a => a.min === 0);
    } else {
      matches = this._analogies.filter(a => kwh >= a.min && a.min > 0);
    }
    
    if (matches.length === 0) return null;
    
    let idx;
    if (deterministic) {
      const hash = Math.sin(kwh * 1000) * 10000;
      idx = Math.abs(Math.floor(hash)) % matches.length;
    } else {
      idx = Math.floor(Math.random() * matches.length);
    }
    
    return matches[idx].label(kwh);
  },

  getAll(kwh, max = 3) {
    if (kwh === undefined || kwh === null || kwh < 0) return [];
    
    let matches;
    if (kwh === 0) {
      matches = this._analogies.filter(a => a.min === 0);
    } else {
      matches = this._analogies.filter(a => kwh >= a.min && a.min > 0);
    }
    
    if (matches.length === 0) return [];
    
    const result = [];
    const pool = [...matches];
    for (let i = 0; i < max && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      result.push(pool[idx].label(kwh));
      pool.splice(idx, 1);
    }
    return result;
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.DataService = DataService;
  window.EnergyAnalogies = EnergyAnalogies;
}
