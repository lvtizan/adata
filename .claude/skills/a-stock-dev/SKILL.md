---
name: a-stock-dev
description: |
  A 股板块强度选股系统的开发守则和验证工具。每次修改此项目的前端（React/TypeScript）或后端（Python/FastAPI）代码时，必须加载此技能。
  触发条件：修改 frontend/src 下的任何 .tsx/.ts 文件、修改 backend/ 下的 .py 文件、添加新组件/页面/API 路由、修复 bug、重构代码。
  即使用户只是说"改一下按钮样式"或"加个接口"这种简单需求，也要使用此技能，因为它包含端口约定、import 规则、iCloud 防坑指南等关键信息。
---

# A 股板块强度选股系统 — 开发守则

本技能确保每次代码修改都遵循项目约定，交付前自动验证，避免常见错误。

## 项目概况

本地运行的 A 股板块强度分析系统。数据源 Tushare，前端 React + Vite + TypeScript，后端 Python。

**图表库**：`klinecharts` v10（替换了之前的 `lightweight-charts`）。K 线图使用 `init()` / `dispose()` API，详见 https://klinecharts.com 。

## 启动方式

项目已迁移到本地磁盘 `/Users/kp/Code/A数据/`。

在终端执行：
```bash
cd /Users/kp/Code/A数据
bash dev.sh        # 启动
bash stop.sh       # 停止
```

`dev.sh` 做三件事：杀旧端口进程 → 后台启动后端和前端 → 3秒后打开浏览器。
日志在 `/tmp/a-data-backend.log` 和 `/tmp/a-data-frontend.log`。

## 关键约定

### 端口分配

| 服务 | 端口 | 启动文件 | 说明 |
|------|------|---------|------|
| 旧版后端 (HTTPServer) | 8080 | `backend/server.py` | 主力后端，前端 proxy 指向此端口 |
| FastAPI 后端 | 8082 | `backend/api_app.py` | 新版 API，部分功能在这里 |
| Vite 开发服务器 | 5173 | `frontend/` | 前端开发服务器 |
| MCP Server | 8083 | `backend/mcp_server.py` | DeerFlow 集成用 |

**重要**：`vite.config.ts` 的 proxy target 是 `http://127.0.0.1:8080`。如果你要加新的 API 路由，加到 `backend/server.py` 的 Handler 类里（端口 8080）。如果要用 FastAPI 风格的路由，加到 `backend/api_app.py`（端口 8082），但要注意前端 proxy 不会自动转发到 8082。

### 前端文件结构

```
frontend/src/
├── app/                    # 应用级配置
│   ├── layouts/            # 布局组件（RootLayout）
│   ├── providers/          # React 上下文（QueryClient, Theme）
│   ├── router/             # 路由定义（routes.tsx）
│   └── theme/              # 主题相关
├── features/               # 功能模块（按领域划分）
│   ├── bullcamp/components/
│   ├── chart/components/
│   ├── market/components/
│   ├── sectors/components/
│   ├── settings/           # 桌面客户端设置
│   ├── stocks/components/
│   └── watchlist/components/
├── lib/                    # 工具函数
│   ├── desktop.ts          # Tauri 桌面端 API 封装
│   └── utils.ts            # cn() 等通用工具
├── pages/                  # 页面组件（一个路由一个目录）
│   ├── bullcamp/page.tsx
│   ├── dashboard/page.tsx
│   ├── index-radar/page.tsx
│   ├── sector-workbench/page.tsx
│   ├── settings/page.tsx
│   └── watchlist/page.tsx
├── queries/                # React Query hooks
├── services/               # API 调用封装
├── shared/                 # 共享组件
│   ├── charts/             # 图表组件
│   ├── layout/             # 布局组件（AppShell, TopBar 等）
│   ├── table/              # 表格组件
│   ├── types/              # TypeScript 类型定义
│   ├── ui/                 # shadcn/ui 基础组件
│   └── utils/              # 格式化工具
├── store/                  # Zustand 状态管理
│   ├── app-store.ts        # 全局状态（theme, panel）
│   ├── dashboard-store.ts  # 仪表盘状态
│   └── index.ts            # barrel export
├── styles/globals.css
└── main.tsx                # 入口
```

### Import 规则

