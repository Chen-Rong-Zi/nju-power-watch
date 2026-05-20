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

  // 缓存
  _overviewCache: null,
  _campusCache: new Map(),
  _buildingCache: new Map(),
  _roomCache: new Map(),

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
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.DataService = DataService;
}
