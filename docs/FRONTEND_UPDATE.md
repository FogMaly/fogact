# 前端界面更新说明

## ✅ 已完成

前端界面已重新设计，参考 yunyi.cfd/user/ 的设计风格。

## 🎨 设计特点

### 1. 主题系统
- **深色/浅色模式切换**
- 自动保存用户偏好到 `localStorage`
- 支持系统主题自动适配
- 防止页面闪烁（FOUC）

### 2. 配色方案

**浅色模式:**
- 背景: `hsl(210, 40%, 98%)` - 柔和的浅蓝灰
- 卡片: `hsl(0, 0%, 100%)` - 纯白色
- 主色: `hsl(221.2, 83.2%, 53.3%)` - 蓝色
- 边框: `hsl(214.3, 31.8%, 91.4%)` - 浅灰

**深色模式:**
- 背景: `hsl(240, 10%, 3.9%)` - 深蓝灰
- 卡片: `hsl(240, 10%, 7%)` - 深灰
- 主色: `hsl(221.2, 83.2%, 53.3%)` - 蓝色
- 边框: `hsl(240, 3.7%, 15.9%)` - 深灰

### 3. UI 组件

**卡片布局:**
- 圆角边框
- 柔和阴影
- 清晰的标题和描述
- 信息网格展示

**表单元素:**
- 现代化输入框
- 聚焦时的蓝色边框高亮
- 下拉选择框
- 主按钮样式

**反馈提示:**
- 成功提示（绿色）
- 错误提示（红色）
- 信息提示（蓝色）
- 加载动画

### 4. 交互效果

- 平滑的主题切换
- 按钮悬停效果
- 表单聚焦效果
- 旋转加载动画

## 📊 文件信息

- **文件路径**: `/opt/cliproxy-activator/frontend/index.html`
- **文件大小**: ~450 行
- **依赖**: 无（纯 HTML/CSS/JavaScript）

## 🚀 使用方法

### 启动服务器
```bash
cd /opt/cliproxy-activator
npm run web
```

### 访问地址
- 本地: http://localhost:34010/
- 局域网: http://10.0.66.2:34010/
- 外网: http://YOUR_PUBLIC_IP:34010/

## 🎯 功能特性

1. **服务选择** - Claude Code / Codex
2. **激活码输入** - 支持粘贴
3. **实时验证** - 调用 yunyi.cfd API
4. **节点测试** - 自动获取最优节点
5. **结果展示** - 清晰的成功/错误提示
6. **主题切换** - 深色/浅色模式
7. **示例激活码** - 快速测试

## 📱 响应式设计

- 支持桌面端
- 支持平板
- 支持移动端
- 自适应布局

## 🔧 技术实现

### 主题管理
```javascript
// 初始化主题
function initTheme() {
    const savedTheme = localStorage.getItem('yunyi_user_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');

    document.documentElement.setAttribute('data-theme', theme);
}

// 切换主题
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('yunyi_user_theme', newTheme);
}
```

### API 集成
```javascript
// 验证激活码
const verifyResponse = await fetch('https://yunyi.cfd/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, service })
});

// 获取节点列表
const nodesResponse = await fetch(`https://yunyi.cfd/api/nodes?service=${service}`);
```

## ✨ 与原设计的对比

| 特性 | 原设计 | 新设计 |
|------|--------|--------|
| 主题切换 | ❌ | ✅ |
| 卡片布局 | ❌ | ✅ |
| 响应式 | ✅ | ✅ |
| 配色方案 | 渐变紫色 | yunyi.cfd 风格 |
| 加载动画 | ✅ | ✅ |
| 信息展示 | 基础 | 网格布局 |

## 🎉 改进点

1. **更专业的设计** - 参考 yunyi.cfd 的现代化风格
2. **主题系统** - 支持深色/浅色模式切换
3. **更好的可读性** - 柔和的配色和清晰的层次
4. **更强的一致性** - 与 yunyi.cfd 保持视觉一致
5. **更好的用户体验** - 平滑的动画和反馈

## 📝 测试激活码

- **Codex**: `K1DHPY3P-4B2W-F1A4-DC4P-Y74TCQZXPNYT`
- **Claude**: `N6P3BDX4-VCGH-T7MT-EX6J-3SYHEC8RXYX7`

## 🔄 后续优化建议

1. 添加侧边栏导航（如 yunyi.cfd）
2. 添加更多管理功能
3. 添加使用统计图表
4. 添加激活历史记录
5. 添加多语言支持

---

**前端界面已完成更新，现在与 yunyi.cfd 保持一致的设计风格！**
