import { useEffect, useMemo, useState } from 'react';
import {
  DataQuality,
  opportunityApi,
  PerformanceDashboard,
  PropFeedRow,
} from '../lib/opportunityApi';

type Tab = 'DECISIONS' | 'DISTRIBUTIONS' | 'ROTATIONS' | 'ENVIRONMENT' | 'CLV' | 'SOURCES';
type Mode = 'FAST' | 'STANDARD' | 'DEEP';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'DECISIONS', label: 'Decision Board' },
  { id: 'DISTRIBUTIONS', label: 'Distributions' },
  { id: 'ROTATIONS', label: 'Lineup & Rotation' },
  { id: 'ENVIRONMENT', label: 'Referee & Environment' },
  { id: 'CLV', label: 'CLV & Attribution' },
  { id: 'SOURCES', label: 'Data Quality' },
];

export default function OpportunityFirstPage() {
  const [tab, setTab] = useState<Tab>('DECISIONS');
  const [mode, setMode] = useState<Mode>('STANDARD');
  const [rows, setRows] = useState<PropFeedRow[]>([]);
  const [performance, setPerformance] = useState<PerformanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    opportunityApi.propFeed(mode, mode === 'FAST' ? 100 : 50)
      .then((data) => !cancelled && setRows(data))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    opportunityApi.performance(90)
      .then(setPerformance)
      .catch(() => setPerformance(null));
  }, []);

  const actionable = useMemo(
    () => rows.filter((row) => row.bestDecision?.decision === 'BET' || row.bestDecision?.decision === 'STRONG_BET'),
    [rows],
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">Opportunity-First NBA Intelligence</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Projection, price, uncertainty, then decision</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Player-prop probabilities are generated from minutes × opportunity × conversion × context. Historical hit rates are context only.
          </p>
        </div>
        <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1">
          {(['FAST', 'STANDARD', 'DEEP'] as Mode[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${mode === value ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {value}
            </button>
          ))}
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 p-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${tab === item.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-4 text-sm text-rose-200">
          Live Opportunity-First data could not be loaded: {error}
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <>
          {tab === 'DECISIONS' && <DecisionBoard rows={rows} actionable={actionable} />}
          {tab === 'DISTRIBUTIONS' && <DistributionExplorer rows={rows} />}
          {tab === 'ROTATIONS' && <RotationExplorer rows={rows} />}
          {tab === 'ENVIRONMENT' && <EnvironmentPanel rows={rows} />}
          {tab === 'CLV' && <ClvPanel performance={performance} />}
          {tab === 'SOURCES' && <SourceQualityPanel rows={rows} />}
        </>
      )}
    </div>
  );
}

