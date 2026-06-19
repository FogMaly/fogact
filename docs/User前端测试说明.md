# User 前端测试说明

## 问题分析

user 前端是从 fog-activator 复制的 Vue.js 应用，它的 API 地址硬编码指向 `https://localhost:34020`。

## 解决方案

### 方案 1: 使用本地 Mock API（已实现）

本地服务器提供了以下 mock API：

**验证 API Key**:
```bash
POST /api/verify
Content-Type: application/json

{
  "api_key": "sk-test-123456"
  # 或
  "code": "sk-test-123456"
}
```

**响应**:
```json
{
  "success": true,
  "valid": true,
  "message": "验证成功",
  "data": {
    "username": "test_user",
    "email": "test@example.com",
    "service": "Claude Code"
  }
}
```

**使用数据 API**:
```bash
GET /api/user/usage
```

**用户信息 API**:
```bash
GET /api/user/info
```

### 方案 2: 使用代理（已实现）

如果前端调用外部 API，可以通过代理：
```
/proxy/api/verify -> https://localhost:34020/api/verify
```

### 方案 3: 修改前端 JS 文件

直接修改编译后的 JS 文件，将 API 地址改为本地：

```bash
# 查找并替换 API 地址
sed -i 's|https://localhost:34020|http://154.40.43.33:34010|g' /opt/fogact/frontend/user/assets/index-Da98HOxL.js
```

## 测试步骤

1. 访问: http://154.40.43.33:34010/user/

2. 输入 API Key: `sk-test-123456`（或任何以 `sk-test-` 开头的字符串）

3. 如果还是失败，打开浏览器开发者工具（F12）：
   - 查看 Network 标签，看实际调用的 API 地址
   - 查看 Console 标签，看是否有错误信息

4. 告诉我看到的错误信息，我会针对性修复

## 当前可用的测试 API Key

任何以 `sk-test-` 开头的字符串都可以：
- `sk-test-123456`
- `sk-test-demo`
- `sk-test-abc123`

## 如果前端调用外部 API

前端可能硬编码了 `https://localhost:34020` 作为 API 地址。需要：

1. 查看浏览器 Network 标签，确认实际请求的 URL
2. 如果是外部 URL，我们需要修改前端 JS 文件或添加反向代理

## 下一步

请在浏览器中测试，并告诉我：
1. Network 标签中看到的 API 请求 URL
2. Console 中的错误信息
3. 验证失败时的具体提示

我会根据实际情况调整。
