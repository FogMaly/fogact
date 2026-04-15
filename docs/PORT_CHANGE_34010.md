# 端口更改通知

**更改日期**: 2026-04-05
**更改内容**: Web UI 端口从 34100 更改为 34010

---

## 📝 更改详情

### 旧配置
- 端口: 34100
- 访问地址: http://localhost:34100/

### 新配置
- 端口: **34010** ✅
- 访问地址: http://localhost:34010/

---

## 🔧 已更新的文件

### 1. 代码文件
- ✅ `bin/web-server.js` - 端口配置已更新

### 2. 文档文件（已全部更新）
- ✅ PORT_CONFIG.md
- ✅ EXTERNAL_ACCESS.md
- ✅ VERIFICATION_REPORT.md
- ✅ README.md
- ✅ START.md
- ✅ FINAL_SUMMARY.md
- ✅ FRONTEND_UPDATE.md
- ✅ PROJECT_FINAL.md
- ✅ 项目交付清单.md
- ✅ 最终交付文档.md

---

## 🌐 新的访问地址

### 本地访问
```
http://localhost:34010/
http://127.0.0.1:34010/
```

### 局域网访问
```
http://10.0.66.2:34010/
```

### 外网访问
```
http://YOUR_PUBLIC_IP:34010/
```

---

## 🔒 防火墙配置

如果之前配置了防火墙规则，需要更新：

### Ubuntu/Debian
```bash
# 删除旧规则（可选）
sudo ufw delete allow 34100/tcp

# 添加新规则
sudo ufw allow 34010/tcp
sudo ufw reload
```

### CentOS/RHEL
```bash
# 删除旧规则（可选）
sudo firewall-cmd --remove-port=34100/tcp --permanent

# 添加新规则
sudo firewall-cmd --add-port=34010/tcp --permanent
sudo firewall-cmd --reload
```

---

## ✅ 当前状态

**Web 服务器**: 运行中
**监听端口**: 34010
**监听地址**: 0.0.0.0
**访问状态**: 正常

### 验证命令
```bash
# 检查端口监听
lsof -i :34010

# 测试访问
curl http://localhost:34010/
```

---

## 📌 重要提示

1. **端口 34010 现在是专用端口**，用于 CLIProxy Activator Web UI
2. 所有文档已更新为新端口
3. Web 服务器已重启并运行在新端口
4. 如果使用了反向代理（Nginx/Apache），请更新配置
5. 如果使用了进程管理器（PM2/systemd），请重启服务

---

## 🚀 快速启动

```bash
cd /opt/cliproxy-activator
npm run web
```

服务器将在端口 34010 启动。

---

**更改完成时间**: 2026-04-05
**更改状态**: ✅ 已完成
