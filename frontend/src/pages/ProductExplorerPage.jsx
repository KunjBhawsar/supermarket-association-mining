import { useEffect, useMemo, useState } from 'react'
import { Search, ShoppingBasket, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useData } from '../context/DataContext'
import { api } from '../api/client'
import { LockedState, LoadingState } from '../components/States'

export default function ProductExplorerPage() {
  const { preprocessSummary, products, loadProducts, loading, algorithm, results } = useData()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [sales, setSales] = useState(null)
  const [salesLoading, setSalesLoading] = useState(false)

  useEffect(() => {
    if (preprocessSummary) loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preprocessSummary])

  const mined = results[algorithm]

  useEffect(() => {
    if (!selected) { setSales(null); return }
    setSalesLoading(true)
    api.getProductSales(selected).then(setSales).catch(() => setSales(null)).finally(() => setSalesLoading(false))
  }, [selected])

  const filtered = useMemo(() => {
    if (!products) return []
    const q = query.toLowerCase()
    return products.products.filter((p) => p.product.toLowerCase().includes(q))
  }, [products, query])

  const allRelatedRules = useMemo(() => {
    if (!mined || !selected) return []
    return mined.rules.filter((r) => r.antecedents.includes(selected) || r.consequents.includes(selected))
  }, [mined, selected])

  const relatedRules = useMemo(() => allRelatedRules.slice(0, 12), [allRelatedRules])

  if (!preprocessSummary) return <LockedState />
  if (loading.products || !products) return <LoadingState label="Loading product catalog…" />

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 overflow-hidden flex flex-col max-h-[720px]">
        <div className="p-4 border-b border-ink-200/60 dark:border-ink-700/60">
          <div className="flex items-center gap-2 bg-ink-50 dark:bg-ink-800/60 rounded-lg px-3 py-1.5">
            <Search size={14} className="text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="bg-transparent text-xs outline-none flex-1 text-ink-900 dark:text-mist-50 placeholder:text-ink-400"
            />
          </div>
        </div>
        <div className="overflow-y-auto">
          {filtered.map((p) => (
            <button
              key={p.product}
              onClick={() => setSelected(p.product)}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left border-b border-ink-100 dark:border-ink-800 transition-colors ${
                selected === p.product ? 'bg-leaf-500/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800/40'
              }`}
            >
              <span className={`text-xs font-medium ${selected === p.product ? 'text-leaf-600 dark:text-leaf-400' : 'text-ink-900 dark:text-mist-50'}`}>{p.product}</span>
              <span className="text-[11px] font-mono-num text-ink-400">{p.count} txns</span>
            </button>
          ))}
        </div>
      </div>

      <div className="lg:col-span-3">
        {!selected ? (
          <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 h-full flex items-center justify-center py-24">
            <div className="text-center">
              <ShoppingBasket size={22} className="text-ink-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-ink-900 dark:text-mist-50">Select a product</p>
              <p className="text-xs text-ink-400 mt-1">See its frequency and the rules it appears in</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-up">
            {(() => {
              const p = products.products.find((x) => x.product === selected)
              const bestConfidence = allRelatedRules.length ? Math.max(...allRelatedRules.map((r) => r.confidence)) : null
              const bestLift = allRelatedRules.length ? Math.max(...allRelatedRules.map((r) => r.lift)) : null
              return (
                <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5 grid grid-cols-2 md:grid-cols-4 gap-5">
                  <div>
                    <p className="text-xs text-ink-400">Appears in</p>
                    <p className="text-2xl font-bold font-mono-num text-ink-900 dark:text-mist-50">{p.count}</p>
                    <p className="text-[11px] text-ink-400">of {products.total_transactions} transactions</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-400">Support</p>
                    <p className="text-2xl font-bold font-mono-num text-leaf-600 dark:text-leaf-400">{(p.support * 100).toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-400">Best confidence</p>
                    <p className="text-2xl font-bold font-mono-num text-ink-900 dark:text-mist-50">{bestConfidence === null ? '—' : `${(bestConfidence * 100).toFixed(1)}%`}</p>
                    <p className="text-[11px] text-ink-400">highest related rule</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-400">Best lift</p>
                    <p className="text-2xl font-bold font-mono-num text-leaf-600 dark:text-leaf-400">{bestLift === null ? '—' : bestLift.toFixed(2)}</p>
                    <p className="text-[11px] text-ink-400">highest related rule</p>
                  </div>
                </div>
              )
            })()}

            <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 size={15} className="text-leaf-500" />
                <p className="text-sm font-bold text-ink-900 dark:text-mist-50">{selected} — sales histogram</p>
              </div>
              <p className="text-xs text-ink-400 mb-4">Distribution of this product’s daily transaction totals. X-axis: daily transactions (number) · Y-axis: number of days. Total transactions containing this product: {sales?.transaction_count ?? '—'}.</p>
              {salesLoading && <p className="text-xs text-ink-400 py-10 text-center">Loading product sales…</p>}
              {!salesLoading && sales && sales.histogram.length > 0 && (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={sales.histogram}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-ink-200)" vertical={false} className="dark:opacity-10 opacity-40" />
                    <XAxis dataKey="transactions" type="number" allowDecimals={false} label={{ value: 'Daily transactions (number)->', position: 'insideBottom', offset: 1, style: { fontWeight: 800, fontSize: 11, fill: 'var(--color-ink-400)' } }} tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} label={{ value: 'Number of days->', angle: -90, position: 'insideLeft', offset: 2, dy:45, style: { fontWeight: 800, fontSize: 11, fill: 'var(--color-ink-400)' } }} tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--color-ink-850)', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' }} />
                    <Bar dataKey="days" name="Number of days" fill="#2FBF71" barSize={18} maxBarSize={18} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {!salesLoading && sales && sales.histogram.length === 0 && <p className="text-xs text-ink-400 py-10 text-center">No date information is available for this product.</p>}
            </div>

            <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 overflow-hidden">
              <p className="text-sm font-bold text-ink-900 dark:text-mist-50 px-5 pt-4 pb-2">
                Rules involving {selected} {mined ? `(${allRelatedRules.length})` : ''}
              </p>
              {!mined && <p className="text-xs text-ink-400 px-5 pb-5">Run mining on the Rule Explorer page to see associated rules here.</p>}
              {mined && relatedRules.length === 0 && <p className="text-xs text-ink-400 px-5 pb-5">No rules found involving this product at the current thresholds.</p>}
              {mined && relatedRules.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-ink-400 text-left border-t border-ink-100 dark:border-ink-800">
                      <th className="px-5 py-2.5 font-semibold">Rule</th>
                      <th className="px-5 py-2.5 font-semibold">Confidence</th>
                      <th className="px-5 py-2.5 font-semibold">Lift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedRules.map((r) => (
                      <tr key={r.id} className="border-t border-ink-100 dark:border-ink-800">
                        <td className="px-5 py-2.5 text-ink-900 dark:text-mist-50">
                          {r.antecedents.join(', ')} <span className="text-ink-400">→</span> <span className="text-leaf-600 dark:text-leaf-400">{r.consequents.join(', ')}</span>
                        </td>
                        <td className="px-5 py-2.5 font-mono-num text-ink-600 dark:text-ink-200">{(r.confidence * 100).toFixed(1)}%</td>
                        <td className="px-5 py-2.5 font-mono-num font-semibold text-leaf-600 dark:text-leaf-400">{r.lift.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
