# CLIProxy Activator - 路径结构

## 访问地址

### 用户端
- **URL**: http://localhost:34010/user/
- **文件位置**: `/opt/cliproxy-activator/frontend/user/`
- **功能**: 用户仪表板、使用量监控、API Key 管理

### 管理端
- **URL**: http://localhost:34010/admin/
- **文件位置**: `/opt/cliproxy-activator/frontend/admin/`
- **功能**: 用户管理、激活码管理、系统统计
- **默认密码**: `admin123` (可通过环境变量 `ADMIN_PASSWORD` 修改)

## API 端点

### 管理端 API
- `POST /api/login` - 管理员登录
- `POST /api/logout` - 管理员登出
- `GET /api/check-auth` - 检查认证状态
- `GET /api/users` - 获取用户列表
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户
- `GET /api/codes` - 获取激活码列表
- `POST /api/codes` - 创建激活码
- `PUT /api/codes/:id` - 更新激活码
- `DELETE /api/codes/:id` - 删除激活码
- `GET /api/stats` - 获取系统统计
- `GET /api/activity` - 获取活动日志

### 用户端 API
- `GET /user/api/v1/me` - 获取当前用户信息
- `GET /user/api/v1/usage/history` - 获取使用历史
- `GET /user/api/v1/usage/model-trends` - 获取模型使用趋势
- `GET /user/api/v1/announcements` - 获取公告
- `POST /api/verify` - 验证 API Key

## 文件结构

```
/opt/cliproxy-activator/
├── frontend/
│   ├── admin/
│   │   ├── index.html              # 管理后台主页
│   │   └── admin-panel-v2.js       # 管理后台脚本
│   ├── user/
│   │   ├── index.html              # 用户前端主页
│   │   └── assets/                 # 用户前端资源
│   └── index.html                  # 根页面
├── bin/
│   └── web-server.js               # Web 服务器
└── lib/
    └── services/
        └── database.js             # 数据库服务
```

## 配色方案

### 统一配色（与用户端一致）
- **浅色模式背景**: `hsl(210, 40%, 98%)`
- **深色模式背景**: `hsl(240, 10%, 3.9%)`
- **主色调**: `hsl(210, 100%, 50%)` - 蓝色
- **卡片背景**: 白色/深灰
- **圆角**: 1rem-1.5rem

## 启动服务

```bash
cd /opt/cliproxy-activator
node bin/web-server.js
```

服务将在端口 34010 上启动。

## 环境变量

- `PORT` - 服务端口（默认: 34010）
- `ADMIN_PASSWORD` - 管理员密码（默认: admin123）