1. **路径别名**：始终使用 `@/` 前缀，映射到 `src/`。例：`import { Button } from "@/shared/ui/button"`
2. **barrel exports**：`shared/layout/`、`store/`、`queries/` 有 `index.ts`，优先从 index 导入
3. **不要使用相对路径的 `../../`**：跨目录时用 `@/` 别名
4. **Tauri API 必须动态导入**：`desktop.ts` 里用 `import()` 动态加载 `@tauri-apps/api`，因为浏览器环境没有这些包

### 添加新页面的步骤

1. 在 `pages/` 下创建 `<name>/page.tsx`，default export 组件
2. 在 `app/router/routes.tsx` 里 import 并添加路由
3. 在 `app/layouts/root-layout.tsx` 的 `navItems` 数组里加导航项
4. 从 `lucide-react` 选一个图标

### 添加新 API 的步骤

1. 在 `backend/api_app.py`（FastAPI）或 `backend/server.py`（HTTPServer）里加路由
2. 在 `frontend/src/services/` 里加调用函数
3. 在 `frontend/src/queries/` 里加 React Query hook
4. 在 `frontend/src/shared/types/` 里加类型定义

### 样式约定

- 使用 Tailwind CSS 4 + shadcn/ui 组件
- CSS 变量定义在 `styles/globals.css`
- 颜色用语义化 token：`text-primary`, `bg-canvas`, `border-default`, `accent`
- 深色模式通过 `document.documentElement.classList.toggle("dark")` 控制

## 项目路径说明

项目已从 iCloud Drive 迁移到本地磁盘 `/Users/kp/Code/A数据/`。iCloud 同步相关的问题不再存在。

注意：如果发现 `xxx 2` 冲突副本文件（如 `SKILL 2.md`、`components 2.json`），可以安全删除。

## 开发原则：一致性是过程约束，不是事后检查

**核心理念：以下一致性规则必须在写代码的每一步都遵守，而不是写完再回头检查。**

写任何一行代码之前，先确认：
1. **API 路由**：后端 URL path、参数名、响应字段名 → 前端 service 调用 URL、泛型类型 → 同步定义，不能先写一边再补另一边
2. **Import 链**：新增的 export 立刻更新 barrel index（services/index.ts、queries/index.ts、shared/types/index.ts），不留到最后
3. **Props 传递**：修改组件 interface 时，立刻 Grep 找到所有调用方，当场修改，不留断裂点
4. **snake_case → camelCase**：后端 Python 用 snake_case，前端 TypeScript 用 camelCase — 在写 service 层时就做好转换，不要让不一致传播到组件层
5. **路由 + 导航**：新增页面时，page.tsx / routes.tsx / root-layout.tsx navItems 三处必须同步完成，不是"先写页面回头再加路由"

违反以上任何一条就等于写了一个 bug，不是"之后检查能发现的小问题"。

## Harness Engineering（长任务默认模式）

当任务满足任一条件时，必须启用 Harness 模式：
1. 跨前后端多文件改动（>= 5 个文件）
2. 需要多轮验证（数据口径、UI 行为、图表信号）
3. 需求存在“先做再改”的高变更概率（如策略算法、信号定义）

### 1) 任务契约（先写再做）

在动代码前先落一份“任务契约”，最少包含：
- **目标**：本次只解决什么，不解决什么
- **输入/输出**：涉及的 API、字段、组件、页面
- **闸门**：什么条件算通过（构建通过、页面可用、关键用例）
- **回滚点**：失败时回退到哪个 commit 或哪个功能开关

建议存放：
- `docs/plans/<date>-<topic>-contract.md`

### 2) 三段式执行（Planner → Builder → Evaluator）

- **Planner（规划）**：拆分最小可验证步骤，先列风险最高的环节
- **Builder（实现）**：每次只改一个最小闭环，改完立即验证
- **Evaluator（评审）**：按闸门逐条验收，失败则回到 Planner 重排

禁止“连续大改后一次性验收”。

### 3) 每轮迭代的固定产物

每个迭代轮次都要留下：
1. 改动范围（文件清单）
2. 运行结果（build/test/关键接口返回）
3. 差异说明（为何这么改）
4. 下一轮计划（若未完成）

建议存放：
- `docs/plans/<date>-<topic>-evaluation.md`

### 4) 长任务防漂移规则

1. **单轮时长限制**：单轮实现不超过 30 分钟或 1 个闭环
2. **上下文重锚**：每 2~3 轮回读契约，防止偏离目标
3. **口径唯一源**：字段/算法定义只保留一个权威位置（文档或类型）
4. **失败可恢复**：每完成一个闭环就可独立提交或至少可独立回滚

