#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║           FogIDC Activator - Web UI                          ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "正在启动 Web 服务器..."
echo "端口: 34020"
echo "访问: http://localhost:34020"
echo ""

cd "$PROJECT_ROOT"
PORT=34020 node bin/web-server.js
