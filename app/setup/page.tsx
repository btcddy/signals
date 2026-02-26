'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const PLATFORM_PRESETS = [
  { type: 'schwab', name: 'Charles Schwab', color: '#38bdf8', icon: '🏦' },
  { type: 'fidelity', name: 'Fidelity', color: '#34d399', icon: '🏛️' },
  { type: 'robinhood', name: 'Robinhood', color: '#fbbf24', icon: '🪶' },
  { type: 'alightfs', name: 'AlightFS (NetXInvestor)', color: '#c084fc', icon: '💎' },
  { type: 'webull', name: 'Webull', color: '#f87171', icon: '📊' },
  { type: 'etrade', name: "E*TRADE", color: '#a78bfa', icon: '📈' },
  { type: 'interactive_brokers', name: 'Interactive Brokers', color: '#fb923c', icon: '🌐' },
  { type: 'other', name: 'Other', color: '#94a3b8', icon: '➕' },
];

const SECTORS = ['Tech', 'Healthcare', 'Financials', 'Energy', 'Consumer Disc.', 'Industrials', 'Utilities', 'Real Estate', 'Materials', 'Comm. Services', 'Staples', 'Index', 'ETF', 'Crypto', 'Clean Energy', 'Telecom', 'Dividend', 'Other'];

const FORMAT_HELP: Record<string, { path: string; filename: string; columns: string }> = {
  schwab: { path: 'Accounts → History → Export', filename: 'XXXX1234_Transactions_YYYYMMDD.csv', columns: 'Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount' },
  fidelity: { path: 'Accounts → Activity & Orders → Download', filename: 'History_for_Account_XXXX.csv', columns: 'Run Date, Account, Action, Symbol, Description, Type, Quantity, Price, Commission, Fees' },
  robinhood: { path: 'Account → Statements → Download CSV', filename: 'account_statement_YYYY.csv', columns: 'Activity Date, Instrument, Trans Code, Quantity, Price, Amount' },
  alightfs: { path: 'Portfolio → History → Download/Export icon (top-right)', filename: 'TransactionHistory.csv', columns: 'Trade Date, Symbol, Description, Action, Quantity, Price, Commission, Net Amount' },
};

