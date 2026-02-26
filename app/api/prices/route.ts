import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// GET /api/prices?ticker=AAPL&days=30 — sparkline data
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get('ticker');
  const days = parseInt(searchParams.get('days') || '30', 10);

  if (!ticker) {
    return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
  }

  // Calculate date range
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromStr = fromDate.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_prices')
    .select('price_date, close_price, open_price, high_price, low_price, volume')
    .eq('ticker', ticker.toUpperCase())
    .gte('price_date', fromStr)
    .order('price_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ticker: ticker.toUpperCase(),
    days,
    prices: data,
  });
}
