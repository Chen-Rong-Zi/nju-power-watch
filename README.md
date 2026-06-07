# ⚡ NJU 宿舍电费监控系统

> 帮助南京大学同学们轻松监控宿舍电费，避免突然停电的尴尬！

**🌐 在线体验**: [njupower.top](https://njupower.top)

---

## 🎯 这个系统是做什么的？

你是否经历过这些场景：
- 😱 半夜突然停电，才发现电费余额不足
- 🤔 想知道自己的用电量算多还是少
- 🏃 每次都要手动登录 epay 查电费，觉得麻烦
- 🤷‍♂️ 看到电费数字，但对"度"这个单位没有概念

**这个系统帮你解决这些问题！**

每天自动采集全校宿舍电量数据，提供：
- 📊 **个人用电趋势分析**：查看历史用电曲线，预测余额何时用完
- 🏆 **楼栋排行榜**：看看自己在楼栋里排第几，和室友对比用电习惯
- 🎨 **趣味耗电类比**：把"度"转换成"小米SU7跑XX公里"、"iPhone充XX次电"等有趣描述
- ⚠️ **智能预警**：余额不足时提前提醒，避免突然停电

---

## ✨ 核心功能

### 📱 个人房间视角
最适合日常查看自己的用电情况

- **电费趋势图**：查看过去7天/30天/全部的电量余额变化
- **用电预测**：根据历史用电习惯，预测余额何时用完
- **低余额预警**：余额不足时醒目提醒
- **充值建议**：根据用电习惯推荐充值金额
- **直观类比**：比如"今日耗电2度 ≈ iPhone充150次电 📱"

### 🏢 楼栋视角
看看自己在楼栋里排第几

- **耗电量排行榜**：楼栋内所有房间的实时排名
- **快速搜索**：输入房间号快速定位
- **用户位次卡片**：一键查看自己的排名位置
- **楼栋趋势图**：查看整个楼栋的用电趋势

### 🏫 校区视角
了解整个校区的用电情况

- **仪表盘总览**：今日总耗电、覆盖房间数、平均消耗
- **楼栋排行榜**：各楼栋用电量对比
- **趋势图表**：校区整体耗电趋势
- **节能建议**：基于数据分析给出智能建议

---

## 🌟 特色功能：耗电量直观类比

把抽象的"度"转换成你能感知的场景：

```
0度   → 📺 相当于bilibili自2008年以来用爱发电总量
1度   → 📱 iPhone充74次 · 🧺 洗衣2桶 · 🚲 电动车骑50公里
100度 → 🏠 三口之家一个月用电 · 🚗 SU7从南京开到上海
```

**7个领域的趣味类比**：
- 🏠 日常生活：手机充电、煮咖啡、空调运行...
- 🤖 AI科技：ChatGPT问答、DeepSeek训练...
- 🚗 电动汽车：小米SU7跑多少公里
- ₿ 比特币：挖矿收益与耗电
- 🌳 碳排放：需要多少棵树吸收

每次刷新都会随机显示不同的类比，增加趣味性！

---

## 🛠 技术实现

```
每日自动采集 → 数据聚合 → 静态JSON文件 → 前端可视化
```

- **数据采集**：通过 GitHub Actions 每天自动登录 NJU epay 系统采集数据
- **智能存储**：分层聚合（校区→楼栋→房间），查询快速、存储高效
- **纯前端**：HTML/CSS/JS，无需后端，部署简单
- **数据缓存**：使用 IndexedDB 缓存，二次访问秒开

---

## 📖 AI4SE 开发记录

本项目的开发过程同时也是 AI4SE（AI-Supported Software Engineering）工具链的实践记录，详见 `ai4se/` 目录：

- **[ai4se/REFLECTION.md](ai4se/REFLECTION.md)** — 完整开发历程反思（6 个阶段），涵盖 Speckit 批量实现、Open Design 前端增强、Brainstorming vs Spec 质量对比、Agent 系统性盲区总结等
- **[ai4se/AGENT_LOG.md](ai4se/AGENT_LOG.md)** — AI 协作过程日志，记录关键决策节点与 human-in-the-loop 干预
- **[ai4se/SPEC_PROCESS.md](ai4se/SPEC_PROCESS.md)** — Spec 编写与冷启动验证记录，包括 5 个 brainstorming 节点的追问链和采纳/推翻记录
- **[ai4se/docker/](ai4se/docker/)** — Docker 部署配置（多阶段 Nginx 构建 + 开发模式 Python 服务器）

> 该项目作为南京大学 AI4SE 课程的实践案例，所有开发均使用 Claude Code + Superpowers 技能栈完成。

## 📂 项目结构

```
docs/                      # 前端静态页面
├── index.html             # 首页导航
├── room-view.html         # 个人房间视角
├── building-view.html     # 楼栋视角
├── campus-view.html       # 校区视角
├── js/
│   ├── data-service.js    # 数据服务（缓存、加载、类比转换）
│   └── indexeddb-service.js
└── database/summaries/    # 聚合数据文件

scripts/                   # 数据处理脚本
├── aggregate_data.py      # 数据聚合
└── ...

.github/workflows/         # GitHub Actions 自动化采集
```

---

## 🚀 如何使用

### 在线使用
直接访问 [njupower.top](https://njupower.top)，选择你的校区、楼栋、房间即可

### 本地运行
```bash
# 克隆项目
git clone https://github.com/Chen-Rong-Zi/nju-power-watch.git

# 本地预览
cd nju-power-watch
python -m http.server 8000 --directory docs

# 浏览器打开 http://localhost:8000
```

---

## 📊 数据说明

- **数据来源**：NJU epay 系统（南京大学电费缴费平台）
- **更新频率**：每日自动采集
- **覆盖范围**：4个校区（仙林、鼓楼、浦口、苏州），106栋楼，16,644个房间
- **数据安全**：仅采集电量余额和消耗数据，不涉及个人信息

---

## 🤝 贡献

欢迎同学们提出建议和改进：
- 🐛 发现Bug？[提Issue](https://github.com/Chen-Rong-Zi/nju-power-watch/issues)
- 💡 有新想法？欢迎讨论
- 🔧 想改进代码？提Pull Request

---

## 📄 许可证

MIT License - 开源免费使用

---

<p align="center">
  用 ❤️ 和 ⚡ 打造，帮助同学们更好地管理宿舍电费
</p>