function DecisionBoard({ rows, actionable }: { rows: PropFeedRow[]; actionable: PropFeedRow[] }) {
  const decisions = rows.filter((row) => row.bestDecision);
  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Markets screened" value={rows.length} />
        <Metric label="Actionable" value={actionable.length} />
        <Metric label="High data quality" value={rows.filter((row) => row.dataQuality.level === 'HIGH').length} />
        <Metric label="Waiting on news" value={decisions.filter((row) => row.bestDecision?.newsDecision === 'WAIT').length} />
      </div>
      <Card title="NBA Slate Edge Board" subtitle="Ranked by actionable decision, data quality, then modeled EV.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Player</th><th className="px-3 py-3">Prop</th><th className="px-3 py-3">Market</th>
                <th className="px-3 py-3">Model</th><th className="px-3 py-3">Edge</th><th className="px-3 py-3">Price</th>
                <th className="px-3 py-3">Quality</th><th className="px-3 py-3">Confidence</th><th className="px-3 py-3">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {rows.map((row) => {
                const decision = row.bestDecision;
                return (
                  <tr key={row.marketId} className="text-slate-300">
                    <td className="px-3 py-3 font-medium text-white">{row.player.name}<div className="text-xs text-slate-500">{row.player.team}</div></td>
                    <td className="px-3 py-3">{row.statType}</td>
                    <td className="px-3 py-3">{fmt(row.line)}</td>
                    <td className="px-3 py-3">{fmt(row.projection.median)}</td>
                    <td className="px-3 py-3">{decision ? pct(decision.edgeProbability) : '—'}</td>
                    <td className="px-3 py-3">{decision?.side ?? '—'} {decision?.odds ? american(decision.odds) : ''}</td>
                    <td className="px-3 py-3"><QualityPill value={row.dataQuality.level} /></td>
                    <td className="px-3 py-3">{decision?.confidence ?? '—'}</td>
                    <td className="px-3 py-3"><DecisionPill value={decision?.decision ?? 'PASS'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function DistributionExplorer({ rows }: { rows: PropFeedRow[] }) {
  const [selectedId, setSelectedId] = useState(rows[0]?.marketId ?? '');
  const row = rows.find((item) => item.marketId === selectedId) ?? rows[0];
  if (!row) return <EmptyState text="No active prop projections are available." />;
  const p = row.projection.percentiles;
  const range = Math.max(0.001, p.p95 - p.p05);
  const points = [
    ['P05', p.p05], ['P10', p.p10], ['P25', p.p25], ['Median', p.p50], ['P75', p.p75], ['P90', p.p90], ['P95', p.p95],
  ] as const;
  return (
    <section className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Card title="Projection candidates" subtitle="Select a prop to inspect its modeled distribution.">
        <div className="max-h-[650px] space-y-2 overflow-y-auto">
          {rows.map((item) => (
            <button
              type="button"
              key={item.marketId}
              onClick={() => setSelectedId(item.marketId)}
              className={`w-full rounded-xl border p-3 text-left ${item.marketId === row.marketId ? 'border-sky-700 bg-sky-950/30' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}
            >
              <div className="flex items-center justify-between gap-2"><span className="font-medium text-white">{item.player.name}</span><QualityPill value={item.dataQuality.level} /></div>
              <div className="mt-1 text-xs text-slate-400">{item.statType} · line {fmt(item.line)}</div>
            </button>
          ))}
        </div>
      </Card>
      <div className="space-y-4">
        <Card title={`${row.player.name} — ${row.statType}`} subtitle={`${row.event.away} @ ${row.event.home} · ${row.projection.trials.toLocaleString()} seeded trials`}>
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Mean" value={fmt(row.projection.mean)} />
            <Metric label="Median" value={fmt(row.projection.median)} />
            <Metric label="Std. dev." value={fmt(row.projection.stdDev)} />
            <Metric label="Market" value={fmt(row.line)} />
          </div>
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="relative h-12 rounded-full bg-slate-900">
              <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                <div className="h-px w-full bg-slate-700" />
              </div>
              {points.map(([label, value]) => {
                const left = Math.max(0, Math.min(100, ((value - p.p05) / range) * 100));
                return (
                  <div key={label} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%` }}>
                    <div className="h-3 w-3 rounded-full border-2 border-slate-300 bg-slate-950" />
                    <div className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-[10px] text-slate-500">{label} {fmt(value)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
        <Card title="Uncertainty decomposition" subtitle="Higher values indicate larger model uncertainty contributions.">
          <div className="grid gap-3 sm:grid-cols-5">
            {Object.entries(row.projection.uncertainty).filter(([key]) => key !== 'total').map(([key, value]) => (
              <Metric key={key} label={key} value={fmt(value)} />
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function RotationExplorer({ rows }: { rows: PropFeedRow[] }) {
  return (
    <Card title="Lineup & Rotation Explorer" subtitle="Projection quality is intentionally downgraded whenever current rotation or availability inputs are missing.">
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.slice(0, 30).map((row) => (
          <div key={row.marketId} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><div className="font-medium text-white">{row.player.name}</div><div className="text-xs text-slate-500">{row.player.team} · {row.statType}</div></div>
              <QualityPill value={row.dataQuality.level} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Projected median" value={fmt(row.projection.median)} />
              <Stat label="Availability" value={row.availability ? pct(row.availability.probability) : 'Unresolved'} />
              <Stat label="Status" value={row.availability?.status ?? 'Unknown'} />
              <Stat label="Source" value={row.availability?.source ?? 'No current Tier-1/2 source'} />
            </dl>
            {row.dataQuality.reasons.length > 0 && (
              <div className="mt-3 border-t border-slate-900 pt-3 text-xs text-amber-300">{row.dataQuality.reasons.join(' · ')}</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function EnvironmentPanel({ rows }: { rows: PropFeedRow[] }) {
  const games = Array.from(new Map(rows.map((row) => [row.event.id, row.event])).values());
  return (
    <section className="space-y-4">
      <Card title="Referee & Environment Impact" subtitle="Only confirmed, adequately sampled referee effects should influence a handicap. Missing environmental sources remain unresolved instead of inferred.">
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Games represented" value={games.length} />
          <Metric label="High-quality prop inputs" value={rows.filter((row) => row.dataQuality.level === 'HIGH').length} />
          <Metric label="Explicit uncertainty" value={rows.filter((row) => row.dataQuality.level !== 'HIGH').length} />
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {games.map((game) => (
            <div key={game.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="font-medium text-white">{game.away} @ {game.home}</div>
              <div className="mt-1 text-xs text-slate-500">{new Date(game.startTime).toLocaleString()}</div>
              <div className="mt-4 rounded-lg bg-slate-900 p-3 text-xs text-slate-400">
                Referee assignments, travel, altitude and rest metrics are displayed only when their typed ingestion records are available. No synthetic environment values are generated by this view.
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function ClvPanel({ performance }: { performance: PerformanceDashboard | null }) {
  if (!performance) return <EmptyState text="CLV analytics are unavailable until the performance endpoint returns settled tracked wagers." />;
  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="CLV rate" value={pct(performance.summary.clvRate)} />
        <Metric label="Average price CLV" value={pct(performance.summary.avgClv)} />
        <Metric label="Average line CLV" value={fmt(performance.summary.avgLineClv)} />
        <Metric label="CLV sample" value={performance.summary.clvSample} />
      </div>
      <Card title="Performance by confidence" subtitle="Calculated from actual tracked stake and sportsbook price; no universal -110 assumption.">
        <SliceTable rows={performance.byConfidence} />
      </Card>
      <Card title="Performance by prop type" subtitle="Single-item settled wagers only where leg-level attribution is unambiguous.">
        <SliceTable rows={performance.byPropType} />
      </Card>
    </section>
  );
}

function SourceQualityPanel({ rows }: { rows: PropFeedRow[] }) {
  const qualityCounts = (['HIGH', 'MEDIUM', 'LOW'] as DataQuality[]).map((quality) => ({
    quality,
    count: rows.filter((row) => row.dataQuality.level === quality).length,
  }));
  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {qualityCounts.map((item) => <Metric key={item.quality} label={`${item.quality} quality`} value={item.count} />)}
      </div>
      <Card title="Source hierarchy & unresolved inputs" subtitle="Official NBA > high-quality data > reporting. Simulated values are never eligible market evidence.">
        <div className="space-y-2">
          {rows.slice(0, 50).map((row) => (
            <div key={row.marketId} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 md:grid-cols-[1.5fr_.7fr_1.5fr_2fr] md:items-center">
              <div><div className="text-sm font-medium text-white">{row.player.name} — {row.statType}</div><div className="text-xs text-slate-500">{row.event.away} @ {row.event.home}</div></div>
              <QualityPill value={row.dataQuality.level} />
              <div className="text-xs text-slate-400">{row.availability?.sourceTier ?? 'No current availability tier'}</div>
              <div className="text-xs text-slate-500">{row.dataQuality.reasons.length ? row.dataQuality.reasons.join(' · ') : 'No material quality warnings'}</div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function SliceTable({ rows }: { rows: PerformanceDashboard['byConfidence'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-slate-800 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Bucket</th><th className="px-3 py-3">Bets</th><th className="px-3 py-3">W-L-P</th><th className="px-3 py-3">ROI</th><th className="px-3 py-3">CLV rate</th><th className="px-3 py-3">Avg CLV</th></tr></thead>
        <tbody className="divide-y divide-slate-900">
          {rows.map((row) => <tr key={row.value} className="text-slate-300"><td className="px-3 py-3 font-medium text-white">{row.value}</td><td className="px-3 py-3">{row.bets}</td><td className="px-3 py-3">{row.won}-{row.lost}-{row.pushed}</td><td className="px-3 py-3">{pct(row.roi)}</td><td className="px-3 py-3">{pct(row.clvRate)}</td><td className="px-3 py-3">{pct(row.averageClv)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 md:p-5"><div className="mb-4"><h2 className="font-semibold text-white">{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div>{children}</div>;
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-xl font-semibold text-white">{value}</div></div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-slate-200">{value}</dd></div>;
}
function QualityPill({ value }: { value: DataQuality }) {
  const cls = value === 'HIGH' ? 'border-emerald-800 text-emerald-300' : value === 'MEDIUM' ? 'border-amber-800 text-amber-300' : 'border-rose-900 text-rose-300';
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${cls}`}>{value}</span>;
}
function DecisionPill({ value }: { value: string }) {
  const cls = value === 'STRONG_BET' ? 'border-emerald-700 bg-emerald-950/30 text-emerald-300' : value === 'BET' ? 'border-sky-700 bg-sky-950/30 text-sky-300' : value === 'WAIT' ? 'border-amber-800 text-amber-300' : 'border-slate-700 text-slate-400';
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${cls}`}>{value.replace('_', ' ')}</span>;
}
function LoadingState() { return <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-12 text-center text-sm text-slate-400">Loading Opportunity-First projections…</div>; }
function EmptyState({ text }: { text: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-8 text-center text-sm text-slate-400">{text}</div>; }
function fmt(value: number) { return Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, '') : '—'; }
function pct(value: number) { return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—'; }
function american(value: number) { return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`; }
