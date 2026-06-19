# 代码中心 - 快速参考指南

## 🚀 服务管理

### 启动服务
```bash
cd /opt/fogact
node bin/web-server.js > logs/web-server.log 2>&1 &
```

### 停止服务
```bash
# 使用端口
lsof -ti:34010 | xargs kill -9

# 或使用进程名
pkill -f web-server.js
```

### 查看日志
```bash
tail -f logs/web-server.log
```

### 检查状态
```bash
ps aux | grep web-server.js
curl -s http://localhost:34010/api/check-auth
```

---

## 🌐 访问地址

| 界面 | URL | 密码 |
|------|-----|------|
| 管理后台 | http://localhost:34010/admin-login.html | admin123 |
| 代码中心 | http://localhost:34010/code-center/ | - |
| 代码看板 | http://localhost:34010/code-center/dashboard.html | - |
| 码值管理 | http://localhost:34010/code-center/management.html | - |
| Codex 生成 | http://localhost:34010/code-center/codex-generator.html | - |
| 用户门户 | http://localhost:34010/user/ | - |

---

## 📡 API 快速测试

### 1. 登录
```bash
curl -X POST http://localhost:34010/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}' \
  -c cookies.txt
```

### 2. 获取统计
```bash
curl http://localhost:34010/api/code-center/statistics \
  -b cookies.txt
```

### 3. 批量创建
```bash
curl -X POST http://localhost:34010/api/code-center/batch-create \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "count": 5,
    "template": {
      "service": "Claude Code",
      "category": "高级版"
    }
  }'
```

### 4. 高级筛选
```bash
curl "http://localhost:34010/api/code-center/filter?category=高级版&service=Claude%20Code" \
  -b cookies.txt
```

### 5. 高消耗排行
```bash
curl "http://localhost:34010/api/code-center/top-consumers?limit=10" \
  -b cookies.txt
```

### 6. 即将过期
```bash
curl "http://localhost:34010/api/code-center/expiring-soon?days=7" \
  -b cookies.txt
```

---

## 📊 API 端点列表

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/login` | 登录 |
| GET | `/api/code-center/statistics` | 统计数据 |
| GET | `/api/code-center/top-consumers` | 高消耗排行 |
| GET | `/api/code-center/expiring-soon` | 即将过期 |
| POST | `/api/code-center/batch-create` | 批量创建 |
| GET | `/api/code-center/filter` | 高级筛选 |
| PUT | `/api/code-center/codes/:id` | 更新代码 |
| GET | `/api/codes` | 获取所有代码 |
| POST | `/api/codes` | 创建单个代码 |
| DELETE | `/api/codes/:id` | 删除代码 |

---

## 🗂️ 项目结构

```
/opt/fogact/
├── bin/
│   └── web-server.js          # Web 服务器 (842 行)
├── lib/
│   └── services/
│       └── database.js         # 数据库服务 (514 行)
├── frontend/
│   └── code-center/
│       ├── index.html          # 入口页面
│       ├── dashboard.html      # 代码看板
│       ├── management.html     # 码值管理
│       └── codex-generator.html # Codex 生成器
├── data/
│   ├── users.json              # 用户数据
│   └── codes.json              # 激活码数据
├── docs/                       # 文档目录 (33 个文档)
└── logs/                       # 日志目录
```

---

## 📝 数据模型

### 激活码字段
```javascript
{
  id: string,
  code: string,
  name: string,
  service: "Claude Code" | "Codex",
  category: string,
  status: "未使用" | "已使用" | "已过期",
  enabled: boolean,

  quota: {
    total: number,
    used: number,
    dailyLimit: number,
    dailyUsed: number,
    periodDays: number,
    periodLimit: number
  },

  billing: {
    mode: "预付费" | "后付费",
    balance: number
  },

  serviceConfig: {
    providerGroup: string,
    routingStrategy: string,
    autoFailover: boolean
  },

  validity: {
    type: "固定天数" | "指定日期",
    days: number,
    activationCountdown: number
  },

  riskControl: {
    maxDevices: number,
    maxConcurrent: number,
    geoLock: string[],
    ipBinding: boolean
  },

  technical: {
    region: string,
    instanceId: string
  }
}
```

---

## 🔧 常见问题

### Q: 服务无法启动？
```bash
# 检查端口占用
lsof -i:34010

# 查看错误日志
tail -50 logs/web-server.log

# 检查语法错误
node -c bin/web-server.js
node -c lib/services/database.js
```

### Q: API 返回 401 未授权？
```bash
# 重新登录获取 session
curl -X POST http://localhost:34010/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}' \
  -c cookies.txt
```

### Q: 如何查看所有激活码？
```bash
curl http://localhost:34010/api/codes -b cookies.txt | jq '.'
```

### Q: 如何重置数据？
```bash
# 删除数据文件
rm data/codes.json data/users.json

# 重启服务（会自动初始化示例数据）
pkill -f web-server.js
node bin/web-server.js > logs/web-server.log 2>&1 &
```

---

## 📚 完整文档

- **最终交付**: `docs/FINAL_DELIVERY.md`
- **API 参考**: `docs/API_REFERENCE.md`
- **快速启动**: `docs/CODE_CENTER_QUICKSTART.md`
- **设计系统**: `docs/DESIGN_SYSTEM.md`
- **迭代报告**: `docs/CODE_CENTER_ITERATION.md`
- **重启报告**: `RESTART_SUCCESS.md`

---

## ✨ 版本信息

- **版本**: 1.1.0
- **发布日期**: 2026-04-06
- **状态**: ✅ 运行中

---

**快速帮助**: 如有问题，查看 `docs/` 目录下的详细文档
