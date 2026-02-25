// ============================================================
// Signal Engine — Technical Analysis & Composite Scoring
// ============================================================
// Fib position (30%) + RSI (20%) + EMA alignment (20%) +
// S/R proximity (15%) + MACD momentum (15%)
// ============================================================

import type { FibLevels, SignalLabel, SignalResult } from '@/types';

// ---- Fibonacci Retracement (60-day lookback) ----

export function calculateFibLevels(prices: number[], lookback = 60): FibLevels {
  const window = prices.slice(-lookback);
  const high = Math.max(...window);
  const low = Math.min(...window);
  const range = high - low;

  return {
    high,
    low,
    level_236: high - range * 0.236,
    level_382: high - range * 0.382,
    level_500: high - range * 0.5,
    level_618: high - range * 0.618,
    level_786: high - range * 0.786,
  };
}

export function findNearestFibLevels(
  currentPrice: number,
  fib: FibLevels
): { support: number | null; resistance: number | null } {
  const levels = [fib.low, fib.level_786, fib.level_618, fib.level_500, fib.level_382, fib.level_236, fib.high];

  let support: number | null = null;
  let resistance: number | null = null;

  for (const level of levels) {
    if (level <= currentPrice) {
      if (!support || level > support) support = level;
    }
    if (level >= currentPrice) {
      if (!resistance || level < resistance) resistance = level;
    }
  }

  return { support, resistance };
}

// Score: -30 to +30 based on Fib zone position
function scoreFibPosition(price: number, fib: FibLevels): number {
  const range = fib.high - fib.low;
  if (range === 0) return 0;

  const position = (price - fib.low) / range; // 0 = at low, 1 = at high

  // Near 0.618 or 0.786 (golden zone) = bullish bounce opportunity
  if (position >= 0.6 && position <= 0.65) return 20;
  if (position >= 0.75 && position <= 0.8) return 15;
  // Near 0.382 = mild pullback, neutral-bullish
  if (position >= 0.35 && position <= 0.4) return 10;
  // Above the high = breakout
  if (position > 1) return 25;
  // Below the low = breakdown
  if (position < 0) return -25;
  // Above 0.236 = healthy uptrend
  if (position > 0.764) return 5;
  // Lower zone = bearish
  if (position < 0.3) return -15;

  return 0;
}

// ---- RSI-14 ----

export function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50; // not enough data

  let gains = 0;
  let losses = 0;

  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smooth with Wilder's method
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Score: -20 to +20 based on RSI zone
function scoreRSI(rsi: number): number {
  if (rsi <= 30) return 20;       // oversold — bullish reversal
  if (rsi <= 40) return 10;
  if (rsi >= 70) return -20;      // overbought — bearish
  if (rsi >= 60) return -10;
  return 0;                       // neutral zone
}

// ---- EMA (Exponential Moving Average) ----

export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];

  const multiplier = 2 / (period + 1);
  const emaValues: number[] = [];

  // SMA for the first value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  emaValues.push(sum / period);

  // EMA for subsequent values
  for (let i = period; i < prices.length; i++) {
    const ema = (prices[i] - emaValues[emaValues.length - 1]) * multiplier + emaValues[emaValues.length - 1];
    emaValues.push(ema);
  }

  return emaValues;
}

function getLatestEMA(prices: number[], period: number): number {
  const ema = calculateEMA(prices, period);
  return ema.length > 0 ? ema[ema.length - 1] : prices[prices.length - 1];
}

// Score: -20 to +20 based on EMA alignment
function scoreEMAAlignment(price: number, ema9: number, ema21: number, ema50: number, ema200: number): number {
  let score = 0;

  // Price above key EMAs = bullish
  if (price > ema9) score += 5;
  if (price > ema21) score += 4;
  if (price > ema50) score += 4;
  if (price > ema200) score += 3;

  // Perfect bullish alignment: 9 > 21 > 50 > 200
  if (ema9 > ema21 && ema21 > ema50 && ema50 > ema200) score += 4;
  // Perfect bearish alignment: 9 < 21 < 50 < 200
  if (ema9 < ema21 && ema21 < ema50 && ema50 < ema200) score -= 4;

  // Price below key EMAs = bearish
  if (price < ema9) score -= 5;
  if (price < ema21) score -= 4;
  if (price < ema50) score -= 4;
  if (price < ema200) score -= 3;

  return Math.max(-20, Math.min(20, score));
}

// ---- S/R Proximity ----

