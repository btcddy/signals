import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch holdings with platform info
  const { data: holdings, error: holdErr } = await supabase
    .from('holdings')
    .select('*, platform:platforms(*)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (holdErr) return NextResponse.json({ error: holdErr.message }, { status: 500 });

  // Fetch recent trades
  const { data: trades } = await supabase
    .from('trades')
    .select('*, platform:platforms(name, display_color, platform_type)')
    .eq('user_id', user.id)
    .order('trade_date', { ascending: false })
    .limit(20);

  // Fetch sector rotation data
  const { data: sectors } = await supabase
    .from('sector_rotation')
    .select('*')
    .order('momentum_score', { ascending: false });

  // Fetch trending stocks
  const { data: trending } = await supabase
    .from('trend_scanner')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  // Fetch platforms
  const { data: platforms } = await supabase
    .from('platforms')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true);

  // Compute sparkline data: last 14 closes per ticker
  const sparklines: Record<string, number[]> = {};
  if (holdings?.length) {
    const tickers = [...new Set(holdings.map(h => h.ticker))];
    for (const ticker of tickers) {
      const { data: prices } = await supabase
        .from('daily_prices')
        .select('close_price')
        .eq('ticker', ticker)
        .order('price_date', { ascending: true })
        .limit(14);
      if (prices?.length) {
        sparklines[ticker] = prices.map(p => p.close_price);
      }
    }
  }

  return NextResponse.json({
    holdings: holdings || [],
    trades: trades || [],
    sectors: sectors || [],
    trending: trending || [],
    platforms: platforms || [],
    sparklines,
  });
}