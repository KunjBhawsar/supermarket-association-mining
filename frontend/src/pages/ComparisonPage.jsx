import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { ArrowLeftRight, Zap } from 'lucide-react'
import { useData } from '../context/DataContext'
import { LockedState, LoadingState, EmptyState } from '../components/States'

const ALGO_LABEL = { apriori: 'Apriori', fpgrowth: 'FP-Growth', fpmax: 'FP-Max' }
const ALGO_COLOR = { apriori: '#8B6FD9', fpgrowth: '#2FBF71', fpmax: '#F5A623' }

export default function ComparisonPage() {
  const { preprocessSummary, params, setParams, runCompare, comparison, loading } = useData()
  const [local, setLocal] = useState(params)

  if (!preprocessSummary) return <LockedState />

  const run = () => { setParams(local); runCompare(local) }

  const timeData = comparison?.results.filter((r) => !r.error).map((r) => ({ name: ALGO_LABEL[r.algorithm], ms: r.execution_time_ms, fill: ALGO_COLOR[r.algorithm] }))
  const countData = comparison?.results.filter((r) => !r.error).map((r) => ({ name: ALGO_LABEL[r.algorithm], Itemsets: r.num_itemsets, Rules: r.num_rules }))

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-4 flex flex-wrap items-end gap-4">
        <ParamField label="Min Support" value={local.min_support} min={0.005} max={0.5} step={0.005} onChange={(v) => setLocal((p) => ({ ...p, min_support: v }))} />
        <ParamField label="Min Confidence" value={local.min_confidence} min={0.05} max={0.95} step={0.05} onChange={(v) => setLocal((p) => ({ ...p, min_confidence: v }))} />
        <ParamField label="Min Lift" value={local.min_lift} min={0} max={10} step={0.1} onChange={(v) => setLocal((p) => ({ ...p, min_lift: v }))} />
        <button onClick={run} disabled={loading.compare} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ink-900 dark:bg-leaf-500 text-mist-50 dark:text-ink-950 text-xs font-bold ml-auto disabled:opacity-60">
          <Zap size={14} /> Run all 3 algorithms
        </button>
      </div>

      {loading.compare && <LoadingState label="Running Apriori, FP-Growth and FP-Max…" />}

      {!loading.compare && !comparison && (
        <EmptyState icon={ArrowLeftRight} title="No comparison yet" description="Click 'Run all 3 algorithms' to benchmark them on identical thresholds." />
      )}

      {!loading.compare && comparison && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
              <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-1">Execution time</p>
              <p className="text-xs text-ink-400 mb-4">Real wall-clock time measured on this run, in milliseconds.</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={timeData} margin={{ top: 8, right: 18, bottom: 15, left: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-ink-200)" vertical={false} className="dark:opacity-10 opacity-40" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} label={{ value: 'Algorithm->', position: 'bottom', offset: 0, style: { fontWeight: 800, fontSize: 11 } }} />
                  <YAxis tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} unit="ms" label={{ value: 'Execution time (ms)->', angle: -90, position: 'left', offset: 0, dy: -55, style: { fontWeight: 800, fontSize: 11 } }} />
                  <Tooltip contentStyle={{ background: 'var(--color-ink-850)', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' }} />
                  <Bar dataKey="ms" radius={[6, 6, 0, 0]} barSize={48} fill="#2FBF71" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
              <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-1">Itemsets vs. Rules produced</p>
              <p className="text-xs text-ink-400 mb-4">FP-Max returns only maximal itemsets, so it typically yields fewer/no classic rules.</p>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={countData} margin={{ top: 8, right: 8, bottom: 48, left: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-ink-200)" vertical={false} className="dark:opacity-10 opacity-40" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} label={{ value: 'Algorithm->', position: 'bottom', offset: -4, style: { fontWeight: 800, fontSize: 11 } }} />
                  <YAxis tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} label={{ value: 'Count->', angle: -90, position: 'left', offset: 0, dy:-27,  style: { fontWeight: 800, fontSize: 11 } }} />
                  <Tooltip contentStyle={{ background: 'var(--color-ink-850)', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' }} />
                  <Legend verticalAlign="bottom" align="center" height={24} wrapperStyle={{ fontSize: 11, fontWeight: 800, paddingTop: 20, whiteSpace: 'nowrap'}} />                  <Bar dataKey="Itemsets" fill="#8B6FD9" radius={[6, 6, 0, 0]} barSize={20} />
                  <Bar dataKey="Rules" fill="#2FBF71" radius={[6, 6, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 overflow-hidden">
            <p className="text-sm font-bold text-ink-900 dark:text-mist-50 px-5 pt-4 pb-3">Full comparison table</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-400 text-left border-t border-ink-100 dark:border-ink-800">
                  <th className="px-5 py-2.5 font-semibold">Algorithm</th>
                  <th className="px-5 py-2.5 font-semibold">Time (ms)</th>
                  <th className="px-5 py-2.5 font-semibold">Itemsets</th>
                  <th className="px-5 py-2.5 font-semibold">Rules</th>
                  <th className="px-5 py-2.5 font-semibold">Max size</th>
                  <th className="px-5 py-2.5 font-semibold">Avg support</th>
                  <th className="px-5 py-2.5 font-semibold">Top rule (by lift)</th>
                </tr>
              </thead>
              <tbody>
                {comparison.results.map((r) => (
                  <tr key={r.algorithm} className="border-t border-ink-100 dark:border-ink-800">
                    <td className="px-5 py-2.5 font-semibold" style={{ color: ALGO_COLOR[r.algorithm] }}>{ALGO_LABEL[r.algorithm]}</td>
                    {r.error ? (
                      <td className="px-5 py-2.5 text-coral-500" colSpan={6}>{r.error}</td>
                    ) : (
                      <>
                        <td className="px-5 py-2.5 font-mono-num text-ink-900 dark:text-mist-50">{r.execution_time_ms}</td>
                        <td className="px-5 py-2.5 font-mono-num text-ink-600 dark:text-ink-200">{r.num_itemsets}</td>
                        <td className="px-5 py-2.5 font-mono-num text-ink-600 dark:text-ink-200">{r.num_rules}</td>
                        <td className="px-5 py-2.5 font-mono-num text-ink-600 dark:text-ink-200">{r.max_itemset_length}</td>
                        <td className="px-5 py-2.5 font-mono-num text-ink-600 dark:text-ink-200">{(r.avg_support * 100).toFixed(2)}%</td>
                        <td className="px-5 py-2.5 text-ink-600 dark:text-ink-200">
                          {r.top_rule_by_lift
                            ? `${r.top_rule_by_lift.antecedents.join('+')} → ${r.top_rule_by_lift.consequents.join('+')} (lift ${r.top_rule_by_lift.lift})`
                            : '—'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function ParamField({ label, value, min, max, step, onChange }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[140px]">
      <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide flex justify-between">
        {label}<span className="font-mono-num text-ink-900 dark:text-mist-50 normal-case">{value}</span>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="accent-leaf-500 h-1.5" />
    </div>
  )
}
