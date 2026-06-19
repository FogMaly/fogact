#!/bin/bash

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║           FogAct - 停止前端服务                     ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# 检查是否有运行的服务
if ! pgrep -f "node.*web-server.js" > /dev/null; then
    echo "ℹ️  没有运行中的服务"
    exit 0
fi

echo "🛑 正在停止前端服务..."
echo ""

# 显示要停止的进程
ps aux | grep "node.*web-server" | grep -v grep

# 停止服务
pkill -f "node.*web-server.js"

# 等待进程结束
sleep 1

# 确认已停止
if ! pgrep -f "node.*web-server.js" > /dev/null; then
    echo ""
    echo "✅ 服务已停止"
else
    echo ""
    echo "⚠️  服务可能未完全停止，尝试强制停止..."
    pkill -9 -f "node.*web-server.js"
    sleep 1

    if ! pgrep -f "node.*web-server.js" > /dev/null; then
        echo "✅ 服务已强制停止"
    else
        echo "❌ 无法停止服务，请手动检查"
        exit 1
    fi
fi

echo ""
