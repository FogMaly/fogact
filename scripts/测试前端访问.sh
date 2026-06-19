#!/bin/bash

echo "=========================================="
echo "FogAct 前端访问测试"
echo "=========================================="
echo ""

# 检查服务是否运行
if ! curl -s http://localhost:34020/ > /dev/null 2>&1; then
    echo "❌ 服务未运行，请先启动: npm run web"
    exit 1
fi

echo "✅ 服务正在运行"
echo ""

# 测试根路径
echo "1. 测试根路径 /"
curl -s -o /dev/null -w "   状态码: %{http_code}\n" http://localhost:34020/

# 测试用户页面
echo "2. 测试用户页面 /user/"
curl -s -o /dev/null -w "   状态码: %{http_code}\n" http://localhost:34020/user/

# 测试主应用 JS
echo "3. 测试主应用 JS"
curl -s -o /dev/null -w "   状态码: %{http_code}, 大小: %{size_download} bytes\n" http://localhost:34020/user/assets/index-Da98HOxL.js

# 测试图表库
echo "4. 测试图表库"
curl -s -o /dev/null -w "   状态码: %{http_code}, 大小: %{size_download} bytes\n" http://localhost:34020/user/assets/chart-vendor-CULJE59K.js

# 测试样式文件
echo "5. 测试样式文件"
curl -s -o /dev/null -w "   状态码: %{http_code}, 大小: %{size_download} bytes\n" http://localhost:34020/user/assets/index-B8QSyYhS.css

echo ""
echo "=========================================="
echo "✅ 所有测试完成"
echo "=========================================="
echo ""
echo "访问地址: http://localhost:34020/"
echo ""
