'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function loadFloorAnalytics() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'docs', 'js', 'floor-analytics.js'), 'utf8');
  return new Function(src + '\n; return FloorAnalytics;')();
}

function makeRoom(name, consumption) {
  return {
    roomName: name, room: name, campus: 'campus', building: 'bldg',
    consumption: consumption === undefined ? null : consumption,
    balance: consumption === undefined ? null : 10,
    rank: consumption === undefined ? null : 5,
    is_noRoom: consumption === undefined
  };
}

const FA = loadFloorAnalytics();

test('calculateFloorStats: withDataCount=有数据房间数, totalCount=全部房间数', () => {
  const rooms = [
    makeRoom('A101', 1.0), makeRoom('A102', 2.0), makeRoom('A103'),
    makeRoom('B201'), makeRoom('B202'),
    makeRoom('C301', 3.0),
  ];
  const floorGroups = {
    groups: { '1': ['A101', 'A102', 'A103'], '2': ['B201', 'B202'], '3': ['C301'] },
    unknown: []
  };
  const { floors } = FA.calculateFloorStats(rooms, floorGroups);
  assert.strictEqual(floors[1].withDataCount, 2);
  assert.strictEqual(floors[1].totalCount, 3);
  assert.strictEqual(floors[2].withDataCount, 0);
  assert.strictEqual(floors[2].totalCount, 2);
  assert.strictEqual(floors[3].withDataCount, 1);
  assert.strictEqual(floors[3].totalCount, 1);
});

test('calculateFloorStats: 消耗统计只基于有数据房间', () => {
  const rooms = [
    makeRoom('A101', 1.0), makeRoom('A102', 3.0), makeRoom('A103'),
  ];
  const floorGroups = { groups: { '1': ['A101', 'A102', 'A103'] }, unknown: [] };
  const { floors } = FA.calculateFloorStats(rooms, floorGroups);
  assert.strictEqual(floors[1].totalConsumption, 4.0);
  assert.strictEqual(floors[1].avgConsumption, 2.0);
  assert.strictEqual(floors[1].maxConsumption, 3.0);
  assert.strictEqual(floors[1].minConsumption, 1.0);
});

test('calculateFloorStats: 0 数据楼层消耗统计全 0', () => {
  const rooms = [makeRoom('B201'), makeRoom('B202')];
  const floorGroups = { groups: { '2': ['B201', 'B202'] }, unknown: [] };
  const { floors } = FA.calculateFloorStats(rooms, floorGroups);
  assert.strictEqual(floors[2].withDataCount, 0);
  assert.strictEqual(floors[2].totalConsumption, 0);
  assert.strictEqual(floors[2].avgConsumption, 0);
});

test('calculateFloorStats: unknown 楼层同样口径', () => {
  const rooms = [makeRoom('X1', 1.0), makeRoom('X2')];
  const floorGroups = { groups: {}, unknown: ['X1', 'X2'] };
  const { floors, sortedFloors } = FA.calculateFloorStats(rooms, floorGroups);
  assert.strictEqual(floors.unknown.withDataCount, 1);
  assert.strictEqual(floors.unknown.totalCount, 2);
  assert.deepStrictEqual(sortedFloors, ['unknown']);
});

test('buildDisplayOrder: 降序时数据在前暂无数据末尾', () => {
  // 输入按消耗降序（调用方契约：buildDisplayOrder 不排序，直接取加载顺序）
  const rooms = [makeRoom('C', 3.0), makeRoom('D', 2.0), makeRoom('A', 1.0), makeRoom('B')];
  const order = FA.buildDisplayOrder(rooms, true);
  assert.deepStrictEqual(order.map(r => r.roomName), ['C', 'D', 'A', 'B']);
});

test('buildDisplayOrder: 升序时数据段反转暂无数据仍末尾', () => {
  // 输入按消耗降序，升序 = 数据段反转
  const rooms = [makeRoom('A', 3.0), makeRoom('D', 2.0), makeRoom('C', 1.0), makeRoom('B')];
  const order = FA.buildDisplayOrder(rooms, false);
  assert.deepStrictEqual(order.map(r => r.roomName), ['C', 'D', 'A', 'B']);
});

function displayOrderOf(names) {
  return names.map(n => ({ roomName: n, is_noRoom: n.startsWith('N') }));
}

test('computePageSlices: 数据页干净，暂无数据只占尾页', () => {
  const order = displayOrderOf(['D1', 'D2', 'D3', 'D4', 'D5', 'N1', 'N2']);
  const p1 = FA.computePageSlices(order, 1, 2);
  assert.strictEqual(p1.totalPages, 4);
  assert.deepStrictEqual(p1.pageRankings.map(r => r.roomName), ['D1', 'D2']);
  assert.deepStrictEqual(p1.pageNoDataRooms, []);
  const p3 = FA.computePageSlices(order, 3, 2);
  assert.deepStrictEqual(p3.pageRankings.map(r => r.roomName), ['D5']);
  assert.deepStrictEqual(p3.pageNoDataRooms, []);
  const p4 = FA.computePageSlices(order, 4, 2);
  assert.deepStrictEqual(p4.pageRankings, []);
  assert.deepStrictEqual(p4.pageNoDataRooms.map(r => r.roomName), ['N1', 'N2']);
});

test('computePageSlices: 页码越界被钳制', () => {
  const order = displayOrderOf(['D1', 'D2', 'N1']);
  const p = FA.computePageSlices(order, 99, 2);
  assert.strictEqual(p.totalPages, 2);
});

test('computePageSlices: 全部暂无数据时只有尾页', () => {
  const order = displayOrderOf(['N1', 'N2', 'N3']);
  const p = FA.computePageSlices(order, 1, 2);
  assert.strictEqual(p.totalPages, 2);
  assert.deepStrictEqual(p.pageRankings, []);
  assert.deepStrictEqual(p.pageNoDataRooms.map(r => r.roomName), ['N1', 'N2']);
});

test('filterRoomsByFloors: 按楼层过滤统一列表（含暂无数据）', () => {
  const rooms = [makeRoom('A101', 1.0), makeRoom('A102'), makeRoom('B201', 2.0)];
  const floorGroups = { groups: { '1': ['A101', 'A102'], '2': ['B201'] }, unknown: [] };
  const selected = new Set([1]);
  const out = FA.filterRoomsByFloors(rooms, floorGroups, selected);
  assert.deepStrictEqual(out.map(r => r.roomName), ['A101', 'A102']);
});

test('filterRoomsByFloors: null 选中返回原列表', () => {
  const rooms = [makeRoom('A101', 1.0), makeRoom('A102')];
  const floorGroups = { groups: { '1': ['A101', 'A102'] }, unknown: [] };
  const out = FA.filterRoomsByFloors(rooms, floorGroups, null);
  assert.strictEqual(out, rooms);
});

test('filterRoomsByFloors: unknown 楼层选择', () => {
  const rooms = [makeRoom('A101', 1.0), makeRoom('X1')];
  const floorGroups = { groups: { '1': ['A101'] }, unknown: ['X1'] };
  const out = FA.filterRoomsByFloors(rooms, floorGroups, new Set(['unknown']));
  assert.deepStrictEqual(out.map(r => r.roomName), ['X1']);
});
