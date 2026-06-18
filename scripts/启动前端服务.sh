#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║           FogIDC Activator - 前端服务启动                     ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# 检查是否已经运行
if pgrep -f "node.*web-server.js" > /dev/null; then
    echo "⚠️  服务已在运行中"
    echo ""
    ps aux | grep "node.*web-server" | grep -v grep
    echo ""
    echo "访问地址:"
    echo "  用户前端: http://localhost:34020/user/"
    echo "  管理后台: http://localhost:34020/admin/"
    echo ""
    echo "如需重启，请先停止: pkill -f 'node.*web-server.js'"
    exit 0
fi

# 切换到项目目录
cd "$PROJECT_ROOT"

# 启动服务
echo "🚀 正在启动前端服务..."
echo ""

nohup env PORT=34020 node bin/web-server.js > logs/web-server.log 2>&1 &

# 等待启动
sleep 2

# 检查是否成功启动
if pgrep -f "node.*web-server.js" > /dev/null; then
    echo "✅ 服务启动成功！"
    echo ""
    echo "访问地址:"
    echo "─────────────────────────────────────────────────────────────"
    echo "  本地:      http://localhost:34020/"
    echo "  本地:      http://127.0.0.1:34020/"

    # 获取网络地址
    for ip in $(hostname -I); do
        echo "  网络:      http://${ip}:34020/user/"
    done

    echo "─────────────────────────────────────────────────────────────"
    echo ""
    echo "  管理后台:  http://localhost:34020/admin/"
    echo ""
    echo "📝 日志文件: logs/web-server.log"
    echo "🛑 停止服务: pkill -f 'node.*web-server.js'"
    echo ""
else
    echo "❌ 服务启动失败"
    echo ""
    echo "请检查日志: logs/web-server.log"
    exit 1
fi
