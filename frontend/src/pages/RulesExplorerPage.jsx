import { useMemo, useState } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Search, Download, ArrowUpDown, GitFork } from 'lucide-react'
import { useData } from '../context/DataContext'
import { api } from '../api/client'
import ParamsBar from '../components/ParamsBar'
import { LockedState, LoadingState, EmptyState } from '../components/States'

const SORT_FIELDS = ['support', 'confidence', 'lift', 'leverage']

export default function RulesExplorerPage() {
  const { preprocessSummary, algorithm, results, runMine, loading } = useData()
  const [query, setQuery] = useState('')
  const [sortField, setSortField] = useState('lift')
  const [sortDir, setSortDir] = useState('desc')
  const [selected, setSelected] = useState(null)

  const mined = results[algorithm]

  const filtered = useMemo(() => {
    if (!mined) return []
    let rows = mined.rules
    if (query.trim()) {
      const q = query.toLowerCase()
      rows = rows.filter((r) =>
        r.antecedents.join(' ').toLowerCase().includes(q) ||
        r.consequents.join(' ').toLowerCase().includes(q))
    }
    rows = [...rows].sort((a, b) => (sortDir === 'desc' ? b[sortField] - a[sortField] : a[sortField] - b[sortField]))
    return rows
  }, [mined, query, sortField, sortDir])

  const scatterData = useMemo(() => (mined?.rules || []).map((r) => ({
    x: r.confidence * 100,
    y: r.support * 100,
    z: r.lift,
    label: `${r.antecedents.join('+')} → ${r.consequents.join('+')}`,
  })), [mined])

  if (!preprocessSummary) return <LockedState />

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <ParamsBar onRun={(algo, p) => runMine(algo, p)} />

      {loading[`mine-${algorithm}`] && <LoadingState label="Generating rules…" />}

      {!loading[`mine-${algorithm}`] && !mined && (
        <EmptyState icon={GitFork} title="No rules yet" description="Run an algorithm above to generate association rules." />
      )}

      {!loading[`mine-${algorithm}`] && mined && mined.num_rules === 0 && (
        <EmptyState
          icon={GitFork}
          title="No rules at these thresholds"
          description={mined.warning || 'Try lowering minimum confidence or minimum lift.'}
        />
      )}

      {!loading[`mine-${algorithm}`] && mined && mined.num_rules > 0 && (
        <>
          <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
            <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-1">Support vs. Confidence, sized by Lift</p>
            <p className="text-xs text-ink-400 mb-4">Each point is one rule. Bigger, brighter bubbles = stronger association.</p>
            <ResponsiveContainer width="100%" height={340}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-ink-200)" className="dark:opacity-10 opacity-40" />
                <XAxis type="number" dataKey="x" name="Confidence" unit="%" tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} label={{ value: 'Confidence->', position: 'insideBottom', offset: -4, style: { fontWeight: 800, fontSize: 11 } }} />
                <YAxis type="number" dataKey="y" name="Support" unit="%" tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} label={{ value: 'Support->', angle: -90, position: 'insideLeft', offset: 4, style: { fontWeight: 800, fontSize: 11 } }} />
                <ZAxis type="number" dataKey="z" range={[40, 400]} name="Lift" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ background: 'var(--color-ink-850)', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' }}
                  formatter={(value, name) => [name === 'Lift' ? value.toFixed(2) : `${value.toFixed(1)}%`, name]}
                  labelFormatter={() => ''}
                  content={<ScatterTooltip />}
                />
                <Scatter data={scatterData} fill="#2FBF71" fillOpacity={0.65} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-ink-200/60 dark:border-ink-700/60">
              <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-ink-50 dark:bg-ink-800/60 rounded-lg px-3 py-1.5">
                <Search size={14} className="text-ink-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search product…"
                  className="bg-transparent text-xs outline-none flex-1 text-ink-900 dark:text-mist-50 placeholder:text-ink-400"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {SORT_FIELDS.map((f) => (
                  <button
                    key={f}
                    onClick={() => { setSortField(f); setSortDir(sortField === f && sortDir === 'desc' ? 'asc' : 'desc') }}
                    className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 capitalize ${
                      sortField === f ? 'bg-ink-900 dark:bg-leaf-500 text-mist-50 dark:text-ink-950' : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-200'
                    }`}
                  >
                    {f} <ArrowUpDown size={11} />
                  </button>
                ))}
              </div>
              <a
                href={api.exportUrl('rules', algorithm)}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                <Download size={12} /> Export CSV
              </a>
            </div>

            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-mist-50 dark:bg-ink-850 z-10">
                  <tr className="text-ink-400 text-left">
                    <th className="px-5 py-2.5 font-semibold">Rule</th>
                    <th className="px-5 py-2.5 font-semibold">Support</th>
                    <th className="px-5 py-2.5 font-semibold">Confidence</th>
                    <th className="px-5 py-2.5 font-semibold">Lift</th>
                    <th className="px-5 py-2.5 font-semibold">Leverage</th>
                    <th className="px-5 py-2.5 font-semibold">Conviction</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="border-t border-ink-100 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-800/40 cursor-pointer"
                    >
                      <td className="px-5 py-2.5">
                        <span className="text-ink-900 dark:text-mist-50 font-medium">{r.antecedents.join(', ')}</span>
                        <span className="text-ink-400 mx-1.5">→</span>
                        <span className="text-leaf-600 dark:text-leaf-400 font-medium">{r.consequents.join(', ')}</span>
                      </td>
                      <td className="px-5 py-2.5 font-mono-num text-ink-600 dark:text-ink-200">{(r.support * 100).toFixed(2)}%</td>
                      <td className="px-5 py-2.5 font-mono-num text-ink-600 dark:text-ink-200">{(r.confidence * 100).toFixed(1)}%</td>
                      <td className="px-5 py-2.5 font-mono-num font-semibold text-leaf-600 dark:text-leaf-400">{r.lift.toFixed(2)}</td>
                      <td className="px-5 py-2.5 font-mono-num text-ink-600 dark:text-ink-200">{r.leverage.toFixed(4)}</td>
                      <td className="px-5 py-2.5 font-mono-num text-ink-600 dark:text-ink-200">{r.conviction === null ? '∞' : r.conviction.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selected && <RuleDetailDrawer rule={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-ink-850 text-white rounded-lg px-3 py-2 text-[11px] shadow-lg max-w-[220px]">
      <p className="font-semibold mb-1">{d.label}</p>
      <p>Support: {d.y.toFixed(2)}% · Confidence: {d.x.toFixed(1)}%</p>
      <p>Lift: {d.z.toFixed(2)}</p>
    </div>
  )
}

function RuleDetailDrawer({ rule, onClose }) {
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink-950/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm h-full bg-white dark:bg-ink-900 p-6 overflow-y-auto animate-fade-up">
        <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Rule detail</p>
        <p className="text-base font-bold text-ink-900 dark:text-mist-50 mb-6 leading-snug">
          {rule.antecedents.join(' + ')} <span className="text-leaf-500">→</span> {rule.consequents.join(' + ')}
        </p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Metric label="Support" value={`${(rule.support * 100).toFixed(2)}%`} />
          <Metric label="Confidence" value={`${(rule.confidence * 100).toFixed(1)}%`} />
          <Metric label="Lift" value={rule.lift.toFixed(3)} />
          <Metric label="Leverage" value={rule.leverage.toFixed(4)} />
          <Metric label="Conviction" value={rule.conviction === null ? '∞' : rule.conviction.toFixed(3)} />
          {rule.zhangs_metric !== null && <Metric label="Zhang's metric" value={rule.zhangs_metric.toFixed(3)} />}
        </div>
        <p className="text-xs text-ink-400 leading-relaxed">
          Customers who buy <b className="text-ink-900 dark:text-mist-50">{rule.antecedents.join(', ')}</b> also buy{' '}
          <b className="text-ink-900 dark:text-mist-50">{rule.consequents.join(', ')}</b> {(rule.confidence * 100).toFixed(1)}% of the
          time — {rule.lift.toFixed(2)}× more often than random chance would predict.
        </p>
        <button onClick={onClose} className="mt-8 w-full text-xs font-semibold py-2.5 rounded-lg bg-ink-900 dark:bg-leaf-500 text-mist-50 dark:text-ink-950">
          Close
        </button>
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-ink-50 dark:bg-ink-800/60 p-3">
      <p className="text-[10px] text-ink-400 uppercase font-semibold">{label}</p>
      <p className="text-sm font-bold font-mono-num text-ink-900 dark:text-mist-50 mt-0.5">{value}</p>
    </div>
  )
}
