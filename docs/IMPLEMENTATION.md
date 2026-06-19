# FogAct 实施文档

## 已完成功能

### 核心模块

1. **API 服务层** (`lib/services/fogact-api.js`)
   - 激活码验证
   - 节点列表获取
   - 节点健康检查

2. **节点服务** (`lib/services/node-service.js`)
   - 节点测速
   - 最优节点选择
   - 测试结果格式化

3. **备份服务** (`lib/services/backup-service.js`)
   - 配置备份创建
   - 备份列表查询
   - 备份恢复
   - 备份清理

4. **配置管理**
   - Claude 配置 (`lib/config/claude.js`)
   - Codex 配置 (`lib/config/codex.js`)

5. **命令实现**
   - 激活命令 (`lib/commands/activate.js`)
   - 测试命令 (`lib/commands/test.js`)
   - 恢复命令 (`lib/commands/restore.js`)

### 用户界面

1. **CLI 界面**
   - 交互式菜单
   - 命令行参数支持
   - 进度提示

2. **Web 界面** (`frontend/index.html`)
   - 图形化激活界面
   - 服务选择
   - 激活码输入
   - 实时反馈

### 激活流程

完整的激活流程包括：

1. 选择服务（Claude Code / Codex）
2. 输入激活码
3. 验证激活码
4. 测试可用节点
5. 选择最优节点
6. 创建配置备份
7. 写入新配置
8. 显示激活结果

## 使用示例

### CLI 使用

```bash
# 交互式模式
fogact

# 直接激活 Codex
fogact activate --service codex --code K1DHPY3P-4B2W-F1A4-DC4P-Y74TCQZXPNYT

# 直接激活 Claude
fogact activate --service claude --code N6P3BDX4-VCGH-T7MT-EX6J-3SYHEC8RXYX7

# 测试节点
fogact test

# 恢复备份
fogact restore --service claude
```

### Web UI 使用

```bash
# 启动 Web 服务器
fogact-web

# 然后在浏览器打开 http://localhost:3000
```

## 配置文件位置

- Claude Code: `~/.claude/config.json`
- Codex: `~/.codex/config.json`
- 备份目录: `~/.fogact/backups/`

## API 集成

工具对接 https://localhost:34020 的以下接口：

- `POST /api/verify` - 验证激活码
- `GET /api/nodes?service={service}` - 获取节点列表

## 下一步改进

1. 添加 VSCode/Cursor 插件集成
2. 添加 OpenCode/OpenClaw 支持
3. 完善错误处理
4. 添加单元测试
5. 支持更多配置选项
