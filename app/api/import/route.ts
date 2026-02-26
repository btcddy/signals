import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { parseCSV } from '@/lib/services/csv-import';
import type { CSVImportResult } from '@/types';



// POST /api/import — upload CSV from Schwab, Fidelity, or Robinhood
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Parse multipart form data
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const platformId = formData.get('platform_id') as string | null;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  if (!file.name.endsWith('.csv')) {
    return NextResponse.json({ error: 'Only CSV files are supported' }, { status: 400 });
  }

  // Read file contents
  const csvText = await file.text();

  // Parse and detect format
  const { format, trades, errors } = parseCSV(csvText, user.id, platformId || undefined);

  if (format === 'unknown') {
    return NextResponse.json({
      error: 'Unrecognized CSV format',
      details: errors,
    }, { status: 400 });
  }

  if (trades.length === 0) {
    return NextResponse.json({
      format,
      trades_parsed: 0,
      trades_inserted: 0,
      errors: errors.length > 0 ? errors : ['No valid trades found in CSV'],
    } satisfies CSVImportResult);
  }

  // Insert trades in batches of 50
  let totalInserted = 0;
  const batchSize = 50;

  for (let i = 0; i < trades.length; i += batchSize) {
    const batch = trades.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('trades')
      .insert(batch)
      .select('id');

    if (error) {
      errors.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${error.message}`);
    } else {
      totalInserted += (data?.length || 0);
    }
  }

  const result: CSVImportResult = {
    format,
    trades_parsed: trades.length,
    trades_inserted: totalInserted,
    errors,
  };

  return NextResponse.json(result, { status: 201 });
}
