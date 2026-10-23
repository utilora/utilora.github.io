export type Candidate = {
  key: string;
  rank: number;
  symbol: string;
  name: string;
  board: string;
  score: number;
  change: number;
  trend: string;
  reason: string;
  risk: string;
};

export const candidates: Candidate[] = [
  { key: "1", rank: 1, symbol: "600000", name: "浦发银行", board: "沪市主板", score: 86.4, change: 1.26, trend: "趋势增强", reason: "均线多头 · 量能温和", risk: "中低" },
  { key: "2", rank: 2, symbol: "000001", name: "平安银行", board: "深市主板", score: 82.7, change: 0.83, trend: "强于基准", reason: "RSI 中性 · 波动收敛", risk: "中低" },
  { key: "3", rank: 3, symbol: "600519", name: "贵州茅台", board: "沪市主板", score: 79.2, change: -0.31, trend: "趋势修复", reason: "MACD 改善 · 缩量企稳", risk: "中" },
  { key: "4", rank: 4, symbol: "300750", name: "宁德时代", board: "创业板", score: 76.8, change: 1.92, trend: "震荡上行", reason: "突破短均线 · 成交活跃", risk: "中高" },
  { key: "5", rank: 5, symbol: "601318", name: "中国平安", board: "沪市主板", score: 74.5, change: 0.47, trend: "温和改善", reason: "相对强度提升 · 波动适中", risk: "中" },
  { key: "6", rank: 6, symbol: "000858", name: "五粮液", board: "深市主板", score: 72.9, change: -0.66, trend: "底部观察", reason: "量价背离收窄 · RSI 回升", risk: "中" },
];

export const dates = ["10-09", "10-10", "10-13", "10-14", "10-15", "10-16", "10-17", "10-20", "10-21", "10-22"];
export const prices = [10.18, 10.23, 10.16, 10.31, 10.28, 10.42, 10.38, 10.55, 10.61, 10.74];
export const volumes = [35, 42, 31, 55, 38, 63, 46, 72, 58, 81];
export const strategyNav = [1, 1.012, 1.006, 1.025, 1.041, 1.038, 1.062, 1.055, 1.083, 1.097];
export const benchmarkNav = [1, 1.006, 1.002, 1.011, 1.018, 1.012, 1.026, 1.021, 1.037, 1.044];

