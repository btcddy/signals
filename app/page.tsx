'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ────────────────────────────────────────────────────────────────
type Holding = {
  id: string; ticker: string; name: string; shares: number; avg_cost: number;
  current_price: number | null; day_change_pct: number | null; week_change_pct: number | null; month_change_pct: number | null;
  signal_type: string | null; signal_score: number | null; fib_zone: string | null;
  support_price: number | null; resistance_price: number | null; sector: string | null; notes: string | null;
  platform: { name: string; platform_type: string; display_color: string } | null;
};

type SectorData = {
  sector_name: string; sector_etf: string; momentum_score: number | null;
  current_phase: string | null; week_change: number | null; month_change: number | null;
};

type Trade = {
  id: string; ticker: string; action: string; shares: number; price: number;
  trade_date: string; platform: { name: string; display_color: string; platform_type: string } | null;
};

type Platform = { id: string; name: string; platform_type: string; display_color: string };

// ── Constants ────────────────────────────────────────────────────────────
const SIGNAL_COLORS: Record<string, string> = { HOLD: '#34d399', WATCH: '#fbbf24', SELL: '#f87171' };
const PHASE_COLORS: Record<string, string> = { expansion: '#34d399', peak: '#fbbf24', contraction: '#f87171', trough: '#38bdf8' };
const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,.03)', backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,.07)', borderRadius: 16, ...extra,
});

