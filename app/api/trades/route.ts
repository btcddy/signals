import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { TradeInsert } from '@/types';

// GET /api/trades — list trades for the authenticated user
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get('ticker');
  const holdingId = searchParams.get('holding_id');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('trades')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('trade_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (ticker) query = query.eq('ticker', ticker.toUpperCase());
  if (holdingId) query = query.eq('holding_id', holdingId);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ trades: data, total: count });
}

// POST /api/trades — record a new trade (manual entry)
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body: Partial<TradeInsert> = await req.json();

  // Validate required fields
  if (!body.ticker || !body.action || !body.quantity || !body.price) {
    return NextResponse.json(
      { error: 'ticker, action, quantity, and price are required' },
      { status: 400 }
    );
  }

  const validActions = ['buy', 'sell', 'dividend', 'split'];
  if (!validActions.includes(body.action)) {
    return NextResponse.json(
      { error: `action must be one of: ${validActions.join(', ')}` },
      { status: 400 }
    );
  }

  const trade = {
    ...body,
    user_id: user.id,
    ticker: body.ticker.toUpperCase(),
    source: body.source || 'manual',
    trade_date: body.trade_date || new Date().toISOString().split('T')[0],
  };

  const { data, error } = await supabase
    .from('trades')
    .insert(trade)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The DB trigger automatically recalculates avg_cost on the linked holding
  return NextResponse.json({ trade: data }, { status: 201 });
}
