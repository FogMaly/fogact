# 端口配置说明

## 当前配置

**Web UI 端口**: `34010`

访问地址: `http://localhost:34010/`

## 修改端口的方法

### 方法 1: 使用环境变量（推荐）

```bash
# 临时修改端口为 8080
PORT=8080 npm run web

# 或
PORT=8080 node bin/web-server.js
```

### 方法 2: 修改配置文件

编辑 `bin/web-server.js`，修改第 8 行：

```javascript
const PORT = process.env.PORT || 34010;  // 修改 34010 为你想要的端口
```

例如改为 8080：
```javascript
const PORT = process.env.PORT || 8080;
```

### 方法 3: 创建启动脚本

创建 `start-web-8080.sh`：
```bash
#!/bin/bash
PORT=8080 node bin/web-server.js
```

## 常用端口建议

- **34010** - 当前默认端口（专用于此项目）
- **8080** - 常用备选端口
- **8888** - 另一个常用端口
- **5000** - 也很常用

## 检查端口占用

```bash
# 检查端口是否被占用
lsof -i :34010

# 或使用 netstat
netstat -tuln | grep 34010
```

## 防火墙配置

如果需要外部访问，需要开放端口：

```bash
# Ubuntu/Debian
sudo ufw allow 34010

# CentOS/RHEL
sudo firewall-cmd --add-port=34010/tcp --permanent
sudo firewall-cmd --reload
```

## 示例

```bash
# 使用默认端口 34010
npm run web

# 使用端口 8080
PORT=8080 npm run web

# 使用端口 8888
PORT=8888 npm run web
```

启动后会显示：
```
CLIProxy Activator Web UI
=========================

Server running at http://localhost:端口号/

Press Ctrl+C to stop
```