// ── Mini Sparkline SVG ───────────────────────────────────────────────────
function Sparkline({ data, color = '#38bdf8', w = 80, h = 28 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (!data || data.length < 2) return <div style={{ width: w, height: h }} />;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  const c = color === 'auto' ? (up ? '#34d399' : '#f87171') : color;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Signal Gauge ─────────────────────────────────────────────────────────
function SignalGauge({ score, type }: { score: number | null; type: string | null }) {
  const s = score ?? 50;
  const t = type || 'WATCH';
  const c = SIGNAL_COLORS[t] || '#94a3b8';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 48, height: 6, borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${s}%`, borderRadius: 3, background: c, transition: 'width .6s ease' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: c, fontFamily: "'Space Mono', monospace" }}>{t}</span>
    </div>
  );
}

// ── S/R Bar ──────────────────────────────────────────────────────────────
function SRBar({ support, resistance, current }: { support: number | null; resistance: number | null; current: number | null }) {
  if (!support || !resistance || !current) return <span style={{ fontSize: 10, color: '#475569' }}>—</span>;
  const range = resistance - support;
  const pos = range > 0 ? Math.max(0, Math.min(100, ((current - support) / range) * 100)) : 50;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
      <span style={{ fontSize: 9, color: '#34d399', fontFamily: "'Space Mono', monospace" }}>{support.toFixed(0)}</span>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'linear-gradient(90deg, rgba(52,211,153,.2), rgba(255,255,255,.06), rgba(248,113,113,.2))', position: 'relative' }}>
        <div style={{ position: 'absolute', left: `${pos}%`, top: -3, width: 10, height: 10, borderRadius: '50%', background: '#fff', border: '2px solid #38bdf8', transform: 'translateX(-50%)', boxShadow: '0 0 6px rgba(56,189,248,.4)' }} />
      </div>
      <span style={{ fontSize: 9, color: '#f87171', fontFamily: "'Space Mono', monospace" }}>{resistance.toFixed(0)}</span>
    </div>
  );
}

// ── Percentage badge ─────────────────────────────────────────────────────
function Pct({ val }: { val: number | null }) {
  if (val == null) return <span style={{ color: '#475569', fontSize: 11 }}>—</span>;
  const c = val >= 0 ? '#34d399' : '#f87171';
  return <span style={{ color: c, fontSize: 11, fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>{val >= 0 ? '+' : ''}{val.toFixed(2)}%</span>;
}

// ── Dollar format ────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—';

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [ready, setReady] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/summary');
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setHoldings(data.holdings || []);
      setTrades(data.trades || []);
      setSectors(data.sectors || []);
      setPlatforms(data.platforms || []);
      setSparklines(data.sparklines || {});
      if (!data.platforms?.length) router.push('/setup');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => setReady(true));
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLogout = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    await createClient().auth.signOut();
    router.push('/login');
  };

  // ── Computed Metrics ─────────────────────────────────────────────────
  const totalValue = holdings.reduce((s, h) => s + (h.current_price || h.avg_cost) * h.shares, 0);
  const totalCost = holdings.reduce((s, h) => s + h.avg_cost * h.shares, 0);
  const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
  const signalCounts = { HOLD: 0, WATCH: 0, SELL: 0 };
  holdings.forEach(h => { if (h.signal_type && signalCounts[h.signal_type as keyof typeof signalCounts] !== undefined) signalCounts[h.signal_type as keyof typeof signalCounts]++; });
  const healthScore = holdings.length > 0 ? Math.round((signalCounts.HOLD / holdings.length) * 100) : 0;

  // Platform allocation
  const platformTotals: Record<string, { name: string; color: string; value: number }> = {};
  holdings.forEach(h => {
    const key = h.platform?.platform_type || 'other';
    if (!platformTotals[key]) platformTotals[key] = { name: h.platform?.name || 'Other', color: h.platform?.display_color || '#94a3b8', value: 0 };
    platformTotals[key].value += (h.current_price || h.avg_cost) * h.shares;
  });

  // Sector allocation
  const sectorTotals: Record<string, number> = {};
  holdings.forEach(h => {
    const sec = h.sector || 'Other';
    sectorTotals[sec] = (sectorTotals[sec] || 0) + (h.current_price || h.avg_cost) * h.shares;
  });

  const anim = (delay: number) => ({
    opacity: ready ? 1 : 0, transform: ready ? 'translateY(0)' : 'translateY(12px)',
    transition: `all .5s cubic-bezier(.16,1,.3,1) ${delay}ms`,
  });

  if (loading) return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: '#060a13', color: '#e2e8f0', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
          Portfolio<span style={{ color: '#38bdf8' }}>Pulse</span>
        </div>
        <div style={{ fontSize: 13, color: '#64748b' }}>Loading portfolio...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: '#060a13', color: '#f87171', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Error Loading Dashboard</div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>{error}</div>
        <button onClick={fetchData} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#38bdf8,#34d399)', color: '#060a13', fontWeight: 600, cursor: 'pointer' }}>Retry</button>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: '#060a13', color: '#e2e8f0', minHeight: '100vh', position: 'relative' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:3px}
        .mono{font-family:'Space Mono',monospace}
        @keyframes pulse-glow{0%,100%{opacity:.4}50%{opacity:1}}
        .row-hover{transition:background .15s}
        .row-hover:hover{background:rgba(255,255,255,.03)!important}
        .card-hover{transition:all .2s}
        .card-hover:hover{border-color:rgba(56,189,248,.15)!important;transform:translateY(-1px)}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);z-index:200;display:flex;align-items:center;justify-content:center;animation:fadeIn .2s ease}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style>

      {/* ── Background ─────────────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '50%', height: '50%', background: 'radial-gradient(ellipse,rgba(56,189,248,.05) 0%,transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '50%', height: '50%', background: 'radial-gradient(ellipse,rgba(52,211,153,.04) 0%,transparent 70%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 64px', position: 'relative', zIndex: 1 }}>

        {/* ── Header ───────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, ...anim(0) }}>
          <div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-1px' }}>
              Portfolio<span style={{ color: '#38bdf8' }}>Pulse</span>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#34d399', marginLeft: 4, animation: 'pulse-glow 2s ease infinite', boxShadow: '0 0 8px #34d399' }} />
            </div>
            <div className="mono" style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>LIVE SIGNALS · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => router.push('/setup')} style={{ padding: '8px 18px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.03)', color: '#94a3b8', fontFamily: "'DM Sans'" }}>⚙ Setup</button>
            <button onClick={fetchData} style={{ padding: '8px 18px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.03)', color: '#94a3b8', fontFamily: "'DM Sans'" }}>↻ Refresh</button>
            <button onClick={handleLogout} style={{ padding: '8px 18px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(248,113,113,.15)', background: 'rgba(248,113,113,.04)', color: '#f87171', fontFamily: "'DM Sans'" }}>Sign Out</button>
          </div>
        </div>

        {/* ── Summary Cards ─────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24, ...anim(60) }}>
          {[
            { label: 'PORTFOLIO VALUE', value: fmt(totalValue), sub: `${holdings.length} holdings`, color: '#fff' },
            { label: 'TOTAL RETURN', value: `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`, sub: fmt(totalValue - totalCost), color: totalReturn >= 0 ? '#34d399' : '#f87171' },
            { label: 'SIGNAL HEALTH', value: `${healthScore}%`, sub: `${signalCounts.HOLD}H · ${signalCounts.WATCH}W · ${signalCounts.SELL}S`, color: healthScore >= 65 ? '#34d399' : healthScore >= 35 ? '#fbbf24' : '#f87171' },
            { label: 'PLATFORMS', value: platforms.length.toString(), sub: platforms.map(p => p.name).join(', ') || 'None', color: '#38bdf8' },
          ].map((card, i) => (
            <div key={i} className="card-hover" style={glass({ padding: '20px 22px' })}>
              <div className="mono" style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 8, letterSpacing: '.8px' }}>{card.label}</div>
              <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: card.color, letterSpacing: '-1px' }}>{card.value}</div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Holdings Table ────────────────────────────────── */}
        <div style={{ ...glass(), overflow: 'hidden', marginBottom: 24, ...anim(120) }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>Holdings</div>
            <div className="mono" style={{ fontSize: 10, color: '#475569' }}>{holdings.length} POSITION{holdings.length !== 1 ? 'S' : ''}</div>
          </div>

          {holdings.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
              <div style={{ fontWeight: 700, color: '#fff', marginBottom: 6 }}>No holdings yet</div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Add positions in Setup to start tracking signals.</div>
              <button onClick={() => router.push('/setup')} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#38bdf8,#34d399)', color: '#060a13', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans'" }}>Go to Setup</button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                    {['Ticker', 'Price', 'Day', 'Week', 'Month', 'Sparkline', 'Signal', 'S / R', 'Value', 'P&L'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 14px', textAlign: i > 0 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '.8px', fontFamily: "'Space Mono', monospace", whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => {
                    const price = h.current_price || h.avg_cost;
                    const value = price * h.shares;
                    const cost = h.avg_cost * h.shares;
                    const pnl = value - cost;
                    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
                    return (
                      <tr key={h.id} className="row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,.04)', cursor: 'pointer' }} onClick={() => setSelectedHolding(h)}>
                        <td style={{ padding: '14px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {h.platform && <div style={{ width: 4, height: 28, borderRadius: 2, background: h.platform.display_color }} />}
                            <div>
                              <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{h.ticker}</div>
                              <div style={{ fontSize: 10, color: '#475569', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name || h.sector || ''}</div>
                            </div>
                          </div>
                        </td>
                        <td className="mono" style={{ padding: '14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#fff' }}>{fmt(price)}</td>
                        <td style={{ padding: '14px', textAlign: 'right' }}><Pct val={h.day_change_pct} /></td>
                        <td style={{ padding: '14px', textAlign: 'right' }}><Pct val={h.week_change_pct} /></td>
                        <td style={{ padding: '14px', textAlign: 'right' }}><Pct val={h.month_change_pct} /></td>
                        <td style={{ padding: '14px', textAlign: 'right' }}><Sparkline data={sparklines[h.ticker] || []} color="auto" /></td>
                        <td style={{ padding: '14px', textAlign: 'right' }}><SignalGauge score={h.signal_score} type={h.signal_type} /></td>
                        <td style={{ padding: '14px', textAlign: 'right' }}><SRBar support={h.support_price} resistance={h.resistance_price} current={price} /></td>
                        <td className="mono" style={{ padding: '14px', textAlign: 'right', fontSize: 12, color: '#94a3b8' }}>{fmt(value)}</td>
                        <td className="mono" style={{ padding: '14px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: pnl >= 0 ? '#34d399' : '#f87171' }}>
                          {pnl >= 0 ? '+' : ''}{fmt(pnl)}<br />
                          <span style={{ fontSize: 10, opacity: 0.7 }}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Bottom Grid: Sectors + Allocations + Recent Trades ─ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, ...anim(180) }}>

          {/* Sector Rotation */}
          {sectors.length > 0 && (
            <div style={glass({ overflow: 'hidden' })}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.06)', fontWeight: 700, color: '#fff', fontSize: 14 }}>Sector Rotation</div>
              {sectors.map((s, i) => (
                <div key={i} className="row-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 36 }}>{s.sector_etf}</div>
                    <div style={{ fontSize: 12, color: '#e2e8f0' }}>{s.sector_name}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {s.current_phase && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: (PHASE_COLORS[s.current_phase] || '#94a3b8') + '18', color: PHASE_COLORS[s.current_phase] || '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px' }}>{s.current_phase}</span>
                    )}
                    <Pct val={s.week_change} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Allocations & Recent Trades */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Platform Allocation */}
            {Object.keys(platformTotals).length > 0 && (
              <div style={glass({ padding: 20 })}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 14 }}>Platform Allocation</div>
                <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                  {Object.entries(platformTotals).map(([key, p]) => (
                    <div key={key} style={{ flex: p.value / totalValue, background: p.color, transition: 'flex .4s ease' }} title={`${p.name}: ${fmt(p.value)}`} />
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {Object.entries(platformTotals).map(([key, p]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.name}</span>
                      <span className="mono" style={{ fontSize: 11, color: '#64748b' }}>{totalValue > 0 ? ((p.value / totalValue) * 100).toFixed(0) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sector Allocation */}
            {Object.keys(sectorTotals).length > 0 && (
              <div style={glass({ padding: 20 })}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 14 }}>Sector Allocation</div>
                {Object.entries(sectorTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([sec, val]) => (
                  <div key={sec} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{sec}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: '#38bdf8', width: `${totalValue > 0 ? (val / totalValue) * 100 : 0}%` }} />
                      </div>
                      <span className="mono" style={{ fontSize: 10, color: '#64748b', width: 32, textAlign: 'right' }}>{totalValue > 0 ? ((val / totalValue) * 100).toFixed(0) : 0}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent Trades */}
            {trades.length > 0 && (
              <div style={glass({ overflow: 'hidden' })}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.06)', fontWeight: 700, color: '#fff', fontSize: 14 }}>Recent Trades</div>
                {trades.slice(0, 8).map((t) => (
                  <div key={t.id} className="row-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: t.action === 'buy' ? 'rgba(52,211,153,.12)' : 'rgba(248,113,113,.12)', color: t.action === 'buy' ? '#34d399' : '#f87171', textTransform: 'uppercase' }}>{t.action}</span>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{t.ticker}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{t.shares} @ {fmt(t.price)}</span>
                    </div>
                    <span className="mono" style={{ fontSize: 10, color: '#475569' }}>{new Date(t.trade_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Detail Modal ─────────────────────────────────── */}
      {selectedHolding && (
        <div className="modal-overlay" onClick={() => setSelectedHolding(null)}>
          <div onClick={e => e.stopPropagation()} style={{ ...glass({ padding: 28, maxWidth: 520, width: '90%' }), background: 'rgba(15,20,30,.95)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{selectedHolding.ticker}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{selectedHolding.name}</div>
              </div>
              <button onClick={() => setSelectedHolding(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { l: 'Price', v: fmt(selectedHolding.current_price || selectedHolding.avg_cost) },
                { l: 'Shares', v: selectedHolding.shares.toString() },
                { l: 'Avg Cost', v: fmt(selectedHolding.avg_cost) },
                { l: 'Day', v: selectedHolding.day_change_pct != null ? `${selectedHolding.day_change_pct >= 0 ? '+' : ''}${selectedHolding.day_change_pct.toFixed(2)}%` : '—' },
                { l: 'Week', v: selectedHolding.week_change_pct != null ? `${selectedHolding.week_change_pct >= 0 ? '+' : ''}${selectedHolding.week_change_pct.toFixed(2)}%` : '—' },
                { l: 'Month', v: selectedHolding.month_change_pct != null ? `${selectedHolding.month_change_pct >= 0 ? '+' : ''}${selectedHolding.month_change_pct.toFixed(2)}%` : '—' },
              ].map((item, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{item.l}</div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{item.v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, background: 'rgba(255,255,255,.03)', borderRadius: 10, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Signal</div>
                <SignalGauge score={selectedHolding.signal_score} type={selectedHolding.signal_type} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Fib Zone</div>
                <div className="mono" style={{ fontSize: 12, color: '#38bdf8' }}>{selectedHolding.fib_zone || '—'}</div>
              </div>
              <div style={{ minWidth: 120 }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Support / Resistance</div>
                <SRBar support={selectedHolding.support_price} resistance={selectedHolding.resistance_price} current={selectedHolding.current_price || selectedHolding.avg_cost} />
              </div>
            </div>

            {selectedHolding.notes && (
              <div style={{ padding: 12, background: 'rgba(56,189,248,.04)', borderRadius: 10, border: '1px solid rgba(56,189,248,.1)', fontSize: 12, color: '#94a3b8' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#38bdf8', display: 'block', marginBottom: 4 }}>NOTES</span>
                {selectedHolding.notes}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <div style={{ fontSize: 10, color: '#475569' }}>
                {selectedHolding.platform && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: selectedHolding.platform.display_color }} />
                    {selectedHolding.platform.name}
                  </span>
                )}
                {selectedHolding.sector && <span> · {selectedHolding.sector}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}