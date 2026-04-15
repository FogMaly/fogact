# CLIProxy Activator - 前端部署方案

## 目录结构

```
/opt/cliproxy-activator/frontend/
├── index.html                    # 根跳转页（重定向到 /user/）
├── index.html.bak               # 原激活表单页面备份
├── user/                        # 云驿 API 监控前端（从 fog-activator 复制）
│   ├── index.html              # Vue.js SPA 入口
│   └── assets/                 # 构建后的 JS/CSS 资源
│       ├── index-Da98HOxL.js   # 主应用入口
│       ├── chart-vendor-CULJE59K.js  # 图表库
│       ├── index-B8QSyYhS.css  # 样式文件
│       └── ...                 # 其他组件和资源
├── code-center/                # 代码中心
│   └── code_center_standalone.js
└── management-center/          # 管理中心
    └── management.html
```

## 实现方案

### 1. 根跳转机制

**文件**: `/opt/cliproxy-activator/frontend/index.html`

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=/user/" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CLIProxy Activator</title>
  </head>
  <body>
    <p>正在跳转到 <a href="/user/">/user/</a>...</p>
  </body>
</html>
```

- 使用 `<meta http-equiv="refresh">` 实现自动跳转
- 访问 `/` 时立即重定向到 `/user/`
- 提供备用链接供不支持 meta refresh 的浏览器使用

### 2. 用户监控前端

**文件**: `/opt/cliproxy-activator/frontend/user/index.html`

- **技术栈**: Vue.js 3 单页应用
- **标题**: "CLIProxy - API 使用监控"（已从"云驿"改为"CLIProxy"）
- **功能特性**:
  - 主题系统（深色/浅色/系统自动）
  - 存储在 `localStorage.yunyi_user_theme`
  - FOUC 防护（内联背景色）
  - 加载动画占位符
  - 图表可视化（使用 Chart.js）

### 3. Web 服务器更新

**文件**: `/opt/cliproxy-activator/bin/web-server.js`

**新增功能**:
- ✅ 静态文件服务器（支持所有前端资源）
- ✅ MIME 类型映射（HTML, JS, CSS, 字体等）
- ✅ 路径处理:
  - `/` → `/index.html` → 跳转到 `/user/`
  - `/user/` → `/user/index.html`
  - `/user/assets/*` → 静态资源
- ✅ 缓存控制:
  - HTML: `no-cache`（始终检查更新）
  - 静态资源: `max-age=31536000`（1年缓存）
- ✅ 安全防护（防止目录遍历攻击）
- ✅ CORS 支持（允许跨域访问）

## 测试验证

### 访问测试

```bash
# 1. 根路径（应返回跳转页）
curl http://localhost:34010/
# 返回: 包含 meta refresh 的 HTML

# 2. 用户监控页面
curl http://localhost:34010/user/
# 返回: Vue.js 应用 HTML

# 3. 静态资源
curl -I http://localhost:34010/user/assets/index-Da98HOxL.js
# 返回: 200 OK, Content-Type: application/javascript
```

### 启动服务

```bash
# 方式 1: 使用 npm script
cd /opt/cliproxy-activator
npm run web

# 方式 2: 直接运行
node bin/web-server.js

# 方式 3: 使用启动脚本
../scripts/START_WEB.sh
```

## 访问地址

- **本地访问**: http://localhost:34010/
- **网络访问**: http://<服务器IP>:34010/
- **自动跳转**: 访问根路径会自动跳转到 `/user/`

## 与 fog-activator 的对比

| 项目 | fog-activator | cliproxy-activator |
|------|---------------|-------------------|
| 前端位置 | `/opt/fog-activator/frontend/` | `/opt/cliproxy-activator/frontend/` |
| 根跳转页 | ✅ 有 | ✅ 已添加 |
| 用户监控 | `/user/` | ✅ 已复制 |
| 标题 | "云驿" | "CLIProxy" |
| Web 服务器 | 未配置 | ✅ 已配置 |
| 静态文件服务 | ❌ 无 | ✅ 完整支持 |

## 后续建议

### 1. API 端点配置
前端中的 API 调用需要配置正确的后端地址：
- 当前可能指向 `https://api.fogidc.com`
- 需要根据实际部署调整 baseURL

### 2. Nginx 反向代理（可选）
如果需要通过域名访问，可配置 nginx：

```nginx
location /user/ {
    proxy_pass http://127.0.0.1:34010/user/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### 3. 生产环境优化
- 使用 PM2 或 systemd 管理进程
- 添加日志记录
- 配置 HTTPS
- 添加访问控制

## 总结

✅ 已成功将 fog-activator 的前端结构应用到 cliproxy-activator：
- 根跳转页已创建
- 用户监控前端已复制并调整
- Web 服务器已升级支持完整静态文件服务
- 所有路径和资源访问正常

访问 http://localhost:34010/ 即可看到完整的前端界面。
