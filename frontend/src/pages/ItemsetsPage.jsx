import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Layers } from 'lucide-react'
import { useData } from '../context/DataContext'
import ParamsBar from '../components/ParamsBar'
import { LockedState, LoadingState, EmptyState } from '../components/States'

export default function ItemsetsPage() {
  const { preprocessSummary, algorithm, results, runMine, loading } = useData()
  const [lengthFilter, setLengthFilter] = useState('all')
  const mined = results[algorithm]

  const filtered = useMemo(() => {
    if (!mined) return []
    return mined.itemsets.filter((s) => lengthFilter === 'all' || s.length === parseInt(lengthFilter))
  }, [mined, lengthFilter])

  const topChart = useMemo(() => filtered.slice(0, 12).map((s) => ({
    name: s.items.join(' + '),
    support: +(s.support * 100).toFixed(2),
  })), [filtered])

  if (!preprocessSummary) return <LockedState />

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <ParamsBar onRun={(algo, p) => runMine(algo, p)} />

      {loading[`mine-${algorithm}`] && <LoadingState label="Mining frequent itemsets…" />}

      {!loading[`mine-${algorithm}`] && !mined && (
        <EmptyState icon={Layers} title="No itemsets yet" description="Run an algorithm above to mine frequent itemsets." />
      )}

      {!loading[`mine-${algorithm}`] && mined && mined.num_itemsets === 0 && (
        <EmptyState icon={Layers} title="No frequent itemsets found" description="Try lowering the minimum support threshold." />
      )}

      {!loading[`mine-${algorithm}`] && mined && mined.num_itemsets > 0 && (
        <>
          <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
            <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-1">Top itemsets by support</p>
            <p className="text-xs text-ink-400 mb-4">{mined.num_itemsets} frequent itemsets found in {mined.execution_time_ms} ms</p>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={topChart} layout="vertical" margin={{ top: 8, right: 2, bottom: 12, left: -50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-ink-200)" horizontal={false} className="dark:opacity-10 opacity-40" />
                <XAxis type="number" unit="%" tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} label={{ value: 'Support->', position: 'insideBottom', offset: 1, style: { fontWeight: 800, fontSize: 11 } }} />
                <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} label={{ value: 'Itemset->', angle: -90, position: 'left', offset: -80, style: { fontWeight: 800, fontSize: 11 } }} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-ink-850)', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' }}
                  formatter={(v) => [`${v}%`, 'Support']}
                />
                <Bar dataKey="support" fill="#2FBF71" radius={[0, 6, 6, 0]} barSize={13} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/60 dark:border-ink-700/60">
              <p className="text-sm font-bold text-ink-900 dark:text-mist-50">All itemsets ({filtered.length})</p>
              <select
                value={lengthFilter}
                onChange={(e) => setLengthFilter(e.target.value)}
                className="app-select text-xs font-semibold border border-ink-200 dark:border-ink-700 rounded-lg px-2.5 py-1.5 bg-mist-50 dark:bg-ink-850 text-ink-900 dark:text-mist-50"
              >
                <option value="all">All sizes</option>
                {Array.from({ length: mined.max_itemset_length }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}-itemsets</option>
                ))}
              </select>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-mist-50 dark:bg-ink-850">
                  <tr className="text-ink-400 text-left">
                    <th className="px-5 py-2.5 font-semibold">Itemset</th>
                    <th className="px-5 py-2.5 font-semibold">Size</th>
                    <th className="px-5 py-2.5 font-semibold">Support</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={i} className="border-t border-ink-100 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-800/40">
                      <td className="px-5 py-2.5 text-ink-900 dark:text-mist-50 font-medium">
                        <div className="flex flex-wrap gap-1">
                          {s.items.map((it) => (
                            <span key={it} className="px-2 py-0.5 rounded-full bg-leaf-500/10 text-leaf-600 dark:text-leaf-400 text-[11px]">{it}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-ink-400 font-mono-num">{s.length}</td>
                      <td className="px-5 py-2.5 text-ink-600 dark:text-ink-200 font-mono-num">{(s.support * 100).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
