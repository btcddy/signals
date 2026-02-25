import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import type { HoldingInsert } from '@/types';

// GET /api/holdings — list all holdings for the authenticated user
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get('active') !== 'false';
  const sector = searchParams.get('sector');
  const platformId = searchParams.get('platform_id');

  let query = supabase
    .from('holdings')
    .select('*')
    .eq('user_id', user.id)
    .order('ticker', { ascending: true });

  if (activeOnly) query = query.eq('is_active', true);
  if (sector) query = query.eq('sector', sector);
  if (platformId) query = query.eq('platform_id', platformId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ holdings: data });
}

// POST /api/holdings — create a new holding
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body: Partial<HoldingInsert> = await req.json();

  if (!body.ticker) {
    return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
  }

  const holding = {
    ...body,
    user_id: user.id,
    ticker: body.ticker.toUpperCase(),
  };

  const { data, error } = await supabase
    .from('holdings')
    .insert(holding)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ holding: data }, { status: 201 });
}

// PATCH /api/holdings — update a holding (S/R levels, fib levels, notes, etc.)
export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // Don't allow changing user_id
  delete updates.user_id;

  const { data, error } = await supabase
    .from('holdings')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id) // RLS double-check
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ holding: data });
}
