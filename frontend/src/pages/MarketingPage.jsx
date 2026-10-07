import { useEffect, useMemo, useState } from 'react'
import { Megaphone, Download, Tag, MapPin, Gift, Ticket, LayoutGrid, Star, MessageSquare, AlertTriangle } from 'lucide-react'
import { useData } from '../context/DataContext'
import { api } from '../api/client'
import { LockedState, LoadingState, EmptyState } from '../components/States'

const STRATEGY_META = {
  'Bundle offer': { icon: Gift, color: 'text-leaf-600 dark:text-leaf-400', bg: 'bg-leaf-500/10' },
  'Cross-sell placement': { icon: MapPin, color: 'text-plum-500', bg: 'bg-plum-500/10' },
  'Targeted coupon': { icon: Ticket, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  'Shelf optimization': { icon: LayoutGrid, color: 'text-coral-500', bg: 'bg-coral-500/10' },
}

export default function MarketingPage() {
  const { preprocessSummary, algorithm, results, marketing, loadMarketing, loading, products, loadProducts } = useData()
  const [filterType, setFilterType] = useState('all')
  // Empty selection means All products. Otherwise only rules containing one of
  // the selected products are used to generate and display business insights.
  const [selectedProducts, setSelectedProducts] = useState([])
  const mined = results[algorithm]
  const data = marketing[algorithm]
  const feedback = preprocessSummary?.feedback

  useEffect(() => {
    if (preprocessSummary) loadProducts()
  }, [preprocessSummary, loadProducts])

  useEffect(() => {
    setSelectedProducts([])
  }, [preprocessSummary?.dataset_id])

  useEffect(() => {
    if (preprocessSummary && mined) loadMarketing(algorithm, 40, selectedProducts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preprocessSummary, mined, algorithm, selectedProducts])

  const productOptions = products?.products || []
  const allSelected = selectedProducts.length === 0

  const toggleProduct = (product) => {
    setSelectedProducts((prev) => prev.includes(product) ? prev.filter((p) => p !== product) : [...prev, product])
  }

  const filtered = useMemo(() => {
    if (!data) return []
    return data.recommendations.filter((r) => filterType === 'all' || r.strategy_type === filterType)
  }, [data, filterType])

  if (!preprocessSummary) return <LockedState />

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-ink-900 dark:text-mist-50">Marketing intelligence</p>
          <p className="text-xs text-ink-400 mt-0.5">Association strength is combined with customer feedback; negative feedback reduces adjusted confidence before business actions are selected.</p>
          <p className="text-[11px] font-semibold text-leaf-600 dark:text-leaf-400 mt-2">Insight scope: {allSelected ? 'All products' : selectedProducts.join(', ')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <details className="relative">
            <summary className="list-none cursor-pointer app-select text-xs font-semibold border border-ink-200 dark:border-ink-700 rounded-lg px-3 py-1.5 bg-mist-50 dark:bg-ink-850 text-ink-900 dark:text-mist-50 min-w-[190px]">
              Product insights: {allSelected ? 'All products' : `${selectedProducts.length} selected`} ▾
            </summary>
            <div className="absolute z-30 right-0 mt-2 w-72 max-h-80 overflow-y-auto rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-850 shadow-xl p-2">
              <label className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-mist-100 dark:hover:bg-ink-800 text-xs font-bold cursor-pointer">
                <input type="checkbox" checked={allSelected} onChange={() => setSelectedProducts([])} />
                All products
              </label>
              <div className="my-1 border-t border-ink-100 dark:border-ink-800" />
              {productOptions.map((item) => {
                const product = item.product
                const checked = selectedProducts.includes(product)
                return (
                  <label key={product} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-mist-100 dark:hover:bg-ink-800 text-xs cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => toggleProduct(product)} />
                    <span className="truncate">{product}</span>
                  </label>
                )
              })}
            </div>
          </details>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="app-select text-xs font-semibold border border-ink-200 dark:border-ink-700 rounded-lg px-2.5 py-1.5 bg-mist-50 dark:bg-ink-850 text-ink-900 dark:text-mist-50"
          >
            <option value="all">All strategies</option>
            {Object.keys(STRATEGY_META).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {mined && (
            <>
              <a
                href={api.exportUrl('business-report', algorithm, selectedProducts)}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-leaf-500 text-ink-950 hover:bg-leaf-400"
              >
                <Download size={12} /> Business Report (Excel)
              </a>
            </>
          )}
        </div>
      </div>

      {mined && (
        <div className="rounded-2xl border border-leaf-500/20 bg-leaf-500/5 p-4">
          <p className="text-sm font-bold text-ink-900 dark:text-mist-50">Readable business report</p>
          <p className="text-xs text-ink-500 dark:text-ink-200 mt-1 leading-relaxed">Download the readable Excel business report with the current analysis, business insights, recommendations, data and visualizations.</p>
        </div>
      )}

      {mined && feedback?.available && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink-900 dark:text-mist-50 flex items-center gap-2"><MessageSquare size={15} /> Customer feedback is part of the decision</p>
              <p className="text-xs text-ink-500 dark:text-ink-200 mt-1">Marketing recommendations combine association strength with actual product/customer ratings before selecting an action.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-mono-num">
              <span className="px-2.5 py-1.5 rounded-lg bg-white/70 dark:bg-ink-850 border border-ink-200/50 dark:border-ink-700/60"><Star size={11} className="inline mr-1" /> Avg <b>{Number(feedback.average_rating || 0).toFixed(2)}/5</b></span>
              <span className="px-2.5 py-1.5 rounded-lg bg-white/70 dark:bg-ink-850 border border-ink-200/50 dark:border-ink-700/60">Positive <b>{Number(feedback.positive_percentage || 0).toFixed(1)}%</b></span>
              <span className="px-2.5 py-1.5 rounded-lg bg-white/70 dark:bg-ink-850 border border-ink-200/50 dark:border-ink-700/60">Negative <b>{Number(feedback.negative_percentage || 0).toFixed(1)}%</b></span>
            </div>
          </div>
        </div>
      )}

      {!mined && (
        <EmptyState icon={Megaphone} title="No recommendations yet" description="Mine an algorithm on the Rule Explorer or Overview page first." />
      )}

      {mined && loading.marketing && <LoadingState label="Translating rules into strategy…" />}

      {mined && !loading.marketing && data && data.recommendations.length === 0 && (
        <EmptyState icon={Megaphone} title="Nothing strong enough yet" description="Lower the confidence/lift thresholds to surface actionable rules." />
      )}

      {mined && !loading.marketing && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((r) => {
            const meta = STRATEGY_META[r.strategy_type] || STRATEGY_META['Shelf optimization']
            const Icon = meta.icon
            return (
              <div key={r.rule_id} className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5 flex flex-col gap-3 animate-fade-up">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.bg}`}>
                    <Icon size={15} className={meta.color} />
                  </div>
                  <span className={`text-[11px] font-bold ${meta.color}`}>{r.strategy_type}</span>
                </div>

                <p className="text-sm font-semibold text-ink-900 dark:text-mist-50 leading-snug">
                  {r.antecedents.join(' + ')} <span className="text-ink-400">→</span> {r.consequents.join(' + ')}
                </p>

                <div className="flex flex-wrap gap-4 text-[11px] font-mono-num text-ink-400">
                  <span>Supp <b className="text-ink-900 dark:text-mist-50">{(r.support * 100).toFixed(1)}%</b></span>
                  <span>Conf <b className="text-ink-900 dark:text-mist-50">{(r.confidence * 100).toFixed(1)}%</b></span>
                  <span>Adj. Conf <b className="text-amber-600 dark:text-amber-400">{((r.adjusted_confidence ?? r.confidence) * 100).toFixed(1)}%</b></span>
                  <span>Lift <b className="text-leaf-600 dark:text-leaf-400">{r.lift.toFixed(2)}</b></span>
                </div>

                {r.feedback_available && (
                  <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-3 text-[11px]">
                    <div className="flex items-center gap-1.5 font-bold text-ink-700 dark:text-mist-100 mb-1"><Star size={11} /> Feedback used in recommendation</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-500 dark:text-ink-300">
                      <span>Antecedent: <b>{r.antecedent_feedback == null ? 'N/A' : `${Number(r.antecedent_feedback).toFixed(2)}/5`}</b></span>
                      <span>Recommended product: <b>{r.consequent_feedback == null ? 'N/A' : `${Number(r.consequent_feedback).toFixed(2)}/5`}</b></span>
                      <span>Rule feedback: <b>{r.combined_feedback == null ? 'N/A' : `${Number(r.combined_feedback).toFixed(2)}/5`}</b></span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-ink-500 dark:text-ink-300">
                      <span>Negative feedback: <b>{r.negative_feedback_rate == null ? 'N/A' : `${(Number(r.negative_feedback_rate) * 100).toFixed(1)}%`}</b></span>
                      <span>Adjusted confidence: <b>{((r.adjusted_confidence ?? r.confidence) * 100).toFixed(1)}%</b></span>
                    </div>
                    <p className="mt-1 text-ink-500 dark:text-ink-300 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {r.feedback_signal}</p>
                  </div>
                )}

                <p className="text-xs text-ink-500 dark:text-ink-200 leading-relaxed">{r.interpretation}</p>

                <div className="mt-1 pt-3 border-t border-ink-100 dark:border-ink-800">
                  <p className="text-[10px] font-bold text-ink-400 uppercase flex items-center gap-1 mb-1"><Tag size={10} /> Suggested action</p>
                  <p className="text-xs text-ink-600 dark:text-ink-200 leading-relaxed">{r.suggested_action}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
