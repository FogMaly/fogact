# CLIProxy Activator - 快速开始指南

## 安装

```bash
cd /opt/cliproxy-activator
npm install
```

## 使用方式

### 方式 1: 命令行界面 (推荐)

#### 交互式模式
```bash
node bin/cli.js
```

然后按照提示选择：
1. Activate service - 激活服务
2. Test nodes - 测试节点
3. Restore backup - 恢复备份
4. Exit - 退出

#### 直接命令模式

激活 Codex:
```bash
node bin/cli.js activate --service codex --code K1DHPY3P-4B2W-F1A4-DC4P-Y74TCQZXPNYT
```

激活 Claude:
```bash
node bin/cli.js activate --service claude --code N6P3BDX4-VCGH-T7MT-EX6J-3SYHEC8RXYX7
```

测试所有节点:
```bash
node bin/cli.js test
```

恢复备份:
```bash
node bin/cli.js restore
```

查看帮助:
```bash
node bin/cli.js --help
```

### 方式 2: Web 界面

启动 Web 服务器:
```bash
node bin/web-server.js
```

然后在浏览器打开: http://localhost:3000

Web 界面提供：
- 图形化服务选择
- 激活码输入
- 实时验证反馈
- 友好的错误提示

## 激活流程说明

当你运行激活命令时，工具会自动：

1. **验证激活码** - 向 yunyi.cfd 验证激活码是否有效
2. **获取节点列表** - 获取所有可用的代理节点
3. **测试节点** - 测试每个节点的延迟和可用性
4. **选择最优节点** - 自动选择延迟最低的节点
5. **创建备份** - 备份当前配置（如果存在）
6. **写入配置** - 将激活信息写入配置文件
7. **显示结果** - 显示激活成功信息和配置路径

## 配置文件位置

激活后，配置文件会保存在：

- **Claude Code**: `~/.claude/config.json`
- **Codex**: `~/.codex/config.json`

配置文件包含：
- `apiKey`: 激活码
- `apiUrl`: 选定的节点 URL
- `activatedAt`: 激活时间
- `activatedBy`: 激活工具标识

## 备份管理

### 备份位置
所有备份保存在: `~/.cliproxy-activator/backups/`

### 备份命名
格式: `{service}-{timestamp}.json`
例如: `claude-2026-04-05T18-30-45-123Z.json`

### 恢复备份
```bash
node bin/cli.js restore
```

选择要恢复的备份，工具会自动恢复配置文件。

### 清理备份
在恢复命令中选择 "Clear all backups" 选项。

## 测试

运行测试套件:
```bash
node test/test-activation.js
```

测试包括：
- ✓ 模块加载测试
- ✓ 节点选择逻辑测试
- ✓ 备份服务测试
- ✓ 配置路径测试
- ✓ CLI 命令结构测试
- ✓ 前端文件测试

## 故障排除

### 激活码无效
- 检查激活码是否正确复制
- 确认激活码未过期
- 验证选择的服务类型正确（Claude/Codex）

### 无可用节点
- 检查网络连接
- 尝试运行 `node bin/cli.js test` 查看节点状态
- 联系服务提供商确认节点状态

### 配置写入失败
- 检查文件权限
- 确保配置目录存在
- 查看错误信息了解具体原因

### 恢复备份失败
- 确认备份文件存在
- 检查目标配置目录权限
- 验证备份文件格式正确

## 示例激活码

项目包含两个示例激活码供测试：

**Codex 激活码:**
```
K1DHPY3P-4B2W-F1A4-DC4P-Y74TCQZXPNYT
```

**Claude 激活码:**
```
N6P3BDX4-VCGH-T7MT-EX6J-3SYHEC8RXYX7
```

## API 集成

工具与以下 API 端点集成：

- `POST https://yunyi.cfd/api/verify` - 验证激活码
- `GET https://yunyi.cfd/api/nodes?service={service}` - 获取节点列表

## 下一步

激活成功后：

1. **重启应用** - 重启 Claude Code 或 Codex 使配置生效
2. **验证连接** - 确认应用可以正常连接到代理节点
3. **保存激活码** - 妥善保管激活码以备将来使用

## 获取帮助

查看完整文档：
- `README.md` - 项目概述
- `IMPLEMENTATION.md` - 实现细节
- `PROJECT_SUMMARY.md` - 项目总结
- `PLAN.md` - 开发计划

运行帮助命令：
```bash
node bin/cli.js --help
node bin/cli.js activate --help
node bin/cli.js test --help
node bin/cli.js restore --help
```
