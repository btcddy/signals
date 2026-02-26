// ============================================================
// PortfolioPulse Types — matches DB schema exactly
// ============================================================

export type AssetType = 'stock' | 'etf' | 'option' | 'crypto';
export type OptionType = 'call' | 'put';
export type TradeAction = 'buy' | 'sell' | 'dividend' | 'split';
export type TradeSource = 'manual' | 'csv_import';
export type SignalLabel = 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
export type TrendDirection = 'bullish' | 'bearish' | 'neutral';
export type BrokerageFormat = 'schwab' | 'fidelity' | 'robinhood' |'alightfs' | 'unknown';

// ---- Database Row Types ----

export interface Platform {
  id: string;
  user_id: string;
  name: string;
  account_label: string | null;
  account_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Holding {
  id: string;
  user_id: string;
  platform_id: string | null;
  ticker: string;
  company_name: string | null;
  sector: string | null;
  asset_type: AssetType;
  quantity: number;
  avg_cost: number | null;
  current_price: number | null;
  // Support / Resistance
  support_1: number | null;
  support_2: number | null;
  resistance_1: number | null;
  resistance_2: number | null;
  // Fibonacci
  fib_high: number | null;
  fib_low: number | null;
  fib_236: number | null;
  fib_382: number | null;
  fib_500: number | null;
  fib_618: number | null;
  fib_786: number | null;
  // Options
  option_type: OptionType | null;
  strike_price: number | null;
  expiration_date: string | null;
  contracts: number | null;
  // Meta
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  user_id: string;
  holding_id: string | null;
  platform_id: string | null;
  ticker: string;
  action: TradeAction;
  quantity: number;
  price: number;
  total_amount: number; // generated column
  fees: number;
  trade_date: string;
  notes: string | null;
  source: TradeSource;
  created_at: string;
}

export interface DailyPrice {
  id: string;
  ticker: string;
  price_date: string;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  close_price: number;
  volume: number | null;
  created_at: string;
}

export interface SignalHistory {
  id: string;
  ticker: string;
  signal_date: string;
  rsi_14: number | null;
  ema_9: number | null;
  ema_21: number | null;
  ema_50: number | null;
  ema_200: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  signal_score: number | null;
  signal_label: SignalLabel | null;
  nearest_fib_support: number | null;
  nearest_fib_resistance: number | null;
  created_at: string;
}

export interface SectorRotation {
  id: string;
  sector_name: string;
  etf_ticker: string;
  current_price: number | null;
  change_1d: number | null;
  change_1w: number | null;
  change_1m: number | null;
  change_3m: number | null;
  change_ytd: number | null;
  relative_strength: number | null;
  rank: number | null;
  updated_at: string;
}

export interface TrendScanner {
  id: string;
  ticker: string;
  scan_date: string;
  trend_direction: TrendDirection | null;
  trend_strength: number | null;
  above_ema_9: boolean | null;
  above_ema_21: boolean | null;
  above_ema_50: boolean | null;
  above_ema_200: boolean | null;
  golden_cross: boolean;
  death_cross: boolean;
  volume_surge: boolean;
  breakout_detected: boolean;
  notes: string | null;
  created_at: string;
}

export interface Watchlist {
  id: string;
  user_id: string;
  ticker: string;
  company_name: string | null;
  target_buy_price: number | null;
  target_sell_price: number | null;
  alert_on_signal: boolean;
  alert_on_price: boolean;
  notes: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

// ---- Insert Types (omit generated fields) ----

export type PlatformInsert = Omit<Platform, 'id' | 'created_at' | 'updated_at'>;
export type HoldingInsert = Omit<Holding, 'id' | 'created_at' | 'updated_at'>;
export type TradeInsert = Omit<Trade, 'id' | 'total_amount' | 'created_at'>;
export type WatchlistInsert = Omit<Watchlist, 'id' | 'created_at' | 'updated_at'>;

// ---- Service Types ----

export interface PriceData {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalResult {
  ticker: string;
  date: string;
  rsi_14: number;
  ema_9: number;
  ema_21: number;
  ema_50: number;
  ema_200: number;
  macd_line: number;
  macd_signal: number;
  macd_histogram: number;
  fib_levels: FibLevels;
  signal_score: number;
  signal_label: SignalLabel;
  nearest_fib_support: number | null;
  nearest_fib_resistance: number | null;
}

export interface FibLevels {
  high: number;
  low: number;
  level_236: number;
  level_382: number;
  level_500: number;
  level_618: number;
  level_786: number;
}

export interface CSVImportResult {
  format: BrokerageFormat;
  trades_parsed: number;
  trades_inserted: number;
  errors: string[];
}
