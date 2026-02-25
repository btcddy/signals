// ============================================================
// CSV Import — Auto-detect Schwab, Fidelity, Robinhood formats
// Parses, validates, maps trades. DB trigger handles avg cost.
// ============================================================

import Papa from 'papaparse';
import type { BrokerageFormat, TradeInsert } from '@/types';

interface RawRow {
  [key: string]: string;
}

// ---- Format Detection ----

export function detectBrokerageFormat(headers: string[]): BrokerageFormat {
  const normalized = headers.map((h) => h.toLowerCase().trim());

  // Schwab: "Date", "Action", "Symbol", "Description", "Quantity", "Price", "Fees & Comm", "Amount"
  if (normalized.includes('fees & comm') || normalized.includes('fees & commissions')) {
    return 'schwab';
  }

  // Fidelity: "Run Date", "Action", "Symbol", "Description", "Type", "Quantity", "Price ($)", "Amount ($)"
  if (normalized.includes('run date') || normalized.includes('price ($)')) {
    return 'fidelity';
  }

  // Robinhood: "Activity Date", "Process Date", "Settle Date", "Instrument", "Trans Code", "Quantity", "Price", "Amount"
  if (normalized.includes('activity date') || normalized.includes('trans code') || normalized.includes('instrument')) {
    return 'robinhood';
  }

  return 'unknown';
}

// ---- Parsers by Format ----

function parseSchwabRow(row: RawRow, userId: string, platformId?: string): TradeInsert | null {
  const action = row['Action']?.toLowerCase() || '';
  if (!action.includes('buy') && !action.includes('sell')) return null;

  const ticker = row['Symbol']?.trim();
  if (!ticker) return null;

  const quantity = Math.abs(parseFloat(row['Quantity']?.replace(/,/g, '') || '0'));
  const price = Math.abs(parseFloat(row['Price']?.replace(/[$,]/g, '') || '0'));
  const fees = Math.abs(parseFloat(row['Fees & Comm']?.replace(/[$,]/g, '') || '0'));

  if (quantity === 0 || price === 0) return null;

  return {
    user_id: userId,
    holding_id: null,
    platform_id: platformId || null,
    ticker,
    action: action.includes('buy') ? 'buy' : 'sell',
    quantity,
    price,
    fees,
    trade_date: formatDate(row['Date'] || ''),
    notes: row['Description'] || null,
    source: 'csv_import',
  };
}

function parseFidelityRow(row: RawRow, userId: string, platformId?: string): TradeInsert | null {
  const action = row['Action']?.toLowerCase() || '';
  if (!action.includes('bought') && !action.includes('sold') &&
      !action.includes('buy') && !action.includes('sell')) return null;

  const ticker = row['Symbol']?.trim();
  if (!ticker || ticker === '') return null;

  const quantity = Math.abs(parseFloat(row['Quantity']?.replace(/,/g, '') || '0'));
  const priceKey = Object.keys(row).find((k) => k.toLowerCase().includes('price')) || 'Price';
  const price = Math.abs(parseFloat(row[priceKey]?.replace(/[$,]/g, '') || '0'));

  if (quantity === 0 || price === 0) return null;

  const dateKey = Object.keys(row).find((k) => k.toLowerCase().includes('run date')) || 'Run Date';

  return {
    user_id: userId,
    holding_id: null,
    platform_id: platformId || null,
    ticker,
    action: action.includes('bought') || action.includes('buy') ? 'buy' : 'sell',
    quantity,
    price,
    fees: 0,
    trade_date: formatDate(row[dateKey] || ''),
    notes: row['Description'] || null,
    source: 'csv_import',
  };
}

function parseRobinhoodRow(row: RawRow, userId: string, platformId?: string): TradeInsert | null {
  const transCode = row['Trans Code']?.toLowerCase() || '';
  if (!transCode.includes('buy') && !transCode.includes('sell')) return null;

  const ticker = row['Instrument']?.trim();
  if (!ticker) return null;

  const quantity = Math.abs(parseFloat(row['Quantity']?.replace(/,/g, '') || '0'));
  const price = Math.abs(parseFloat(row['Price']?.replace(/[$,]/g, '') || '0'));

  if (quantity === 0 || price === 0) return null;

  return {
    user_id: userId,
    holding_id: null,
    platform_id: platformId || null,
    ticker,
    action: transCode.includes('buy') ? 'buy' : 'sell',
    quantity,
    price,
    fees: 0,
    trade_date: formatDate(row['Activity Date'] || ''),
    notes: null,
    source: 'csv_import',
  };
}

// ---- Helpers ----

function formatDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];

  // Try MM/DD/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD (already in correct format)
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }

  // Fallback: let JS parse it
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date().toISOString().split('T')[0] : parsed.toISOString().split('T')[0];
}

// ---- Main Entry Point ----

export function parseCSV(
  csvText: string,
  userId: string,
  platformId?: string
): { format: BrokerageFormat; trades: TradeInsert[]; errors: string[] } {
  const errors: string[] = [];

  // Parse CSV
  const parsed = Papa.parse<RawRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    errors.push(...parsed.errors.map((e) => `Row ${e.row}: ${e.message}`));
  }

  if (parsed.data.length === 0) {
    return { format: 'unknown', trades: [], errors: ['No data rows found in CSV'] };
  }

  // Detect format
  const headers = parsed.meta.fields || [];
  const format = detectBrokerageFormat(headers);

  if (format === 'unknown') {
    return {
      format,
      trades: [],
      errors: [`Could not detect brokerage format. Headers found: ${headers.join(', ')}`],
    };
  }

  // Parse rows based on detected format
  const parser =
    format === 'schwab' ? parseSchwabRow :
    format === 'fidelity' ? parseFidelityRow :
    parseRobinhoodRow;

  const trades: TradeInsert[] = [];
  for (let i = 0; i < parsed.data.length; i++) {
    try {
      const trade = parser(parsed.data[i], userId, platformId);
      if (trade) trades.push(trade);
    } catch (err) {
      errors.push(`Row ${i + 2}: ${(err as Error).message}`);
    }
  }

  return { format, trades, errors };
}
