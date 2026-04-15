# 外网访问配置指南

## ✅ 已完成配置

Web 服务器已配置为支持外网访问。

### 配置详情

**监听地址**: `0.0.0.0` (所有网络接口)
**端口**: `34010`
**CORS**: 已启用
**字符编码**: UTF-8

## 🌐 访问方式

### 1. 本地访问
```
http://localhost:34010/
http://127.0.0.1:34010/
```

### 2. 局域网访问
```
http://10.0.66.2:34010/
```
（使用服务器的内网 IP）

### 3. 外网访问

如果服务器有公网 IP，直接使用：
```
http://YOUR_PUBLIC_IP:34010/
```

## 🔧 启动服务器

```bash
cd /opt/cliproxy-activator
npm run web
```

启动后会自动显示所有可用的访问地址。

## 🔒 防火墙配置

### Ubuntu/Debian
```bash
sudo ufw allow 34010/tcp
sudo ufw reload
```

### CentOS/RHEL
```bash
sudo firewall-cmd --add-port=34010/tcp --permanent
sudo firewall-cmd --reload
```

### 检查端口是否开放
```bash
# 检查端口监听
netstat -tuln | grep 34010

# 或使用 ss
ss -tuln | grep 34010
```

## 🌍 反向代理配置（可选）

### Nginx 配置

如果你有域名，可以配置 Nginx 反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:34010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Apache 配置

```apache
<VirtualHost *:80>
    ServerName your-domain.com

    ProxyPreserveHost On
    ProxyPass / http://localhost:34010/
    ProxyPassReverse / http://localhost:34010/
</VirtualHost>
```

## 🧪 测试访问

### 从服务器本地测试
```bash
curl http://localhost:34010/
```

### 从其他机器测试
```bash
curl http://10.0.66.2:34010/
```

### 浏览器测试
直接在浏览器打开：
- http://10.0.66.2:34010/

## 📱 移动设备访问

确保移动设备与服务器在同一网络，然后访问：
```
http://10.0.66.2:34010/
```

## 🔍 故障排除

### 1. 无法访问

**检查服务是否运行**
```bash
ps aux | grep web-server
```

**检查端口是否监听**
```bash
netstat -tuln | grep 34010
```

**检查防火墙**
```bash
sudo ufw status
```

### 2. 连接被拒绝

- 确认服务器监听在 `0.0.0.0` 而不是 `127.0.0.1`
- 检查防火墙规则
- 检查云服务商的安全组设置

### 3. 页面无法加载

- 检查 HTML 文件是否存在
- 查看服务器日志
- 检查浏览器控制台错误

## 🚀 生产环境建议

### 1. 使用进程管理器

**PM2**
```bash
npm install -g pm2
pm2 start bin/web-server.js --name cliproxy-web
pm2 save
pm2 startup
```

**systemd**
创建 `/etc/systemd/system/cliproxy-web.service`:
```ini
[Unit]
Description=CLIProxy Activator Web UI
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cliproxy-activator
ExecStart=/usr/bin/node /opt/cliproxy-activator/bin/web-server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl enable cliproxy-web
sudo systemctl start cliproxy-web
```

### 2. 使用 HTTPS

配置 SSL 证书（Let's Encrypt）：
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 3. 限制访问

如果只需要特定 IP 访问，配置防火墙：
```bash
# 只允许特定 IP
sudo ufw allow from 192.168.1.100 to any port 34010
```

## 📊 监控

### 查看访问日志

可以修改 `web-server.js` 添加日志：
```javascript
server.on('request', (req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - ${req.socket.remoteAddress}`);
});
```

## 🎯 快速测试清单

- [ ] 服务器启动成功
- [ ] 本地访问正常 (localhost:34010)
- [ ] 局域网访问正常 (内网IP:34010)
- [ ] 防火墙已配置
- [ ] 外网访问正常（如有公网IP）
- [ ] 移动设备可访问
- [ ] 页面显示正常
- [ ] 激活功能可用

## 📝 当前服务器信息

**内网 IP**: 10.0.66.2
**端口**: 34010
**访问地址**: http://10.0.66.2:34010/

现在可以从任何设备访问 Web UI 了！
