# 激活码生成格式

## 格式规范

激活码采用 5 段式格式，使用连字符分隔：

```
XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
```

### 段长度
- 第 1 段: 8 个字符
- 第 2 段: 4 个字符
- 第 3 段: 4 个字符
- 第 4 段: 4 个字符
- 第 5 段: 12 个字符

**总长度**: 32 个字符 + 4 个连字符 = 36 个字符

### 字符集
使用大写字母和数字，排除易混淆字符：
- 字母: `ABCDEFGHJKLMNPQRSTUVWXYZ` (排除 I, O)
- 数字: `23456789` (排除 0, 1)

## 示例

```
VM2E8GPT-BBGN-P7MX-NQP7-SRY62GT3XU8D
JY2PYSFG-6GRS-G6VF-T78C-VGR8J9UP9VYM
67AEQVKH-K8G4-TRQV-X94Y-B8F8BJK3899Z
TWFPZRUW-R220-1ZMX-4YD8-5FM4YQAJC91B
CTHKK40V-95VF-WJ42-Q9QA-5G5EFY6NRF77
```

## API 使用

### 生成单个激活码

```bash
curl -X POST http://localhost:34010/api/codes \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "service": "Claude Code",
    "duration": 90
  }'
```

### 批量生成激活码

```bash
curl -X POST http://localhost:34010/api/codes \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "service": "Claude Code",
    "count": 10,
    "duration": 90
  }'
```

### 响应格式

```json
{
  "success": true,
  "data": [
    {
      "id": "1775579051999",
      "code": "4G2BP3V4-HKSJ-LJKG-P5WH-5LGCB7WDKEMP",
      "service": "Claude Code",
      "status": "unused",
      "expiresAt": "2026-07-06T16:24:11.999Z",
      ...
    }
  ],
  "message": "成功生成 10 个激活码"
}
```

## 实现位置

- 生成逻辑: `/opt/fogact/lib/services/database.js` (第 234-249 行)
- API 端点: `/opt/fogact/bin/web-server.js` (第 514-556 行)

## 修改历史

- 2026-04-07: 修改格式从 `XXXX-XXXX-XXXX-XXXX` 改为 `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`
- 2026-04-07: 修复 API 创建时 code 字段为 null 的问题
