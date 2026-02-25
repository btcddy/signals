-- ============================================================
-- PortfolioPulse: Initial Schema Migration
-- 8 tables, RLS policies, indexes, triggers, seed data
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PLATFORMS (brokerage accounts)
-- ============================================================
CREATE TABLE platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- e.g. 'Schwab', 'Fidelity', 'Robinhood'
  account_label TEXT,                          -- e.g. 'Roth IRA', 'Taxable', 'Options'
  account_number TEXT,                         -- last 4 digits or masked
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own platforms"
  ON platforms FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_platforms_user ON platforms(user_id);

-- ============================================================
-- 2. HOLDINGS (current positions + support/resistance)
-- ============================================================
CREATE TABLE holdings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_id UUID REFERENCES platforms(id) ON DELETE SET NULL,
  ticker TEXT NOT NULL,
  company_name TEXT,
  sector TEXT,
  asset_type TEXT DEFAULT 'stock',             -- 'stock', 'etf', 'option', 'crypto'
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(12,4),
  current_price NUMERIC(12,4),
  -- Support / Resistance levels
  support_1 NUMERIC(12,4),
  support_2 NUMERIC(12,4),
  resistance_1 NUMERIC(12,4),
  resistance_2 NUMERIC(12,4),
  -- Fibonacci retracement levels
  fib_high NUMERIC(12,4),                     -- swing high for fib calc
  fib_low NUMERIC(12,4),                      -- swing low for fib calc
  fib_236 NUMERIC(12,4),
  fib_382 NUMERIC(12,4),
  fib_500 NUMERIC(12,4),
  fib_618 NUMERIC(12,4),
  fib_786 NUMERIC(12,4),
  -- Options-specific fields
  option_type TEXT,                            -- 'call', 'put'
  strike_price NUMERIC(12,4),
  expiration_date DATE,
  contracts INTEGER,
  -- Meta
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own holdings"
  ON holdings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_holdings_user ON holdings(user_id);
CREATE INDEX idx_holdings_ticker ON holdings(user_id, ticker);
CREATE INDEX idx_holdings_platform ON holdings(platform_id);
CREATE INDEX idx_holdings_sector ON holdings(user_id, sector);

-- ============================================================
-- 3. TRADES (trade history + manual entry)
-- ============================================================
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id UUID REFERENCES holdings(id) ON DELETE SET NULL,
  platform_id UUID REFERENCES platforms(id) ON DELETE SET NULL,
  ticker TEXT NOT NULL,
  action TEXT NOT NULL,                        -- 'buy', 'sell', 'dividend', 'split'
  quantity NUMERIC(14,4) NOT NULL,
  price NUMERIC(12,4) NOT NULL,
  total_amount NUMERIC(14,4) GENERATED ALWAYS AS (quantity * price) STORED,
  fees NUMERIC(10,4) DEFAULT 0,
  trade_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  source TEXT DEFAULT 'manual',                -- 'manual', 'csv_import'
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own trades"
  ON trades FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_trades_user ON trades(user_id);
CREATE INDEX idx_trades_ticker ON trades(user_id, ticker);
CREATE INDEX idx_trades_holding ON trades(holding_id);
CREATE INDEX idx_trades_date ON trades(user_id, trade_date DESC);

-- ============================================================
-- 4. DAILY_PRICES (price history for sparklines & charts)
-- ============================================================
CREATE TABLE daily_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker TEXT NOT NULL,
  price_date DATE NOT NULL,
  open_price NUMERIC(12,4),
  high_price NUMERIC(12,4),
  low_price NUMERIC(12,4),
  close_price NUMERIC(12,4) NOT NULL,
  volume BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticker, price_date)
);

-- daily_prices is shared data (not user-specific), so RLS allows read for authenticated
ALTER TABLE daily_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read prices"
  ON daily_prices FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage prices"
  ON daily_prices FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_prices_ticker_date ON daily_prices(ticker, price_date DESC);

-- ============================================================
-- 5. SIGNAL_HISTORY (technical analysis signals & scores)
-- ============================================================
CREATE TABLE signal_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker TEXT NOT NULL,
  signal_date DATE NOT NULL,
  -- Individual indicators
  rsi_14 NUMERIC(8,4),
  ema_9 NUMERIC(12,4),
  ema_21 NUMERIC(12,4),
  ema_50 NUMERIC(12,4),
  ema_200 NUMERIC(12,4),
  macd_line NUMERIC(12,4),
  macd_signal NUMERIC(12,4),
  macd_histogram NUMERIC(12,4),
  -- Composite score
  signal_score INTEGER,                        -- -100 to 100 composite
  signal_label TEXT,                            -- 'strong_buy', 'buy', 'neutral', 'sell', 'strong_sell'
  -- Fib context (closest levels relative to current price)
  nearest_fib_support NUMERIC(12,4),
  nearest_fib_resistance NUMERIC(12,4),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticker, signal_date)
);

ALTER TABLE signal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read signals"
  ON signal_history FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage signals"
  ON signal_history FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_signals_ticker_date ON signal_history(ticker, signal_date DESC);
CREATE INDEX idx_signals_label ON signal_history(signal_label, signal_date DESC);

