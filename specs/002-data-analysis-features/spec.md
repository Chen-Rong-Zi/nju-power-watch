# Feature Specification: Data Analysis Features

**Feature**: 002-data-analysis-features  
**Date**: 2026-05-17  
**Status**: Draft  
**Priority**: High  

## Overview

Add comprehensive data analysis and visualization features to the existing NJU electricity data viewer. These features will enable users to gain insights from electricity consumption patterns, predict future usage, and promote energy-saving behaviors.

## User Stories

### P1 - Core Analytics (Must Have)

#### US1: Smart Electricity Warning System
**As a** student living in a dormitory  
**I want** to receive intelligent warnings about low electricity balance  
**So that** I can recharge before running out of electricity  

**Acceptance Criteria**:
- Display red warning for rooms with balance < 10 kWh
- Display orange warning for rooms predicted to run out within 3 days
- Display yellow warning for rooms predicted to run out within 7 days
- Detect abnormal consumption patterns (sudden spikes or drops)
- Show warning list on dashboard homepage
- Support filtering by warning level
- Click warning item to view room details

**Priority**: P1  
**Dependencies**: None (independent)  

---

#### US2: Building Electricity Ranking
**As a** student curious about my electricity usage  
**I want** to see how my room compares to others in my building  
**So that** I can understand my relative consumption level  

**Acceptance Criteria**:
- Display top 10 "High Consumption" rooms (highest daily average)
- Display top 10 "Energy Savers" rooms (lowest daily average)
- Display top 10 "Low Balance" rooms (lowest current balance)
- Display top 10 "Sudden Growth" rooms (fastest consumption growth in last 7 days)
- Support switching time range (7 days, 30 days)
- Click room to view details
- Bar chart or horizontal bar visualization

**Priority**: P1  
**Dependencies**: None (independent)  

---

#### US3: Floor Electricity Heatmap
**As a** building manager  
**I want** to see electricity consumption distribution by floor  
**So that** I can identify floors with unusual consumption patterns  

**Acceptance Criteria**:
- Extract floor number from room_name (e.g., "910" → floor 9)
- Calculate average consumption per floor
- Color mapping: green (saving) → yellow (normal) → red (high consumption)
- Display 2D floor heatmap with color blocks
- Mouse hover shows floor details (average balance, room count)
- Click floor to expand all rooms on that floor

**Priority**: P1  
**Dependencies**: None (independent)  

---

### P2 - Enhanced Analytics (Should Have)

#### US4: Multi-Room Trend Comparison
**As a** student wanting to compare electricity usage  
**I want** to select multiple rooms and compare their trends  
**So that** I can analyze differences with roommates or other rooms  

**Acceptance Criteria**:
- Allow user to select 2-5 rooms for comparison
- Display multiple trend lines on same chart
- Show difference statistics (daily consumption diff, balance diff)
- Support legend toggle for each room
- Export comparison report (optional)

**Priority**: P2  
**Dependencies**: US2 (reuse room selection UI patterns)  

---

#### US5: Smart Recharge Suggestion
**As a** student planning my electricity budget  
**I want** to receive intelligent recharge suggestions  
**So that** I can plan my recharges efficiently  

**Acceptance Criteria**:
- Calculate estimated days until empty based on historical consumption
- Consider seasonal factors (higher usage in summer for AC)
- Suggest recharge amount for target duration (e.g., "Recharge 200 kWh for ~45 days")
- Reverse calculation: input days → suggest amount
- Display on room detail page
- Show cost estimation if price per kWh is known

**Priority**: P2  
**Dependencies**: US1 (reuse prediction algorithms)  

---

#### US6: Usage Pattern Recognition
**As a** student curious about my electricity habits  
**I want** to see my usage pattern analysis  
**So that** I can understand when and how I use electricity  

**Acceptance Criteria**:
- Compare weekday vs weekend consumption
- Detect empty rooms (continuous low consumption)
- Detect abnormal peaks (sudden consumption spike)
- Label rooms with characteristics: "High Energy", "Energy Saver", "Night Active", etc.
- Display pattern radar chart showing usage characteristics
- Show pattern tags on room detail page

**Priority**: P2  
**Dependencies**: None (independent)  

---

### P3 - Advanced Analytics (Nice to Have)

#### US7: Campus/Building Dashboard
**As a** campus administrator  
**I want** to see macro-level electricity statistics  
**So that** I can monitor overall campus energy usage  

**Acceptance Criteria**:
- Campus comparison: which campus is most energy-efficient?
- Building comparison: ranking within same campus
- Trend analysis: whole campus electricity trend
- Multi-level drill-down: campus → building → floor → room
- Display total consumption, average balance, warning count per level
- Support date range filtering

**Priority**: P3  
**Dependencies**: US2, US3 (reuse ranking and heatmap components)  

---

#### US8: Electricity Cost Prediction
**As a** student budgeting for the semester  
**I want** to predict my monthly electricity cost  
**So that** I can plan my expenses  

**Acceptance Criteria**:
- Accept electricity price input (e.g., 0.5 yuan/kWh)
- Predict monthly cost based on historical consumption
- Predict semester total cost
- Show monthly cost trend chart
- Provide energy-saving suggestions to reduce cost

**Priority**: P3  
**Dependencies**: US5 (reuse prediction algorithms)  

---

#### US9: Anomaly Alert Subscription
**As a** concerned student  
**I want** to subscribe to alerts for my room  
**So that** I receive notifications when anomalies occur  

**Acceptance Criteria**:
- User can subscribe to specific rooms
- Generate alert when detecting anomalies
- Support Web Push notifications (browser notifications)
- Subscription management page
- Alert history log
- Customizable alert thresholds

**Priority**: P3  
**Dependencies**: US1 (reuse warning detection logic)  

---

#### US10: Energy Saving Challenge & Achievement System
**As a** competitive student  
**I want** to earn badges for saving electricity  
**So that** I feel motivated to reduce consumption  

**Acceptance Criteria**:
- Achievement badges:
  - "Energy Saver": daily average < 2 kWh for 30 days
  - "Warning Expert": successfully predicted low balance and recharged
  - "Comparison Champion": usage below building average
- Energy saving challenges:
  - "This month 20% less than last month" → earn badge
- Display achievement badges on profile
- Leaderboard for challenges
- Social sharing capability (optional)

**Priority**: P3  
**Dependencies**: US2, US6 (reuse ranking and pattern recognition)  

---

## Clarifications

### Data Sources
- All analysis performed client-side using existing JSON data
- No additional backend required
- Leverage hierarchical aggregation structure (overview → campus → building → room)

### Performance Requirements
- Initial load < 2 seconds for dashboard
- Lazy loading for large datasets (campus/building level)
- Client-side caching for frequently accessed data
- Progressive enhancement from basic to advanced features

### Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive design
- No IE11 support required

### Visualization Libraries
- Chart.js (already used) for line charts, bar charts
- ECharts for heatmaps, radar charts, maps (to be added)
- Keep bundle size reasonable (< 500KB additional)

---

## Out of Scope

- Backend server or database changes
- User authentication system
- Real-time WebSocket updates
- Machine learning models requiring server-side processing
- Integration with payment systems for recharging
- Historical data older than what's in balance_history

---

## Success Metrics

- Dashboard engagement: > 50% of users visit analytics pages
- Warning effectiveness: > 80% of warnings result in user action
- Energy savings: Average consumption decreases by 10% after 3 months
- User satisfaction: > 4.0/5.0 rating in feedback
- Performance: All pages load < 3 seconds on 3G network