const glass = { background: 'rgba(255,255,255,.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 16 };

type Notification = { msg: string; type: 'success' | 'error' | 'info' } | null;
type SavedPlatform = { id: string; name: string; platform_type: string; display_color: string };

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState('platforms');
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [accountHints, setAccountHints] = useState<Record<string, string>>({});
  const [savedPlatforms, setSavedPlatforms] = useState<SavedPlatform[]>([]);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [notification, setNotification] = useState<Notification>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setReady(true)); }, []);

  const notify = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const anim = (delay: number) => ({
    opacity: ready ? 1 : 0,
    transform: ready ? 'translateY(0)' : 'translateY(12px)',
    transition: `all .5s cubic-bezier(.16,1,.3,1) ${delay}ms`,
  });

  // ── Save platforms to Supabase
  const savePlatforms = async () => {
    setSaving(true);
    const saved: SavedPlatform[] = [];
    for (const type of selectedPresets) {
      const preset = PLATFORM_PRESETS.find(p => p.type === type)!;
      try {
        const res = await fetch('/api/platforms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: customNames[type] || preset.name,
            platform_type: type,
            display_color: preset.color,
            account_number: accountHints[type] || null,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          saved.push(data);
        } else {
          notify(`Failed to save ${preset.name}: ${data.error}`, 'error');
        }
      } catch (err: any) {
        notify(`Error saving ${preset.name}: ${err.message}`, 'error');
      }
    }
    setSavedPlatforms(saved);
    setSaving(false);
    if (saved.length > 0) {
      notify(`${saved.length} platform${saved.length > 1 ? 's' : ''} saved`);
      setStep('manual');
    }
  };

  // ── Save a holding to Supabase
  const saveHolding = async (form: any) => {
    const platform = savedPlatforms.find(p => p.platform_type === form.platformType);
    if (!platform) {
      notify('Select a valid platform', 'error');
      return false;
    }
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: form.ticker.toUpperCase(),
          name: form.name || null,
          shares: parseFloat(form.shares),
          avg_cost: parseFloat(form.avgCost),
          platform_id: platform.id,
          sector: form.sector || null,
          support_price: form.support ? parseFloat(form.support) : null,
          resistance_price: form.resistance ? parseFloat(form.resistance) : null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setHoldings([...holdings, { ...form, id: data.id, ticker: form.ticker.toUpperCase() }]);
        notify(`${form.ticker.toUpperCase()} added`);
        return true;
      } else {
        notify(data.error || 'Failed to save', 'error');
        return false;
      }
    } catch (err: any) {
      notify(err.message, 'error');
      return false;
    }
  };

  // ── CSV Import
  const handleImport = async (file: File, platformId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('platform_id', platformId);
    try {
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      return await res.json();
    } catch (err: any) {
      return { error: err.message };
    }
  };

  const steps = [
    { key: 'platforms', label: '1. Platforms', icon: '🏦' },
    { key: 'manual', label: '2. Add Holdings', icon: '📋' },
    { key: 'import', label: '3. CSV Import', icon: '📁' },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: '#060a13', color: '#e2e8f0', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:3px}
        .btn-p{padding:10px 24px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:linear-gradient(135deg,#38bdf8,#34d399);color:#060a13;font-family:'DM Sans',sans-serif;transition:all .2s;box-shadow:0 4px 20px rgba(56,189,248,.2)}
        .btn-p:hover{transform:translateY(-1px);box-shadow:0 6px 28px rgba(56,189,248,.3)}
        .btn-p:disabled{opacity:.4;cursor:not-allowed;transform:none}
        .btn-g{padding:10px 24px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#94a3b8;font-family:'DM Sans',sans-serif;transition:all .2s}
        .btn-g:hover{background:rgba(255,255,255,.06);color:#e2e8f0}
        .inp{width:100%;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#e2e8f0;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;transition:border .2s}
        .inp:focus{border-color:rgba(56,189,248,.4)}
        .inp::placeholder{color:#475569}
        .lbl{display:block;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
        .mono{font-family:'Space Mono',monospace}
        select.inp{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:36px}
        @keyframes pulse-glow{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .drop-zone{border:2px dashed rgba(255,255,255,.1);border-radius:16px;padding:48px;text-align:center;transition:all .3s;cursor:pointer}
        .drop-zone:hover,.drop-zone.active{border-color:rgba(56,189,248,.4);background:rgba(56,189,248,.04)}
        .toast{position:fixed;top:24px;right:24px;padding:14px 22px;border-radius:12px;font-size:13px;font-weight:600;z-index:300;animation:slideUp .3s ease;backdrop-filter:blur(16px)}
      `}</style>

      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '50%', height: '50%', background: 'radial-gradient(ellipse,rgba(56,189,248,.05) 0%,transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '50%', height: '50%', background: 'radial-gradient(ellipse,rgba(52,211,153,.04) 0%,transparent 70%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      {/* Toast */}
      {notification && (
        <div className="toast" style={{
          background: notification.type === 'success' ? 'rgba(52,211,153,.15)' : notification.type === 'error' ? 'rgba(248,113,113,.15)' : 'rgba(56,189,248,.15)',
          border: `1px solid ${notification.type === 'success' ? '#34d399' : notification.type === 'error' ? '#f87171' : '#38bdf8'}33`,
          color: notification.type === 'success' ? '#34d399' : notification.type === 'error' ? '#f87171' : '#38bdf8',
        }}>
          {notification.type === 'success' ? '✓' : notification.type === 'error' ? '✕' : 'ℹ'} {notification.msg}
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ marginBottom: 36, ...anim(0) }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-1px' }}>
            Portfolio<span style={{ color: '#38bdf8' }}>Pulse</span>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#34d399', marginLeft: 4, animation: 'pulse-glow 2s ease infinite', boxShadow: '0 0 8px #34d399' }} />
          </div>
          <div className="mono" style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>ACCOUNT SETUP</div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 32, ...glass, padding: 4, borderRadius: 14, width: 'fit-content', ...anim(60) }}>
          {steps.map(s => (
            <button key={s.key} onClick={() => s.key === 'platforms' || savedPlatforms.length > 0 ? setStep(s.key) : null} style={{
              padding: '10px 24px', borderRadius: 11, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: 'none', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s', display: 'flex', alignItems: 'center', gap: 6,
              background: step === s.key ? 'rgba(56,189,248,.12)' : 'transparent',
              color: step === s.key ? '#38bdf8' : '#64748b',
              opacity: (s.key !== 'platforms' && savedPlatforms.length === 0) ? 0.4 : 1,
            }}>
              <span>{s.icon}</span> {s.label}
            </button>
          ))}
        </div>

        {/* ═══ PLATFORMS STEP ═══ */}
        {step === 'platforms' && (
          <div style={anim(120)}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Connect Your Platforms</h2>
              <p style={{ fontSize: 13, color: '#64748b' }}>Select the brokerages where you hold stocks.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
              {PLATFORM_PRESETS.map(preset => {
                const selected = selectedPresets.includes(preset.type);
                return (
                  <div key={preset.type} onClick={() => setSelectedPresets(selected ? selectedPresets.filter(t => t !== preset.type) : [...selectedPresets, preset.type])} style={{
                    ...glass, padding: '18px 20px', cursor: 'pointer', transition: 'all .2s',
                    borderColor: selected ? preset.color + '44' : 'rgba(255,255,255,.07)',
                    background: selected ? `${preset.color}08` : 'rgba(255,255,255,.03)',
                    position: 'relative',
                  }}>
                    {selected && <div style={{ position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: '50%', background: preset.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#060a13', fontWeight: 700 }}>✓</div>}
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{preset.icon}</div>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{preset.name}</div>
                    <div className="mono" style={{ fontSize: 10, color: preset.color }}>{preset.type}</div>
                  </div>
                );
              })}
            </div>

            {selectedPresets.length > 0 && (
              <div style={{ ...glass, padding: 24, marginBottom: 24 }}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 16 }}>Customize ({selectedPresets.length})</div>
                {selectedPresets.map(type => {
                  const preset = PLATFORM_PRESETS.find(p => p.type === type)!;
                  return (
                    <div key={type} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                      <span style={{ fontSize: 22 }}>{preset.icon}</span>
                      <div>
                        <label className="lbl">Display Name</label>
                        <input className="inp" value={customNames[type] || preset.name} onChange={e => setCustomNames({ ...customNames, [type]: e.target.value })} />
                      </div>
                      <div>
                        <label className="lbl">Account (last 4)</label>
                        <input className="inp" placeholder="4821" maxLength={4} value={accountHints[type] || ''} onChange={e => setAccountHints({ ...accountHints, [type]: e.target.value })} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-p" disabled={selectedPresets.length === 0 || saving} onClick={savePlatforms}>
                {saving ? 'Saving...' : `Save ${selectedPresets.length} Platform${selectedPresets.length > 1 ? 's' : ''} →`}
              </button>
            </div>
          </div>
        )}

        {/* ═══ MANUAL HOLDINGS STEP ═══ */}
        {step === 'manual' && (
          <ManualStep platforms={savedPlatforms} holdings={holdings} onSave={saveHolding} notify={notify} onNext={() => setStep('import')} anim={anim} />
        )}

        {/* ═══ CSV IMPORT STEP ═══ */}
        {step === 'import' && (
          <ImportStep platforms={savedPlatforms} onImport={handleImport} notify={notify} holdingsCount={holdings.length} anim={anim} onFinish={() => router.push('/')} />
        )}
      </div>
    </div>
  );
}

// ── Manual Entry Component ───────────────────────────────────────────────
function ManualStep({ platforms, holdings, onSave, notify, onNext, anim }: any) {
  const empty = { ticker: '', name: '', shares: '', avgCost: '', platformType: platforms[0]?.platform_type || '', sector: 'Other', support: '', resistance: '', notes: '' };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const upd = (f: string, v: string) => setForm({ ...form, [f]: v });

  const handleSubmit = async () => {
    if (!form.ticker || !form.shares || !form.avgCost || !form.platformType) {
      notify('Fill in ticker, shares, avg cost, and platform', 'error');
      return;
    }
    setSaving(true);
    const ok = await onSave(form);
    if (ok) setForm(empty);
    setSaving(false);
  };

  return (
    <div style={anim(120)}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Add Holdings</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>Enter positions with support/resistance levels for the signal engine.</p>
      </div>

      <div style={{ ...glass, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div><label className="lbl">Ticker *</label><input className="inp mono" style={{ fontSize: 16, fontWeight: 700 }} placeholder="SPY" value={form.ticker} onChange={e => upd('ticker', e.target.value.toUpperCase())} /></div>
          <div><label className="lbl">Name</label><input className="inp" placeholder="SPDR S&P 500" value={form.name} onChange={e => upd('name', e.target.value)} /></div>
          <div><label className="lbl">Shares *</label><input className="inp" type="number" placeholder="45" value={form.shares} onChange={e => upd('shares', e.target.value)} /></div>
          <div><label className="lbl">Avg Cost *</label><input className="inp" type="number" step="0.01" placeholder="478.30" value={form.avgCost} onChange={e => upd('avgCost', e.target.value)} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div><label className="lbl">Platform *</label>
            <select className="inp" value={form.platformType} onChange={e => upd('platformType', e.target.value)}>
              {platforms.map((p: any) => <option key={p.id} value={p.platform_type}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="lbl">Sector</label>
            <select className="inp" value={form.sector} onChange={e => upd('sector', e.target.value)}>
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="lbl">Support $</label><input className="inp" type="number" step="0.01" placeholder="495.00" value={form.support} onChange={e => upd('support', e.target.value)} /></div>
          <div><label className="lbl">Resistance $</label><input className="inp" type="number" step="0.01" placeholder="525.00" value={form.resistance} onChange={e => upd('resistance', e.target.value)} /></div>
        </div>
        <div style={{ marginBottom: 14 }}><label className="lbl">Notes</label><input className="inp" placeholder="Core holding, DCA monthly" value={form.notes} onChange={e => upd('notes', e.target.value)} /></div>
        <button className="btn-p" disabled={saving} onClick={handleSubmit}>{saving ? 'Saving...' : '➕ Add Holding'}</button>
      </div>

      {holdings.length > 0 && (
        <div style={{ ...glass, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.06)', fontWeight: 700, color: '#fff', fontSize: 14 }}>
            Added: {holdings.length} holding{holdings.length > 1 ? 's' : ''}
          </div>
          {holdings.map((h: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,.04)', animation: 'slideUp .3s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{h.ticker}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>{h.shares} shares @ ${parseFloat(h.avgCost).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#64748b' }}>
                {h.support && <span>S: <span style={{ color: '#34d399' }}>${h.support}</span></span>}
                {h.resistance && <span>R: <span style={{ color: '#f87171' }}>${h.resistance}</span></span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn-g" onClick={() => onNext()}>Skip to CSV Import →</button>
        <button className="btn-p" onClick={onNext}>Continue →</button>
      </div>
    </div>
  );
}

// ── CSV Import Component ─────────────────────────────────────────────────
function ImportStep({ platforms, onImport, notify, holdingsCount, anim, onFinish }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState(platforms[0]?.id || '');
  const [preview, setPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setResults(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      const rows = lines.slice(0, 6).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
      const lower = text.toLowerCase();
      let detected = 'unknown';
      if (lower.includes('fees & comm') || lower.includes('charles schwab')) detected = 'schwab';
      else if (lower.includes('run date') || lower.includes('fidelity')) detected = 'fidelity';
      else if (lower.includes('trans code') || lower.includes('robinhood')) detected = 'robinhood';
      else if (lower.includes('pershing') || lower.includes('netxinvestor') || lower.includes('cusip')) detected = 'alightfs';
      setPreview({ rows, totalLines: lines.length, detected });
      notify(`Loaded: ${lines.length} rows, detected: ${detected}`, 'info');
    };
    reader.readAsText(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    const f = e.dataTransfer?.files?.[0];
    if (f?.name.endsWith('.csv')) handleFile(f);
    else notify('Please upload a .csv file', 'error');
  }, []);

  const doImport = async () => {
    if (!file || !selectedPlatformId) return;
    setImporting(true);
    const data = await onImport(file, selectedPlatformId);
    setResults(data);
    if (data.success > 0) notify(`Imported ${data.success} trades`);
    else notify(data.error || 'Import failed', 'error');
    setImporting(false);
  };

  const formatInfo = FORMAT_HELP[platforms.find((p: any) => p.id === selectedPlatformId)?.platform_type || ''];

  return (
    <div style={anim(120)}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Import from CSV</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>Upload transaction exports. Format is auto-detected.</p>
      </div>

      {/* Platform select */}
      <div style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <label className="lbl" style={{ marginBottom: 10 }}>Which platform?</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {platforms.map((p: any) => (
            <button key={p.id} onClick={() => setSelectedPlatformId(p.id)} style={{
              padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${selectedPlatformId === p.id ? p.display_color + '44' : 'rgba(255,255,255,.08)'}`,
              background: selectedPlatformId === p.id ? `${p.display_color}12` : 'rgba(255,255,255,.03)',
              color: selectedPlatformId === p.id ? p.display_color : '#94a3b8',
              fontFamily: "'DM Sans', sans-serif",
            }}>{p.name}</button>
          ))}
        </div>
      </div>

      {formatInfo && (
        <div style={{ ...glass, padding: 18, marginBottom: 16, background: 'rgba(56,189,248,.03)', borderColor: 'rgba(56,189,248,.12)' }}>
          <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: 12, marginBottom: 6 }}>How to export:</div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>
            <div>Path: <span style={{ color: '#e2e8f0' }}>{formatInfo.path}</span></div>
            <div>File: <span className="mono" style={{ color: '#e2e8f0', fontSize: 11 }}>{formatInfo.filename}</span></div>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div className={`drop-zone ${dragActive ? 'active' : ''}`} onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={handleDrop}
        style={{ ...glass, marginBottom: 16, borderStyle: 'dashed', padding: file ? '24px' : '48px' }}>
        <input ref={fileRef} type="file" accept=".csv" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} style={{ display: 'none' }} />
        {!file ? (
          <><div style={{ fontSize: 40, marginBottom: 12 }}>📄</div><div style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>Drop CSV here or click to browse</div></>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 28 }}>📄</span>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>{file.name}</div>
                <div className="mono" style={{ fontSize: 11, color: '#64748b' }}>{(file.size / 1024).toFixed(1)} KB · {preview?.totalLines} rows · <span style={{ color: preview?.detected !== 'unknown' ? '#34d399' : '#fbbf24' }}>{preview?.detected}</span></div>
              </div>
            </div>
            <button className="btn-g" onClick={e => { e.stopPropagation(); setFile(null); setPreview(null); setResults(null); }} style={{ padding: '6px 14px' }}>Change</button>
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div style={{ ...glass, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.06)', fontWeight: 700, color: '#fff', fontSize: 13 }}>Preview</div>
          <div style={{ overflowX: 'auto', padding: '8px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <tbody>
                {preview.rows.map((row: string[], i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                    {row.slice(0, 8).map((cell: string, j: number) => (
                      <td key={j} style={{ padding: '8px 12px', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: i === 0 ? "'DM Sans'" : "'Space Mono', monospace", fontWeight: i === 0 ? 600 : 400, color: i === 0 ? '#38bdf8' : '#94a3b8', fontSize: i === 0 ? 10 : 11 }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results */}
      {results && results.success !== undefined && (
        <div style={{ ...glass, padding: 20, marginBottom: 16, background: results.success > 0 ? 'rgba(52,211,153,.04)' : 'rgba(248,113,113,.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[['IMPORTED', results.success, '#34d399'], ['FAILED', results.failed, '#f87171'], ['PARSED', results.totalParsed, '#38bdf8']].map(([l, v, c]) => (
              <div key={l as string} style={{ textAlign: 'center', padding: 12, background: 'rgba(255,255,255,.04)', borderRadius: 10 }}>
                <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: c as string }}>{v as number}</div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{l as string}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn-g" onClick={onFinish}>
          {holdingsCount > 0 ? 'Go to Dashboard →' : 'Skip — Go to Dashboard'}
        </button>
        <button className="btn-p" disabled={!file || !selectedPlatformId || importing} onClick={doImport}>
          {importing ? 'Importing...' : '🚀 Import Trades'}
        </button>
      </div>
    </div>
  );
}