function scoreSRProximity(
  price: number,
  fibSupport: number | null,
  fibResistance: number | null
): number {
  if (!fibSupport && !fibResistance) return 0;

  let score = 0;

  // Near support = bullish (potential bounce)
  if (fibSupport) {
    const distToSupport = (price - fibSupport) / price;
    if (distToSupport <= 0.02) score += 12;      // within 2%
    else if (distToSupport <= 0.05) score += 6;  // within 5%
  }

  // Near resistance = bearish (potential rejection)
  if (fibResistance) {
    const distToResistance = (fibResistance - price) / price;
    if (distToResistance <= 0.02) score -= 12;
    else if (distToResistance <= 0.05) score -= 6;
  }

  return Math.max(-15, Math.min(15, score));
}

// ---- MACD (12, 26, 9) ----

export function calculateMACD(prices: number[]): {
  macdLine: number;
  signalLine: number;
  histogram: number;
} {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  if (ema12.length === 0 || ema26.length === 0) {
    return { macdLine: 0, signalLine: 0, histogram: 0 };
  }

  // Align arrays — EMA26 starts later so has fewer values
  const offset = ema12.length - ema26.length;
  const macdValues: number[] = [];
  for (let i = 0; i < ema26.length; i++) {
    macdValues.push(ema12[i + offset] - ema26[i]);
  }

  // Signal line = 9-period EMA of MACD line
  const signalEMA = calculateEMA(macdValues, 9);
  const macdLine = macdValues[macdValues.length - 1];
  const signalLine = signalEMA.length > 0 ? signalEMA[signalEMA.length - 1] : 0;

  return {
    macdLine,
    signalLine,
    histogram: macdLine - signalLine,
  };
}

// Score: -15 to +15 based on MACD momentum
function scoreMACDMomentum(macdLine: number, signalLine: number, histogram: number): number {
  let score = 0;

  // MACD above signal = bullish
  if (macdLine > signalLine) score += 7;
  else score -= 7;

  // Histogram growing = momentum increasing
  if (histogram > 0) score += 5;
  else score -= 5;

  // Both MACD and signal above zero = strong bull
  if (macdLine > 0 && signalLine > 0) score += 3;
  else if (macdLine < 0 && signalLine < 0) score -= 3;

  return Math.max(-15, Math.min(15, score));
}

// ---- Composite Signal Score ----

function labelFromScore(score: number): SignalLabel {
  if (score >= 50) return 'strong_buy';
  if (score >= 20) return 'buy';
  if (score <= -50) return 'strong_sell';
  if (score <= -20) return 'sell';
  return 'neutral';
}

// ---- Main Entry Point ----

export function generateSignals(
  ticker: string,
  closePrices: number[], // oldest → newest
  date: string
): SignalResult {
  const currentPrice = closePrices[closePrices.length - 1];

  // Calculate all indicators
  const fib = calculateFibLevels(closePrices, 60);
  const { support, resistance } = findNearestFibLevels(currentPrice, fib);
  const rsi = calculateRSI(closePrices, 14);
  const ema9 = getLatestEMA(closePrices, 9);
  const ema21 = getLatestEMA(closePrices, 21);
  const ema50 = getLatestEMA(closePrices, 50);
  const ema200 = getLatestEMA(closePrices, 200);
  const macd = calculateMACD(closePrices);

  // Composite score: -100 to +100
  const fibScore = scoreFibPosition(currentPrice, fib);           // 30% weight (max ±30)
  const rsiScore = scoreRSI(rsi);                                 // 20% weight (max ±20)
  const emaScore = scoreEMAAlignment(currentPrice, ema9, ema21, ema50, ema200); // 20% (max ±20)
  const srScore = scoreSRProximity(currentPrice, support, resistance);          // 15% (max ±15)
  const macdScore = scoreMACDMomentum(macd.macdLine, macd.signalLine, macd.histogram); // 15% (max ±15)

  const totalScore = fibScore + rsiScore + emaScore + srScore + macdScore;
  const clampedScore = Math.max(-100, Math.min(100, totalScore));

  return {
    ticker,
    date,
    rsi_14: Math.round(rsi * 100) / 100,
    ema_9: Math.round(ema9 * 100) / 100,
    ema_21: Math.round(ema21 * 100) / 100,
    ema_50: Math.round(ema50 * 100) / 100,
    ema_200: Math.round(ema200 * 100) / 100,
    macd_line: Math.round(macd.macdLine * 10000) / 10000,
    macd_signal: Math.round(macd.signalLine * 10000) / 10000,
    macd_histogram: Math.round(macd.histogram * 10000) / 10000,
    fib_levels: fib,
    signal_score: clampedScore,
    signal_label: labelFromScore(clampedScore),
    nearest_fib_support: support,
    nearest_fib_resistance: resistance,
  };
}
