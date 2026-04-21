-- A数据 D1 Schema
-- 执行: npm run db:init

------------------------------------------------------------
-- 个人数据（从本地 SQLite 迁移）
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS watchlist (
  ts_code TEXT PRIMARY KEY,
  stock_name TEXT,
  sector_code TEXT,
  sector_name TEXT,
  subgroup TEXT,
  close REAL,
  pct_change_1d REAL,
  pct_change_5d REAL,
  pct_change_10d REAL,
  rps20 REAL,
  amount REAL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chart_drawings (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  drawings TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (symbol, timeframe)
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id TEXT PRIMARY KEY,
  ts_code TEXT NOT NULL,
  stock_name TEXT,
  entry_price REAL,
  stop_loss REAL,
  take_profit REAL,
  status TEXT DEFAULT 'active',
  triggered_type TEXT,
  triggered_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trade_plans (
  id TEXT PRIMARY KEY,
  ts_code TEXT NOT NULL,
  stock_name TEXT,
  entry_price REAL,
  stop_loss REAL,
  take_profit_1 REAL,
  take_profit_2 REAL,
  risk_r REAL,
  status TEXT DEFAULT 'planned',
  result TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS my_sectors (
  code TEXT PRIMARY KEY,
  name TEXT,
  added_at TEXT DEFAULT (datetime('now'))
);

------------------------------------------------------------
-- 行情数据（Python 每日 push）
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_daily (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  vol REAL,
  amount REAL,
  pct_chg REAL,
  PRIMARY KEY (ts_code, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_stock_daily_date ON stock_daily(trade_date);

CREATE TABLE IF NOT EXISTS rps_master (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  rps5 REAL,
  rps10 REAL,
  rps20 REAL,
  rps50 REAL,
  rps250 REAL,
  PRIMARY KEY (ts_code, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_rps_date ON rps_master(trade_date);
CREATE INDEX IF NOT EXISTS idx_rps_code ON rps_master(ts_code);

CREATE TABLE IF NOT EXISTS sector_rankings (
  trade_date TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  sector_name TEXT,
  rank INTEGER,
  pct_1d REAL,
  pct_5d REAL,
  pct_10d REAL,
  rps10 REAL,
  amount REAL,
  limit_up_count INTEGER,
  PRIMARY KEY (trade_date, sector_code)
);

CREATE TABLE IF NOT EXISTS sector_resonance (
  trade_date TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  total_count INTEGER,
  up_count INTEGER,
  strength REAL,
  resonant INTEGER DEFAULT 0,
  members_up TEXT,
  PRIMARY KEY (trade_date, sector_code)
);

------------------------------------------------------------
-- 评分引擎
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_scores (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  score INTEGER,
  verdict TEXT,
  reasons TEXT,
  rps250 REAL,
  rps50 REAL,
  vol_shrink_ratio REAL,
  pattern TEXT,
  distance_to_high REAL,
  PRIMARY KEY (ts_code, trade_date)
);

CREATE TABLE IF NOT EXISTS pattern_hits (
  ts_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  patterns TEXT,
  PRIMARY KEY (ts_code, trade_date)
);

------------------------------------------------------------
-- 知识数据（Obsidian 导入）
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_profiles (
  ts_code TEXT PRIMARY KEY,
  stock_name TEXT,
  one_liner TEXT,
  core_clients TEXT,
  industry_position TEXT,
  sector_code TEXT
);

CREATE TABLE IF NOT EXISTS industry_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_code TEXT NOT NULL,
  to_code TEXT NOT NULL,
  relation TEXT NOT NULL,
  description TEXT,
  UNIQUE(from_code, to_code, relation)
);

CREATE TABLE IF NOT EXISTS sector_cards (
  sector_code TEXT PRIMARY KEY,
  sector_name TEXT,
  summary TEXT,
  drivers TEXT,
  trading_sequence TEXT,
  risks TEXT,
  chain_map TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
