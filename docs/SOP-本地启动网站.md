# SOP：本地启动网站（前后端）

适用目录：`A数据`

目标：稳定启动前端 `5173` + 后端 `8082`，并快速判断“没数据”问题。

## 1. 进入项目目录

```bash
cd "/Users/kp/Library/Mobile Documents/com~apple~CloudDocs/AI项目 2/A数据"
```

## 2. 启动前先清理端口占用

```bash
# 清理 8082（后端）
lsof -tiTCP:8082 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true

# 清理 5173（前端）
lsof -tiTCP:5173 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
```

## 3. 启动后端（终端A）

```bash
cd backend
python3 api_app.py
```

成功标志（日志）：
- `Uvicorn running on http://127.0.0.1:8082`

## 4. 启动前端（终端B）

```bash
cd frontend
npm run dev
```

成功标志（日志）：
- `Local: http://127.0.0.1:5173/`（或 Vite 输出的本地地址）

## 5. 健康检查（终端C，可选）

```bash
# 避免本机代理干扰本地回环请求
NO_PROXY=127.0.0.1 curl -sS http://127.0.0.1:8082/health
NO_PROXY=127.0.0.1 curl -sS http://127.0.0.1:8082/api/market/overview | head -c 200
```

预期：
- `/health` 返回 `{"status":"ok"...}`
- `market/overview` 返回 JSON（不是超时、不是连接失败）

## 6. 页面访问

- 前端：`http://127.0.0.1:5173`
- 后端文档：`http://127.0.0.1:8082/docs`

## 7. “页面没数据”排查顺序

1. 看后端终端是否有请求日志（如 `GET /api/market/overview 200`）。
2. 若无请求日志：前端没连到后端，先确认后端是否仍在运行。
3. 若有 5xx：看 `backend` 终端报错，优先检查 `.env` 里的 `TUSHARE_TOKEN`。
4. 若请求很慢：首次预热会慢，等 10-30 秒再刷新一次。
5. 若 `curl` 走错代理：命令前加 `NO_PROXY=127.0.0.1`。

## 8. 常用重启（两端一起）

```bash
cd "/Users/kp/Library/Mobile Documents/com~apple~CloudDocs/AI项目 2/A数据"
lsof -tiTCP:8082 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
lsof -tiTCP:5173 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
```

然后按第 3、4 步重新启动。