-- ============================================================
-- 6. SECTOR_ROTATION (S&P sector ETF tracking)
-- ============================================================
CREATE TABLE sector_rotation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sector_name TEXT NOT NULL,
  etf_ticker TEXT NOT NULL UNIQUE,
  current_price NUMERIC(12,4),
  change_1d NUMERIC(8,4),                      -- 1-day % change
  change_1w NUMERIC(8,4),                      -- 1-week % change
  change_1m NUMERIC(8,4),                      -- 1-month % change
  change_3m NUMERIC(8,4),                      -- 3-month % change
  change_ytd NUMERIC(8,4),                     -- year-to-date % change
  relative_strength NUMERIC(8,4),              -- vs SPY
  rank INTEGER,                                -- current rotation rank
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Sector rotation is shared reference data
ALTER TABLE sector_rotation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sectors"
  ON sector_rotation FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage sectors"
  ON sector_rotation FOR ALL
  USING (auth.role() = 'service_role');

-- Pre-seed the 11 S&P sector ETFs
INSERT INTO sector_rotation (sector_name, etf_ticker) VALUES
  ('Technology',        'XLK'),
  ('Healthcare',        'XLV'),
  ('Financials',        'XLF'),
  ('Consumer Discretionary', 'XLY'),
  ('Communication Services', 'XLC'),
  ('Industrials',       'XLI'),
  ('Consumer Staples',  'XLP'),
  ('Energy',            'XLE'),
  ('Utilities',         'XLU'),
  ('Real Estate',       'XLRE'),
  ('Materials',         'XLB');

-- ============================================================
-- 7. TREND_SCANNER (broad market / ticker trend detection)
-- ============================================================
CREATE TABLE trend_scanner (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker TEXT NOT NULL,
  scan_date DATE NOT NULL,
  trend_direction TEXT,                        -- 'bullish', 'bearish', 'neutral'
  trend_strength INTEGER,                      -- 1-10
  above_ema_9 BOOLEAN,
  above_ema_21 BOOLEAN,
  above_ema_50 BOOLEAN,
  above_ema_200 BOOLEAN,
  golden_cross BOOLEAN DEFAULT false,          -- EMA 50 crossed above 200
  death_cross BOOLEAN DEFAULT false,           -- EMA 50 crossed below 200
  volume_surge BOOLEAN DEFAULT false,          -- volume > 2x 20-day avg
  breakout_detected BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticker, scan_date)
);

ALTER TABLE trend_scanner ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read trends"
  ON trend_scanner FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage trends"
  ON trend_scanner FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_trend_ticker_date ON trend_scanner(ticker, scan_date DESC);
CREATE INDEX idx_trend_direction ON trend_scanner(trend_direction, scan_date DESC);

-- ============================================================
-- 8. WATCHLIST (tickers to monitor)
-- ============================================================
CREATE TABLE watchlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  company_name TEXT,
  target_buy_price NUMERIC(12,4),
  target_sell_price NUMERIC(12,4),
  alert_on_signal BOOLEAN DEFAULT false,       -- notify on signal_label change
  alert_on_price BOOLEAN DEFAULT false,        -- notify when price hits target
  notes TEXT,
  priority INTEGER DEFAULT 0,                  -- 0=normal, 1=high
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, ticker)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own watchlist"
  ON watchlist FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_watchlist_user ON watchlist(user_id);

-- ============================================================
-- TRIGGER: Auto-recalculate avg_cost on holdings when a trade is recorded
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_avg_cost()
RETURNS TRIGGER AS $$
DECLARE
  v_holding_id UUID;
  v_total_qty NUMERIC;
  v_weighted_cost NUMERIC;
BEGIN
  -- Only recalculate for buy/sell actions linked to a holding
  IF NEW.holding_id IS NULL OR NEW.action NOT IN ('buy', 'sell') THEN
    RETURN NEW;
  END IF;

  v_holding_id := NEW.holding_id;

  -- Calculate weighted average from all buy trades for this holding
  SELECT
    COALESCE(SUM(CASE WHEN action = 'buy' THEN quantity ELSE -quantity END), 0),
    COALESCE(
      SUM(CASE WHEN action = 'buy' THEN quantity * price ELSE 0 END) /
      NULLIF(SUM(CASE WHEN action = 'buy' THEN quantity ELSE 0 END), 0),
      0
    )
  INTO v_total_qty, v_weighted_cost
  FROM trades
  WHERE holding_id = v_holding_id
    AND action IN ('buy', 'sell');

  -- Update the holding
  UPDATE holdings
  SET
    quantity = GREATEST(v_total_qty, 0),
    avg_cost = CASE WHEN v_total_qty > 0 THEN v_weighted_cost ELSE avg_cost END,
    updated_at = now()
  WHERE id = v_holding_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_recalculate_avg_cost
  AFTER INSERT ON trades
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_avg_cost();

-- ============================================================
-- HELPER: Updated_at trigger for tables that need it
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_platforms
  BEFORE UPDATE ON platforms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_holdings
  BEFORE UPDATE ON holdings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_watchlist
  BEFORE UPDATE ON watchlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Done! 8 tables, RLS policies, indexes, triggers, seed data.
-- ============================================================
