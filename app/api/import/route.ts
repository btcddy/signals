import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { parseCSV } from '@/lib/services/csv-import';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const platformId = formData.get('platform_id') as string | null;

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    if (!platformId) return NextResponse.json({ error: 'platform_id is required' }, { status: 400 });

    const csvText = await file.text();
    const { format, trades, errors } = parseCSV(csvText, user.id, platformId);

    if (trades.length === 0) {
      return NextResponse.json({
        trades_parsed: 0,
        trades_inserted: 0,
        format,
        errors: errors.length > 0 ? errors : ['No valid buy/sell trades found in CSV'],
      }, { status: 400 });
    }

    // Create holdings for each unique ticker
    const tickers = [...new Set(trades.map(t => t.ticker))];
    for (const ticker of tickers) {
      const { data: existing } = await supabase
        .from('holdings')
        .select('id')
        .eq('user_id', user.id)
        .eq('platform_id', platformId)
        .eq('ticker', ticker)
        .single();

      if (!existing) {
        const desc = trades.find(t => t.ticker === ticker);
        await supabase.from('holdings').insert({
          user_id: user.id,
          platform_id: platformId,
          ticker,
          name: ticker,
          shares: 0,
          avg_cost: 0,
        });
      }
    }

    // Insert trades in batches
    let totalInserted = 0;
    const batchSize = 50;

    for (let i = 0; i < trades.length; i += batchSize) {
      const batch = trades.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from('trades')
        .insert(batch)
        .select('id');

      if (error) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      } else {
        totalInserted += (data?.length || 0);
      }
    }

    // Recalculate holdings from all trades
    for (const ticker of tickers) {
      const { data: tickerTrades } = await supabase
        .from('trades')
        .select('action, shares, price')
        .eq('user_id', user.id)
        .eq('ticker', ticker)
        .order('trade_date', { ascending: true });

      if (tickerTrades) {
        let shares = 0;
        let totalCost = 0;

        for (const t of tickerTrades) {
          if (t.action === 'BUY') {
            totalCost += t.shares * t.price;
            shares += t.shares;
          } else {
            shares = Math.max(0, shares - t.shares);
            if (shares === 0) totalCost = 0;
          }
        }

        const avgCost = shares > 0 ? totalCost / shares : 0;

        await supabase
          .from('holdings')
          .update({ shares, avg_cost: avgCost })
          .eq('user_id', user.id)
          .eq('platform_id', platformId)
          .eq('ticker', ticker);
      }
    }

    return NextResponse.json({
      format,
      trades_parsed: trades.length,
      trades_inserted: totalInserted,
      errors,
    }, { status: 201 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}