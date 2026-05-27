/**
 * IndexedDB 缓存服务
 * 封装 IndexedDB 为简洁的 key-value 存储，替代 localStorage
 * 优势：无容量限制、异步不阻塞主线程、存储原生 JS 对象
 */
const IDB = {
  _db: null,
  DB_NAME: 'ElecCache',
  STORE_NAME: 'cache',
  DB_VERSION: 2,

  /**
   * 初始化数据库
   */
  async init() {
    if (this._db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Version 2: 清除旧缓存（旧缓存以房间ID为键，迁移后改用房间名）
        if (event.oldVersion < 2) {
          if (db.objectStoreNames.contains(this.STORE_NAME)) {
            db.deleteObjectStore(this.STORE_NAME);
          }
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        } else if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this._db = event.target.result;
        console.log('[IndexedDB] 数据库已初始化');
        resolve();
      };

      request.onerror = (event) => {
        console.error('[IndexedDB] 数据库初始化失败:', event.target.error);
        reject(event.target.error);
      };
    });
  },

  /**
   * 确保数据库已初始化
   */
  async _ensureDB() {
    if (!this._db) {
      await this.init();
    }
    return this._db;
  },

  /**
   * 读取缓存
   * @param {string} key 缓存键
   * @returns {any|null} 缓存值，不存在则返回 null
   */
  async get(key) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };

      request.onerror = () => {
        console.warn('[IndexedDB] 读取失败:', key, request.error);
        resolve(null);
      };
    });
  },

  /**
   * 写入缓存
   * @param {string} key 缓存键
   * @param {any} value 缓存值（原生 JS 对象，无需序列化）
   */
  async set(key, value) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.put({
        key: key,
        value: value,
        updatedAt: Date.now()
      });

      request.onsuccess = () => resolve(true);

      request.onerror = () => {
        console.warn('[IndexedDB] 写入失败:', key, request.error);
        resolve(false);
      };
    });
  },

  /**
   * 删除缓存
   * @param {string} key 缓存键
   */
  async delete(key) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  },

  /**
   * 清空所有缓存
   */
  async clear() {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[IndexedDB] 已清空所有缓存');
        resolve(true);
      };

      request.onerror = () => {
        console.warn('[IndexedDB] 清空失败:', request.error);
        resolve(false);
      };
    });
  },

  /**
   * 获取所有缓存键
   * @returns {string[]}
   */
  async keys() {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });
  },

  /**
   * 获取缓存统计信息
   * @returns {Object} 各类缓存的数量和大小
   */
  async getStats() {
    const db = await this._ensureDB();
    const stats = {
      ranking: { count: 0, size: 0 },
      room: { count: 0, size: 0 },
      roomsList: { count: 0, size: 0 },
      campus: { count: 0, size: 0 },
      total: { count: 0, size: 0 }
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const key = cursor.value.key;
          const size = JSON.stringify(cursor.value).length * 2; // 估算字节大小
          stats.total.count++;
          stats.total.size += size;

          if (key.includes('耗电排序')) {
            stats.ranking.count++;
            stats.ranking.size += size;
          } else if (key.includes('房间列表')) {
            stats.roomsList.count++;
            stats.roomsList.size += size;
          } else if (key.includes('校区耗电')) {
            stats.campus.count++;
            stats.campus.size += size;
          } else {
            stats.room.count++;
            stats.room.size += size;
          }

          cursor.continue();
        } else {
          resolve(stats);
        }
      };

      request.onerror = () => resolve(stats);
    });
  },

  /**
   * 批量写入（事务内）
   * @param {Array<{key: string, value: any}>} entries 键值对数组
   */
  async batchSet(entries) {
    if (!entries || entries.length === 0) return;

    const db = await this._ensureDB();
    const now = Date.now();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);

      for (const entry of entries) {
        store.put({
          key: entry.key,
          value: entry.value,
          updatedAt: now
        });
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn('[IndexedDB] 批量写入失败:', tx.error);
        resolve(false);
      };
    });
  }
};
