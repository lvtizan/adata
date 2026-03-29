# 项目文件树 (2026-03-28)

## 前端 frontend/src/

```
frontend/src/
├── main.tsx                        # 入口
├── app/
│   ├── layouts/
│   │   └── root-layout.tsx         # 主布局 + 侧边导航 (navItems)
│   ├── providers/
│   │   └── app-providers.tsx       # QueryClient + Theme Provider
│   ├── router/
│   │   └── routes.tsx              # 路由定义
│   └── theme/
│       ├── chart-theme.ts          # lightweight-charts 主题色
│       └── theme-provider.tsx      # 深色/浅色模式切换
├── features/
│   ├── bullcamp/
│   │   ├── components/
│   │   │   ├── camp-tag.tsx        # 牛股标签组件
│   │   │   └── financials-panel.tsx # 财务面板
│   │   └── hooks/
│   ├── chart/
│   │   ├── components/
│   │   │   ├── candlestick-panel.tsx # K 线面板
│   │   │   └── rs-panel.tsx        # 相对强度面板
│   │   └── hooks/
│   ├── market/
│   │   ├── components/
│   │   │   ├── market-summary.tsx  # 市场摘要卡片
│   │   │   └── risk-gauge.tsx      # 风险仪表盘
│   │   └── hooks/
│   ├── sectors/
│   │   ├── components/
│   │   │   └── sector-table.tsx    # 板块排名表格
│   │   └── hooks/
│   ├── settings/
│   │   └── NotifySettings.tsx      # 桌面端通知设置 (仅 isDesktop)
│   ├── stocks/
│   │   ├── components/
│   │   │   └── stock-table.tsx     # 个股表格
│   │   └── hooks/
│   └── watchlist/
│       ├── components/
│       │   └── watchlist-chart.tsx  # 自选股图表
│       └── hooks/
├── lib/
│   ├── desktop.ts                  # Tauri API 封装 (动态 import)
│   └── utils.ts                    # cn() 等工具函数
├── pages/
│   ├── bullcamp/page.tsx           # 牛股集中营页
│   ├── dashboard/page.tsx          # 仪表盘主页
│   ├── settings/page.tsx           # 设置页
│   └── watchlist/page.tsx          # 自选股页
├── queries/
│   ├── index.ts                    # barrel export
│   ├── chart.queries.ts
│   ├── market.queries.ts
│   ├── sector.queries.ts
│   └── stock.queries.ts
├── services/
│   ├── index.ts                    # barrel export
│   ├── api-client.ts              # fetch 封装
│   ├── chart.service.ts
│   ├── market.service.ts
│   ├── sector.service.ts
│   └── stock.service.ts
├── shared/
│   ├── charts/
│   │   ├── index.ts
│   │   ├── chart-shell.tsx         # 图表容器壳
│   │   └── kline-chart.tsx         # K 线图组件
│   ├── constants/
│   ├── hooks/
│   ├── layout/
│   │   ├── index.ts
│   │   ├── app-shell.tsx           # 应用外壳
│   │   ├── bottom-bar.tsx          # 底栏
│   │   ├── left-rail.tsx           # 左侧栏
│   │   ├── right-panel.tsx         # 右侧面板
│   │   └── top-bar.tsx             # 顶栏
│   ├── table/
│   │   ├── index.ts
│   │   ├── data-table.tsx          # 通用数据表格
│   │   └── numeric-cell.tsx        # 数值单元格
│   ├── types/
│   │   ├── index.ts
│   │   ├── chart.ts
│   │   ├── common.ts
│   │   ├── market.ts
│   │   ├── sector.ts
│   │   └── stock.ts
│   ├── ui/                         # shadcn/ui 基础组件
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── drawer.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── scroll-area.tsx
│   │   ├── separator.tsx
│   │   ├── tabs.tsx
│   │   └── tooltip.tsx
│   └── utils/
│       └── format.ts               # 数字/百分比格式化
├── store/
│   ├── index.ts                    # barrel export
│   ├── app-store.ts               # 全局状态 (theme, panel)
│   └── dashboard-store.ts         # 仪表盘状态
└── styles/
    └── globals.css                 # CSS 变量 + Tailwind 4
```

## 后端 backend/

```
backend/
├── server.py                 # HTTPServer 主后端 (端口 8080)
├── api_app.py                # FastAPI 后端 (端口 8082)
├── mcp_server.py             # MCP Server (端口 8083)
├── market_engine.py          # 核心计算引擎
├── market_data_store.py      # 市场数据存储 (SQLite)
├── watchlist_store.py        # 自选股存储 (SQLite)
├── config.py                 # 配置加载
├── config.yaml               # 配置文件
├── benchmark.py              # 性能测试
├── test_api.py               # API 测试
├── test_watchlist_api.py     # 自选股 API 测试
├── providers/
│   ├── __init__.py
│   ├── base.py               # 数据源基类
│   └── tushare_provider.py   # Tushare 数据源
├── data/
│   ├── market_cache.db       # 市场数据缓存
│   └── watchlist.db          # 自选股数据库
├── logs/
│   └── app.log
├── .env                      # 环境变量 (TUSHARE_TOKEN)
├── .env.example
└── OPTIMIZATION.md
```

## 项目根目录

```
A数据/
├── dev.command               # 智能启动脚本
├── build_app.command         # 生产构建脚本
├── setup_tauri.command       # Tauri 环境安装脚本
├── frontend/
│   ├── package.json
│   ├── vite.config.ts        # proxy → 127.0.0.1:8080
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   └── src-tauri/            # Tauri 桌面端
│       ├── tauri.conf.json
│       ├── Cargo.toml
│       ├── src/
│       │   ├── lib.rs
│       │   ├── sidecar.rs
│       │   ├── tray.rs
│       │   └── monitor.rs
│       └── gen_icon.py
├── backend/
├── docs/
│   └── plans/
│       └── desktop-client-design.md
├── scripts/
│   └── validate_project.py   # 项目验证脚本
└── .claude/
    └── skills/
        └── a-stock-dev/      # 本开发技能
```
