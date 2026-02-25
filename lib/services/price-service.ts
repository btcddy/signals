// ============================================================
// Price Service — Alpha Vantage primary, Polygon.io fallback
// Rate-limited batch fetcher (12.5s between AV calls for free tier)
// With 8 tickers, nightly updates use ~16 of 25 daily AV calls
// ============================================================

import type { PriceData } from '@/types';

const AV_BASE = 'https://www.alphavantage.co/query';
const POLYGON_BASE = 'https://api.polygon.io/v2';
const AV_DELAY_MS = 12_500; // 5 calls/min on free tier = 12s spacing + buffer

// ---- Alpha Vantage ----

async function fetchFromAlphaVantage(ticker: string): Promise<PriceData[]> {
  const apiKey = process.env.GXOTTC9VLO135A80;
  if (!apiKey) throw new Error('ALPHA_VANTAGE_API_KEY not set');

  const url = `${AV_BASE}?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=compact&apikey=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  const timeSeries = data['Time Series (Daily)'];
  if (!timeSeries) {
    const note = data['Note'] || data['Information'] || '';
    throw new Error(`Alpha Vantage error for ${ticker}: ${note || 'No data returned'}`);
  }

  const prices: PriceData[] = [];
  for (const [date, values] of Object.entries(timeSeries) as [string, any][]) {
    prices.push({
      ticker,
      date,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseInt(values['5. volume'], 10),
    });
  }

  // Sort oldest → newest
  return prices.sort((a, b) => a.date.localeCompare(b.date));
}

// ---- Polygon.io Fallback ----

async function fetchFromPolygon(ticker: string): Promise<PriceData[]> {
  const apiKey = process.env.QEco0_cYx_TPihGqMXJZmiDcFcOst1LU;
  if (!apiKey) throw new Error('POLYGON_API_KEY not set');

  // Fetch last 100 trading days
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const url = `${POLYGON_BASE}/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=200&apiKey=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.results || data.results.length === 0) {
    throw new Error(`Polygon error for ${ticker}: No results`);
  }

  return data.results.map((bar: any) => ({
    ticker,
    date: new Date(bar.t).toISOString().split('T')[0],
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
  }));
}

// ---- Public API ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch price history for a single ticker.
 * Tries Alpha Vantage first, falls back to Polygon.io.
 */
export async function fetchPriceHistory(ticker: string): Promise<PriceData[]> {
  try {
    return await fetchFromAlphaVantage(ticker);
  } catch (avError) {
    console.warn(`AV failed for ${ticker}, trying Polygon:`, (avError as Error).message);
    try {
      return await fetchFromPolygon(ticker);
    } catch (polyError) {
      console.error(`Both sources failed for ${ticker}:`, (polyError as Error).message);
      return [];
    }
  }
}

/**
 * Batch fetch prices for multiple tickers with rate limiting.
 * Returns a map of ticker → PriceData[].
 * Each AV call uses 2 of your 25 daily API calls (daily + potentially intraday).
 * With 8 tickers: ~16 calls, leaving 9 spare for ad-hoc queries.
 */
export async function fetchBatchPrices(
  tickers: string[]
): Promise<Map<string, PriceData[]>> {
  const results = new Map<string, PriceData[]>();

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    console.log(`[PriceService] Fetching ${ticker} (${i + 1}/${tickers.length})`);

    const prices = await fetchPriceHistory(ticker);
    if (prices.length > 0) {
      results.set(ticker, prices);
    }

    // Rate limit: wait between AV calls (skip wait after last ticker)
    if (i < tickers.length - 1) {
      console.log(`[PriceService] Rate limiting — waiting ${AV_DELAY_MS / 1000}s...`);
      await sleep(AV_DELAY_MS);
    }
  }

  return results;
}

/**
 * Get just the latest close price for a ticker from an existing price array.
 */
export function getLatestClose(prices: PriceData[]): number | null {
  if (prices.length === 0) return null;
  return prices[prices.length - 1].close;
}

/**
 * Extract close prices as a number array (oldest → newest).
 * This is the format the signal engine expects.
 */
export function extractClosePrices(prices: PriceData[]): number[] {
  return prices.map((p) => p.close);
}