### 5) 与本项目的结合规则

1. 涉及行情口径（实时 vs 历史）时，Evaluator 必须覆盖：
   - 列表涨跌幅与详情页涨跌幅一致
   - 今日有实时数据时优先实时口径
2. 涉及图表组件改造时，Evaluator 必须覆盖：
   - 全站统一图表控件是否被引用
   - 画线、买入线、止盈止损功能是否仍可用
3. 涉及信号算法（H1/H2/HH）时，Evaluator 必须覆盖：
   - 正例、反例、回归用例各至少 1 个
   - “失败后重计数”场景必须单测化

## 交付前验证工作流

**以上开发原则如果都遵守了，这一步只是确认——不应该在这里发现新问题。**

### 第 1 步：运行自动验证脚本

```bash
cd /path/to/A数据 && python3 scripts/validate_project.py
```

这个脚本检查 iCloud 冲突、import 链、路由一致性、端口一致性、后端配置。必须全部通过（0 错误）。

### 第 2 步：Python 模块 import 检查

对每个新增/修改的 .py 文件，执行 import 测试：

```bash
cd backend && python3 -c "from <module> import <function>; print('OK')"
```

例如修改了 `pattern_detector.py`，就跑：
```bash
python3 -c "from pattern_detector import detect_all_patterns; print('OK')"
```

### 第 3 步：逐文件 import 手动验证

对每个新增/修改的 .tsx/.ts 文件，手动确认：
1. 用 `Read` 工具打开文件，逐行检查每个 `import` 语句
2. 用 `Read` 工具打开目标文件，确认被导入的符号确实 export 了
3. 如果通过 barrel export (index.ts) 导入，确认 barrel 文件有对应的 `export * from`

**特别注意：**
- 新增的 service 函数必须确认 `services/index.ts` 已 re-export
- 新增的 query hook 必须确认 `queries/index.ts` 已 re-export
- 新增的 type 必须确认 `shared/types/index.ts` 已 re-export

### 第 4 步：路由和导航同步检查

如果添加了新页面：
1. `Read` routes.tsx → 确认有 import 和 route path
2. `Read` root-layout.tsx → 确认 navItems 有入口（如需要）
3. 交叉比对：pages/ 目录下每个 page.tsx 都能在 routes.tsx 里找到

### 第 5 步：API 前后端一致性

如果添加了新 API：
1. `Read` 后端路由文件 → 确认 URL path 和响应字段名
2. `Read` 前端 service 文件 → 确认 URL path 一致
3. `Read` 前端 types 文件 → 确认类型字段和后端返回字段一一对应
4. 特别检查：后端 `snake_case` 是否正确转为前端 `camelCase`

### 第 6 步：组件 props 传递检查

如果修改了组件的 interface/props：
1. `Grep` 找到所有使用该组件的地方
2. 确认每处调用都传入了新增的 props（或者新 props 是 optional 的）

### 沙箱限制说明

由于代码运行在 Linux 沙箱而 node_modules 是 macOS 编译的：
- `npx tsc --noEmit` 和 `npx vite build` 在沙箱里无法执行
- 所以上述手动检查步骤不可省略——它们替代了编译器的类型检查
- 如果用户在本机环境，优先建议用户执行 `npm run check`（即 `tsc --noEmit`）

### 检查结果汇报模板

完成所有检查后，按以下格式向用户汇报：

```
✅ 自动验证脚本：通过（0 错误 / N 警告）
✅ Python import：所有新模块 import 正常
✅ 前端 import 链：逐文件确认，N 个文件 M 处 import 全部有效
✅ 路由/导航：routes.tsx + navItems 与 pages/ 一致
✅ API 一致性：前后端 URL path + 字段名一致
⚠️ 建议本机执行：npm run check（tsc 编译检查）
```

## 踩坑记录

踩坑记录已按前后端分离，节省 token：

- **改前端代码时**：读 `references/pitfalls-frontend.md`
- **改后端代码时**：读 `references/pitfalls-backend.md`

两份文件包含完整的 17 条踩坑记录，按职责分类。前后端都涉及时两份都读。

---

## 参考文件

更详细的信息在 `references/` 目录下：
- `references/api-endpoints.md` — 完整的 API 端点清单（路由、参数、响应格式）
- `references/file-tree.md` — 最新的完整文件树

如果你要加新的 API 或组件，先 Read 对应的参考文件确认现有的命名和结构风格。
