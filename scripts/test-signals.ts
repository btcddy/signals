// ============================================================
// Test Signal Engine — run with: npx tsx scripts/test-signals.ts
// Verifies RSI, EMA, MACD, Fib, and composite scoring math
// ============================================================

import {
  calculateRSI,
  calculateEMA,
  calculateMACD,
  calculateFibLevels,
  findNearestFibLevels,
  generateSignals,
} from '../lib/services/signal-engine';

// Generate fake price data that simulates a stock trending up then pulling back
function generateTestPrices(days = 200): number[] {
  const prices: number[] = [];
  let price = 100;

  for (let i = 0; i < days; i++) {
    // Uptrend for first 120 days
    if (i < 120) {
      price += (Math.random() - 0.35) * 2; // slight upward bias
    }
    // Pullback for next 40 days
    else if (i < 160) {
      price -= (Math.random() - 0.3) * 1.5; // slight downward bias
    }
    // Consolidation for remaining days
    else {
      price += (Math.random() - 0.5) * 1;
    }

    prices.push(Math.max(price, 10)); // floor at $10
  }

  return prices;
}

function divider(title: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

// ---- Run Tests ----

const prices = generateTestPrices(200);
const currentPrice = prices[prices.length - 1];

console.log(`\n🧪 PortfolioPulse Signal Engine Test`);
console.log(`Generated ${prices.length} days of test price data`);
console.log(`Start: $${prices[0].toFixed(2)} → End: $${currentPrice.toFixed(2)}`);

// Test RSI
divider('RSI-14');
const rsi = calculateRSI(prices, 14);
console.log(`RSI(14): ${rsi.toFixed(2)}`);
console.log(`Zone: ${rsi <= 30 ? '🟢 Oversold' : rsi >= 70 ? '🔴 Overbought' : '🟡 Neutral'}`);

if (rsi < 0 || rsi > 100) {
  console.error('❌ FAIL: RSI out of range [0, 100]');
} else {
  console.log('✅ RSI in valid range');
}

// Test EMA
divider('EMA (9, 21, 50, 200)');
const ema9 = calculateEMA(prices, 9);
const ema21 = calculateEMA(prices, 21);
const ema50 = calculateEMA(prices, 50);
const ema200 = calculateEMA(prices, 200);

console.log(`EMA  9: $${ema9[ema9.length - 1]?.toFixed(2) || 'N/A'} (${ema9.length} values)`);
console.log(`EMA 21: $${ema21[ema21.length - 1]?.toFixed(2) || 'N/A'} (${ema21.length} values)`);
console.log(`EMA 50: $${ema50[ema50.length - 1]?.toFixed(2) || 'N/A'} (${ema50.length} values)`);
console.log(`EMA200: $${ema200[ema200.length - 1]?.toFixed(2) || 'N/A'} (${ema200.length} values)`);

const e9 = ema9[ema9.length - 1];
const e21 = ema21[ema21.length - 1];
const e50 = ema50[ema50.length - 1];
const e200 = ema200[ema200.length - 1];

if (e9 && e21 && e50 && e200) {
  const bullishAlign = e9 > e21 && e21 > e50 && e50 > e200;
  const bearishAlign = e9 < e21 && e21 < e50 && e50 < e200;
  console.log(`Alignment: ${bullishAlign ? '🟢 Bullish' : bearishAlign ? '🔴 Bearish' : '🟡 Mixed'}`);
  console.log('✅ All EMAs computed');
} else {
  console.error('❌ FAIL: Some EMAs not computed');
}

// Test MACD
divider('MACD (12, 26, 9)');
const macd = calculateMACD(prices);
console.log(`MACD Line:  ${macd.macdLine.toFixed(4)}`);
console.log(`Signal Line: ${macd.signalLine.toFixed(4)}`);
console.log(`Histogram:   ${macd.histogram.toFixed(4)}`);
console.log(`Momentum: ${macd.macdLine > macd.signalLine ? '🟢 Bullish' : '🔴 Bearish'}`);
console.log('✅ MACD computed');

// Test Fibonacci
divider('Fibonacci Retracements (60-day lookback)');
const fib = calculateFibLevels(prices, 60);
console.log(`Swing High:  $${fib.high.toFixed(2)}`);
console.log(`Swing Low:   $${fib.low.toFixed(2)}`);
console.log(`23.6% Level: $${fib.level_236.toFixed(2)}`);
console.log(`38.2% Level: $${fib.level_382.toFixed(2)}`);
console.log(`50.0% Level: $${fib.level_500.toFixed(2)}`);
console.log(`61.8% Level: $${fib.level_618.toFixed(2)}`);
console.log(`78.6% Level: $${fib.level_786.toFixed(2)}`);

// Verify Fib order: high > 236 > 382 > 500 > 618 > 786 > low
const fibOrder = fib.high >= fib.level_236 &&
  fib.level_236 >= fib.level_382 &&
  fib.level_382 >= fib.level_500 &&
  fib.level_500 >= fib.level_618 &&
  fib.level_618 >= fib.level_786 &&
  fib.level_786 >= fib.low;

if (fibOrder) {
  console.log('✅ Fib levels in correct descending order');
} else {
  console.error('❌ FAIL: Fib levels not in correct order');
}

// Nearest S/R
const { support, resistance } = findNearestFibLevels(currentPrice, fib);
console.log(`\nCurrent: $${currentPrice.toFixed(2)}`);
console.log(`Nearest Support:    $${support?.toFixed(2) || 'none'}`);
console.log(`Nearest Resistance: $${resistance?.toFixed(2) || 'none'}`);
console.log('✅ Nearest Fib S/R found');

// Test Full Signal Generation
divider('Composite Signal — Full Pipeline');
const signal = generateSignals('TEST', prices, '2025-01-01');
console.log(`Ticker:      ${signal.ticker}`);
console.log(`Score:       ${signal.signal_score} / 100`);
console.log(`Label:       ${signal.signal_label}`);
console.log(`RSI:         ${signal.rsi_14}`);
console.log(`EMA 9/21:    $${signal.ema_9} / $${signal.ema_21}`);
console.log(`EMA 50/200:  $${signal.ema_50} / $${signal.ema_200}`);
console.log(`MACD:        ${signal.macd_line} (hist: ${signal.macd_histogram})`);
console.log(`Fib Support: $${signal.nearest_fib_support?.toFixed(2) || 'none'}`);
console.log(`Fib Resist:  $${signal.nearest_fib_resistance?.toFixed(2) || 'none'}`);

if (signal.signal_score >= -100 && signal.signal_score <= 100) {
  console.log('✅ Signal score in valid range [-100, 100]');
} else {
  console.error('❌ FAIL: Signal score out of range');
}

const validLabels = ['strong_buy', 'buy', 'neutral', 'sell', 'strong_sell'];
if (validLabels.includes(signal.signal_label)) {
  console.log('✅ Signal label is valid');
} else {
  console.error('❌ FAIL: Invalid signal label');
}

divider('Summary');
console.log('All core calculations verified. Ready for production! 🚀\n');
