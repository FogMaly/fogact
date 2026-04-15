# Changelog

## [1.1.0] - 2026-04-06

### 代码中心后端迭代

#### 新增功能
- **数据库模型扩展**
  - 添加激活码完整字段：name, category, enabled, quota, billing, serviceConfig, validity, riskControl, technical
  - 新增 `filterByCategory()` 方法按分类筛选
  - 新增 `filterByService()` 方法按服务筛选
  - 新增 `getStatistics()` 方法获取统计数据
  - 新增 `getTopConsumers()` 方法获取高消耗排行
  - 新增 `getExpiringSoon()` 方法获取即将过期代码
  - 新增 `batchCreate()` 方法批量创建激活码

- **后端 API 路由**
  - `GET /api/code-center/statistics` - 获取代码中心统计数据
  - `GET /api/code-center/top-consumers` - 获取高消耗排行榜
  - `GET /api/code-center/expiring-soon` - 获取即将过期的代码
  - `POST /api/code-center/batch-create` - 批量创建激活码
  - `GET /api/code-center/filter` - 高级筛选（按分类、服务、状态）
  - `PUT /api/code-center/codes/:id` - 更新代码配置

- **前端页面**
  - 代码中心入口页面 (`/frontend/code-center/index.html`)
  - 代码看板 (`/frontend/code-center/dashboard.html`)
  - 码值管理 (`/frontend/code-center/management.html`)
  - Codex 生成器 (`/frontend/code-center/codex-generator.html`)

#### 改进
- 更新示例数据，包含完整的代码中心字段
- 添加设计系统文档 (`/docs/DESIGN_SYSTEM.md`)
- 添加迭代报告 (`/docs/CODE_CENTER_ITERATION.md`)
- 添加快速启动指南 (`/docs/CODE_CENTER_QUICKSTART.md`)

#### 技术细节
- 遵循 "Architectural Intelligence" 设计系统
- 无边框设计，通过背景色层次定义空间
- 双字体系统：Manrope (标题) + Inter (正文)
- 高密度表格优化
- Glassmorphism 浮动元素效果

---

## [1.0.0] - 2026-04-05

### 初始版本
- CLI 激活工具
- Web 管理后台
- 用户前端界面
- 基础 API 功能
