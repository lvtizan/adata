# 服务启动前检查清单

适用于本项目每次启动前端 / 后端 / 调度器之前的快速检查。

## 前端启动前

1. 检查依赖是否真的安装
   - `frontend/package.json` 里声明了依赖
   - `frontend/package-lock.json` 里锁定了依赖
   - `frontend/node_modules/<pkg>` 目录真实存在

2. 检查图表库版本是否真实可安装
   - 不要凭感觉写版本号
   - 先确认 npm 上确实发布了该版本

3. 检查 Vite 缓存是否可能脏掉
   - 改过依赖版本后，优先用 `vite --force`
   - 如果出现 `Outdated Optimize Dep`，先重启前端并强制重建依赖预构建

4. 检查端口占用
   - 前端：`5173`
   - 后端：`8080`
   - FastAPI：`8082`

5. 检查是否真的有 dev server 在监听
   - `lsof -nP -iTCP:5173 -sTCP:LISTEN`

## 后端启动前

1. 检查 `.env` 是否可读、`TUSHARE_TOKEN` 是否存在
2. 检查 `backend/data/` 下数据库路径是否可写
3. 检查后端端口是否已被占用
   - `lsof -nP -iTCP:8080 -sTCP:LISTEN`
   - `lsof -nP -iTCP:8082 -sTCP:LISTEN`

## 启动后自验

1. 前端类型检查
   - `./node_modules/.bin/tsc --noEmit --pretty --ignoreDeprecations 6.0`

2. 后端最小测试
   - `python3 -m unittest backend.tests.test_drawings_store backend.test_drawings_api -v`

3. 后端语法检查
   - `python3 -m compileall backend`

4. 前端首页连通性
   - `curl -I --max-time 5 http://127.0.0.1:5173/`

## 典型错误对应

1. `Failed to resolve import "klinecharts"`
   - 先检查版本号是否真实存在
   - 再检查 `node_modules/klinecharts` 是否真的安装

2. `504 Outdated Optimize Dep`
   - 依赖缓存脏了
   - 重启前端并用 `vite --force`

3. `listen EPERM`
   - 当前环境不允许直接监听该端口，或启动方式有问题
   - 先检查现有监听进程与启动脚本
