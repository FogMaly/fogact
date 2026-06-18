#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║           FogIDC Activator - 重启前端服务                     ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# 停止旧服务
if pgrep -f "node.*web-server.js" > /dev/null; then
    echo "🛑 停止旧服务..."
    pkill -f "node.*web-server.js"
    sleep 2
fi

# 切换到项目目录
cd "$PROJECT_ROOT"

# 启动新服务
echo "🚀 启动新服务..."
echo ""

nohup env PORT=34020 node bin/web-server.js > logs/web-server.log 2>&1 &

# 等待启动
sleep 2

# 检查是否成功启动
if pgrep -f "node.*web-server.js" > /dev/null; then
    echo "✅ 服务重启成功！"
    echo ""
    echo "访问地址:"
    echo "─────────────────────────────────────────────────────────────"
    echo "  用户前端:  http://localhost:34020/user/"
    echo "  管理后台:  http://localhost:34020/admin/"
    echo "─────────────────────────────────────────────────────────────"
    echo ""
    echo "📝 默认管理密码: admin123"
    echo "💡 修改密码: ADMIN_PASSWORD=your_password node bin/web-server.js"
    echo ""
else
    echo "❌ 服务启动失败"
    echo ""
    echo "请检查日志: logs/web-server.log"
    exit 1
fi
