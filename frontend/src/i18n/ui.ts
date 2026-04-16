import { useAppStore } from "@/store";

type Locale = "zh-CN" | "en-US";

export type UIKey =
  | "nav.realtime"
  | "nav.trading"
  | "nav.review"
  | "nav.system"
  | "nav.intraday"
  | "nav.dashboard"
  | "nav.watchlist"
  | "nav.bullcamp"
  | "nav.hhScan"
  | "nav.marketRecap"
  | "nav.morningBrief"
  | "nav.stockCompare"
  | "nav.coreMainline"
  | "nav.tradePlan"
  | "nav.zsxqMainlines"
  | "nav.settings"
  | "search.placeholder"
  | "search.minChars"
  | "search.loading"
  | "search.noResult"
  | "search.sectors"
  | "search.stocks"
  | "search.unknownSector"
  | "search.inWatchlist"
  | "search.addToWatchlist"
  | "settings.title"
  | "settings.appearance"
  | "settings.light"
  | "settings.dark"
  | "settings.language"
  | "settings.locale.zh"
  | "settings.locale.en"
  | "settings.stealth";

const messages: Record<Locale, Record<UIKey, string>> = {
  "zh-CN": {
    "nav.realtime": "实时",
    "nav.trading": "交易",
    "nav.review": "复盘",
    "nav.system": "系统",
    "nav.intraday": "盘中观察",
    "nav.dashboard": "板块分析",
    "nav.watchlist": "自选股",
    "nav.bullcamp": "牛股集中营",
    "nav.hhScan": "双底扫描",
    "nav.marketRecap": "盘前纪要",
    "nav.morningBrief": "每日简报",
    "nav.stockCompare": "股票对比",
    "nav.coreMainline": "核心主线",
    "nav.tradePlan": "交易计划",
    "nav.zsxqMainlines": "星球主线",
    "nav.settings": "设置",
    "search.placeholder": "搜索股票/板块",
    "search.minChars": "输入至少 2 个字符",
    "search.loading": "搜索中...",
    "search.noResult": "没有找到匹配的股票或板块",
    "search.sectors": "板块",
    "search.stocks": "股票",
    "search.unknownSector": "未识别板块",
    "search.inWatchlist": "已在自选",
    "search.addToWatchlist": "加入自选",
    "settings.title": "设置",
    "settings.appearance": "外观",
    "settings.light": "浅色",
    "settings.dark": "深色",
    "settings.language": "语言",
    "settings.locale.zh": "中文",
    "settings.locale.en": "English",
    "settings.stealth": "摸鱼模式",
  },
  "en-US": {
    "nav.realtime": "Realtime",
    "nav.trading": "Trading",
    "nav.review": "Review",
    "nav.system": "System",
    "nav.intraday": "Intraday",
    "nav.dashboard": "Sector Matrix",
    "nav.watchlist": "Watchlist",
    "nav.bullcamp": "Momentum Camp",
    "nav.hhScan": "Double-Bottom Scan",
    "nav.marketRecap": "Pre-Market Notes",
    "nav.morningBrief": "Daily Brief",
    "nav.stockCompare": "Stock Compare",
    "nav.coreMainline": "Core Themes",
    "nav.tradePlan": "Trade Plan",
    "nav.zsxqMainlines": "ZSXQ Mainlines",
    "nav.settings": "Settings",
    "search.placeholder": "Search symbol/sector",
    "search.minChars": "Enter at least 2 characters",
    "search.loading": "Searching...",
    "search.noResult": "No matching symbols or sectors",
    "search.sectors": "Sectors",
    "search.stocks": "Stocks",
    "search.unknownSector": "Unmapped Sector",
    "search.inWatchlist": "In Watchlist",
    "search.addToWatchlist": "Add",
    "settings.title": "Settings",
    "settings.appearance": "Appearance",
    "settings.light": "Light",
    "settings.dark": "Dark",
    "settings.language": "Language",
    "settings.locale.zh": "Chinese",
    "settings.locale.en": "English",
    "settings.stealth": "Stealth Mode",
  },
};

export function useUII18n() {
  const locale = useAppStore((s) => s.locale);
  const t = (key: UIKey): string => messages[locale][key] ?? key;
  return { t, locale };
}
