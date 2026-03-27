# 板块强度选股系统

本地运行的 A 股板块强度分析系统，数据源统一使用 Tushare。

## ✨ 特性

- 🎯 **市场总控**: 市场环境、指数强弱、市场宽度、情绪温度
- 📊 **板块排行**: 多维度排序（5日/10日/RPS）
- 💹 **个股筛选**: 板块内强势个股排行
- 📈 **K线图表**: TradingView Lightweight Charts
- 🚀 **性能优化**: 批量加载、并发查询、智能缓存
- 📝 **结构化日志**: 完整的日志记录系统

## 🚀 快速开始

### 1. 自动设置（推荐）

```bash
./setup.sh
```

按提示输入你的 Tushare Token 即可。

### 2. 手动设置

```bash
# 安装依赖
pip3 install -r requirements.txt

# 配置Token
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入你的token

# 启动服务器
./start_server.sh
```

### 3. 访问系统

浏览器打开: `http://127.0.0.1:8080`

## ⚙️ 配置说明

### 环境变量

在 `backend/.env` 文件中配置:

```bash
# Tushare API Token（必需）
TUSHARE_TOKEN=your_token_here

# Tushare 代理（可选）
# TUSHARE_HTTP_URL=http://your_proxy

# 服务器配置（可选）
HOST=127.0.0.1
PORT=8080
DEBUG=false
```

### 规则配置

在 `backend/config.yaml` 中配置选股规则:

```yaml
rules:
  sector_amount_min: 50000000000.0  # 板块最小成交额（元）
  stock_amount_min: 800000000.0     # 个股最小成交额（元）
  stock_rps_min: 80.0               # 个股最小RPS值
  require_above_ma20: true          # 是否要求股价高于MA20
```

### 日志配置

日志文件位置: `backend/logs/app.log`

在 `config.yaml` 中调整日志级别:

```yaml
logging:
  level: "INFO"  # DEBUG, INFO, WARNING, ERROR
  log_file: "logs/app.log"
```

## 📊 默认硬过滤规则

- 板块日成交额 >= 500 亿
- 个股收盘价 >= MA20
- 个股日成交额 >= 8 亿
- 个股 RPS20 >= 80

## 🛠️ 开发

### 运行性能测试

```bash
cd backend
python3 benchmark.py
```

### 查看日志

```bash
# 实时查看日志
tail -f backend/logs/app.log

# 查看错误日志
grep ERROR backend/logs/app.log
```

### 调试模式

```bash
# 方法1: 环境变量
DEBUG=true ./start_server.sh

# 方法2: 修改config.yaml
server:
  debug: true
```

## 📁 项目结构

```
.
├── backend/
│   ├── config.py          # 配置管理
│   ├── config.yaml        # 配置文件
│   ├── .env.example       # 环境变量模板
│   ├── market_engine.py   # 数据引擎
│   ├── server.py          # HTTP服务器
│   ├── benchmark.py       # 性能测试
│   └── logs/              # 日志目录
├── web/
│   ├── index.html         # 主页面
│   ├── styles.css         # 样式
│   └── app.js             # 前端逻辑
├── setup.sh               # 快速设置脚本
├── start_server.sh        # 启动脚本
└── requirements.txt       # 依赖列表
```

## 🔒 安全性

- ⚠️ **不要将 `.env` 文件提交到版本控制**
- ⚠️ **Token 包含敏感信息，请妥善保管**
- ✅ 使用 `.env.example` 作为模板

## 🐛 故障排查

### 端口被占用

```bash
# 查找占用端口的进程
lsof -i :8080

# 杀死进程
kill -9 <PID>

# 或更换端口
export PORT=8081
./start_server.sh
```

### Token 无效

```bash
# 检查Token是否设置
echo $TUSHARE_TOKEN

# 重新配置
cd backend
nano .env
```

### 数据加载慢

- 首次启动需要预热缓存（约30秒）
- 检查网络连接
- 查看 `logs/app.log` 了解详细情况

## 📝 更新日志

### v2.0 (最新)

- ✅ 移除硬编码Token，改用环境变量
- ✅ 添加结构化日志系统
- ✅ 改进错误处理
- ✅ 支持配置文件
- ✅ 性能优化（批量加载、并发查询）

### v1.0

- 基础功能实现

## 📄 许可证

本项目仅供学习交流使用。

## 🙏 致谢

- [Tushare](https://tushare.pro) - 数据支持
- [Lightweight Charts](https://www.tradingview.com/lightweight-charts/) - 图表库
