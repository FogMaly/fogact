# 代码中心后端迭代 - 快速启动指南

## 🎉 迭代完成

已成功完成代码中心后端迭代，所有功能已就绪。

## 📦 已完成的内容

### 1. 数据库扩展
- ✅ 扩展激活码数据模型（配额、计费、服务配置、风控等）
- ✅ 新增统计分析方法
- ✅ 批量操作支持
- ✅ 高级筛选功能

### 2. 前端页面
- ✅ 代码看板 (`dashboard.html`)
- ✅ 码值管理 (`management.html`)
- ✅ Codex 生成器 (`codex-generator.html`)
- ✅ 代码中心入口 (`index.html`)

### 3. 后端 API
- ✅ 统计数据 API
- ✅ 高消耗排行 API
- ✅ 即将过期提醒 API
- ✅ 批量创建 API
- ✅ 高级筛选 API
- ✅ 代码更新 API

## 🚀 启动服务

```bash
cd /opt/cliproxy-activator
npm run web
```

服务将在 http://localhost:34010 启动

## 🔗 访问地址

1. **管理后台登录**: http://localhost:34010/admin-login.html
   - 默认密码: `admin123`

2. **代码中心入口**: http://localhost:34010/code-center/
   - 代码看板: http://localhost:34010/code-center/dashboard.html
   - 码值管理: http://localhost:34010/code-center/management.html
   - Codex 生成: http://localhost:34010/code-center/codex-generator.html

## 📡 API 端点

### 统计与分析
```bash
# 获取统计数据
GET /api/code-center/statistics

# 高消耗排行（默认前10）
GET /api/code-center/top-consumers?limit=10

# 即将过期（默认7天内）
GET /api/code-center/expiring-soon?days=7
```

### 代码管理
```bash
# 批量创建
POST /api/code-center/batch-create
Content-Type: application/json
{
  "count": 10,
  "template": {
    "service": "Claude Code",
    "category": "高级版"
  }
}

# 高级筛选
GET /api/code-center/filter?category=高级版&service=Claude%20Code&status=已使用

# 更新代码
PUT /api/code-center/codes/:id
Content-Type: application/json
{
  "enabled": false,
  "quota": { "dailyLimit": 10000 }
}
```

## 📊 示例数据

系统已预置3个示例激活码：
- **CP-9821-XQ-001**: Alpha Node Premium (高级版，已使用)
- **CP-1104-LT-992**: Beta Storage Instance (企业版，已禁用)
- **VIP-992-CLAUDE**: VIP Claude Premium (高级版，已使用)

## 🎨 设计系统

遵循 "Architectural Intelligence" 设计理念：
- 无边框设计（背景色层次）
- 双字体系统（Manrope + Inter）
- 高密度表格优化
- Glassmorphism 效果

详见: `/opt/cliproxy-activator/docs/DESIGN_SYSTEM.md`

## 📝 完整文档

详细的迭代报告: `/opt/cliproxy-activator/docs/CODE_CENTER_ITERATION.md`

## ✨ 核心功能

1. **实时监控**: 查看激活码使用情况、配额消耗、过期提醒
2. **批量管理**: 批量创建、启用、禁用激活码
3. **高级筛选**: 按分类、服务、状态、时间范围筛选
4. **配额控制**: 每日限额、周期限额、总配额管理
5. **风控管理**: 设备数限制、并发限制、地理锁定
6. **统计分析**: 消耗趋势、高消耗排行、服务占比

## 🔧 技术栈

- **后端**: Node.js (原生 HTTP)
- **数据存储**: JSON 文件
- **前端**: 原生 HTML/CSS/JavaScript
- **设计**: Tailwind CSS (CDN)

---

**准备就绪！** 运行 `npm run web` 即可开始使用代码中心。
