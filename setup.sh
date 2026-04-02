#!/bin/bash
# 快速设置脚本 - 首次运行时使用

echo "🔧 板块强度选股系统 - 快速设置"
echo "================================"
echo ""

# 检查Python版本
echo "1️⃣ 检查Python版本..."
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "   Python版本: $python_version"

# 安装依赖
echo ""
echo "2️⃣ 安装依赖包..."
pip3 install -r requirements.txt

# 配置Tushare Token
echo ""
echo "3️⃣ 配置Tushare Token"
echo "   请输入你的Tushare Token (获取地址: https://tushare.pro/user/token)"
read -p "   Token: " token

if [ -n "$token" ]; then
    # 创建.env文件
    cp backend/.env.example backend/.env
    sed -i.bak "s/your_token_here/$token/" backend/.env
    rm backend/.env.bak
    echo "   ✓ Token已保存到 backend/.env"
else
    echo "   ⚠️  未设置Token，请手动配置"
fi

# 创建日志目录
echo ""
echo "4️⃣ 创建必要的目录..."
mkdir -p backend/logs
echo "   ✓ 日志目录已创建"

# 测试配置
echo ""
echo "5️⃣ 测试配置..."
cd backend
if python3 -c "from config import get_config; print('✓ 配置文件加载成功')" 2>/dev/null; then
    echo "   ✓ 配置测试通过"
else
    echo "   ✗ 配置测试失败，请检查"
fi
cd ..

echo ""
echo "✅ 设置完成！"
echo ""
echo "启动服务器:"
echo "  bash dev.sh"
echo ""
echo "停止/查看状态:"
echo "  bash dev.sh stop"
echo "  bash dev.sh status"
echo ""
