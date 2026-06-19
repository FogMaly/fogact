#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# FogAct - Demo Script
# This script demonstrates the main features of the activator

echo "=================================="
echo "FogAct - Demo"
echo "=================================="
echo ""

# Switch to the project root no matter where the script is launched from.
cd "$PROJECT_ROOT"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Could not locate package.json in the project root"
    exit 1
fi

echo "1. Showing CLI help..."
echo "-----------------------------------"
node bin/cli.js --help
echo ""

echo "2. Testing node connectivity..."
echo "-----------------------------------"
echo "Note: This will attempt to connect to localhost:34020"
echo "Press Ctrl+C to skip, or Enter to continue..."
read -r

node bin/cli.js test || echo "Node testing requires network access to localhost:34020"
echo ""

echo "3. Showing activation command help..."
echo "-----------------------------------"
node bin/cli.js activate --help
echo ""

echo "4. Example activation commands:"
echo "-----------------------------------"
echo "For Codex:"
echo "  node bin/cli.js activate --service codex --code K1DHPY3P-4B2W-F1A4-DC4P-Y74TCQZXPNYT"
echo ""
echo "For Claude:"
echo "  node bin/cli.js activate --service claude --code N6P3BDX4-VCGH-T7MT-EX6J-3SYHEC8RXYX7"
echo ""

echo "5. Starting Web UI server..."
echo "-----------------------------------"
echo "The web server will start on http://localhost:34010"
echo "Press Ctrl+C to stop the server"
echo ""
echo "Starting in 3 seconds..."
sleep 3

node bin/web-server.js
