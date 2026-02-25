import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { fetchBatchPrices, extractClosePrices, getLatestClose } from '@/lib/services/price-service';
import { generateSignals } from '@/lib/services/signal-engine';

// GET /api/signals/cron — nightly update (protected by CRON_SECRET)
// Call via: GET /api/signals/cron?secret=YOUR_CRON_SECRET
// Or set up as a Vercel Cron Job with Authorization header
export async function GET(req: NextRequest) {
  // Verify cron secret
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret') || req.headers.get('authorization')?.replace('Bearer ', '');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: { ticker: string; status: string; signal_label?: string; signal_score?: number }[] = [];

  try {
    // 1. Get all unique tickers from active holdings across all users
    const { data: holdings, error: holdingsError } = await supabaseAdmin
      .from('holdings')
      .select('ticker')
      .eq('is_active', true);

    if (holdingsError) throw holdingsError;

    // Also include watchlist tickers
    const { data: watchlist, error: watchlistError } = await supabaseAdmin
      .from('watchlist')
      .select('ticker');

    if (watchlistError) throw watchlistError;

    // Deduplicate tickers
    const tickerSet = new Set<string>();
    holdings?.forEach((h) => tickerSet.add(h.ticker.toUpperCase()));
    watchlist?.forEach((w) => tickerSet.add(w.ticker.toUpperCase()));
    const tickers = Array.from(tickerSet);

    if (tickers.length === 0) {
      return NextResponse.json({
        message: 'No active tickers to update',
        duration_ms: Date.now() - startTime,
      });
    }

    console.log(`[Cron] Updating ${tickers.length} tickers: ${tickers.join(', ')}`);

    // 2. Fetch prices for all tickers (rate-limited)
    const priceMap = await fetchBatchPrices(tickers);

    const today = new Date().toISOString().split('T')[0];

    // 3. Process each ticker
    for (const ticker of tickers) {
      const prices = priceMap.get(ticker);
      if (!prices || prices.length === 0) {
        results.push({ ticker, status: 'no_data' });
        continue;
      }

      try {
        // Upsert daily prices (last 100 days)
        const priceRows = prices.map((p) => ({
          ticker,
          price_date: p.date,
          open_price: p.open,
          high_price: p.high,
          low_price: p.low,
          close_price: p.close,
          volume: p.volume,
        }));

        const { error: priceError } = await supabaseAdmin
          .from('daily_prices')
          .upsert(priceRows, { onConflict: 'ticker,price_date' });

        if (priceError) console.error(`[Cron] Price upsert error for ${ticker}:`, priceError.message);

        // Generate signals
        const closePrices = extractClosePrices(prices);
        const signal = generateSignals(ticker, closePrices, today);

        // Upsert signal
        const { error: signalError } = await supabaseAdmin
          .from('signal_history')
          .upsert({
            ticker,
            signal_date: today,
            rsi_14: signal.rsi_14,
            ema_9: signal.ema_9,
            ema_21: signal.ema_21,
            ema_50: signal.ema_50,
            ema_200: signal.ema_200,
            macd_line: signal.macd_line,
            macd_signal: signal.macd_signal,
            macd_histogram: signal.macd_histogram,
            signal_score: signal.signal_score,
            signal_label: signal.signal_label,
            nearest_fib_support: signal.nearest_fib_support,
            nearest_fib_resistance: signal.nearest_fib_resistance,
          }, { onConflict: 'ticker,signal_date' });

        if (signalError) console.error(`[Cron] Signal upsert error for ${ticker}:`, signalError.message);

        // Update current_price on all holdings with this ticker
        const latestPrice = getLatestClose(prices);
        if (latestPrice) {
          await supabaseAdmin
            .from('holdings')
            .update({ current_price: latestPrice })
            .eq('ticker', ticker)
            .eq('is_active', true);
        }

        results.push({
          ticker,
          status: 'ok',
          signal_label: signal.signal_label,
          signal_score: signal.signal_score,
        });
      } catch (tickerError) {
        results.push({ ticker, status: `error: ${(tickerError as Error).message}` });
      }
    }

    return NextResponse.json({
      message: `Updated ${results.filter((r) => r.status === 'ok').length}/${tickers.length} tickers`,
      duration_ms: Date.now() - startTime,
      results,
    });
  } catch (err) {
    console.error('[Cron] Fatal error:', err);
    return NextResponse.json(
      { error: (err as Error).message, duration_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}
