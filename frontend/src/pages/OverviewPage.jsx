import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Receipt, Boxes, Users, ScanBarcode, Timer, Layers, GitFork, Star, ThumbsUp, ThumbsDown, Trophy, TriangleAlert } from 'lucide-react'
import { useData } from '../context/DataContext'
import KpiCard from '../components/KpiCard'
import ParamsBar from '../components/ParamsBar'
import { LockedState, LoadingState, ErrorState } from '../components/States'

const BAR_COLORS = ['#2FBF71', '#4FD98A', '#8B6FD9', '#F5A623', '#EF6461']

export default function OverviewPage() {
  const { preprocessSummary, algorithm, results, runMine, loading, error, setError, feedback, loadFeedback } = useData()
  const navigate = useNavigate()

  const mined = results[algorithm]

  useEffect(() => {
    if (preprocessSummary) loadFeedback()
  }, [preprocessSummary, loadFeedback])

  if (!preprocessSummary) return <LockedState />

  const topProducts = preprocessSummary.top_products.map((p, i) => ({ ...p, fill: BAR_COLORS[i % BAR_COLORS.length] }))

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      {error && <ErrorState message={error} onRetry={() => setError(null)} />}

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up">
        <KpiCard label="Transactions" value={preprocessSummary.num_transactions.toLocaleString()} icon={Receipt} accent="leaf" sub={preprocessSummary.date_range ? `${preprocessSummary.date_range.start} → ${preprocessSummary.date_range.end}` : undefined} />
        <KpiCard label="Unique Products" value={preprocessSummary.num_unique_products} icon={Boxes} accent="plum" />
        <KpiCard label="Avg Basket Size" value={preprocessSummary.avg_basket_size} icon={ScanBarcode} accent="amber" sub={`range ${preprocessSummary.min_basket_size}–${preprocessSummary.max_basket_size} items`} />
        <KpiCard label="Customers" value={preprocessSummary.num_customers ?? '—'} icon={Users} accent="coral" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Top products chart */}
        <div className="lg:col-span-3 rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
          <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-1">Top-selling products</p>
          <p className="text-xs text-ink-400 mb-4">By number of transactions containing the item</p>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={topProducts} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-ink-200)" horizontal={false} className="dark:opacity-10 opacity-40" />
              <XAxis type="number" tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} label={{ value: 'Transactions->', position: 'insideBottom', offset: -4, style: { fontWeight: 800, fontSize: 11 } }} />
              <YAxis type="category" dataKey="product" width={135} interval={0} tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} label={{ value: 'Product->', angle: -90, position: 'insideLeft', offset: 24, style: { fontWeight: 800, fontSize: 11 } }} />
              <Tooltip
                contentStyle={{ background: 'var(--color-ink-850)', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' }}
                cursor={{ fill: 'rgba(47,191,113,0.06)' }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={14}>
                {topProducts.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Preprocessing summary */}
        <div className="lg:col-span-2 rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
          <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-4">Preprocessing summary</p>
          <dl className="space-y-3 text-xs">
            <Row label="Original rows" value={preprocessSummary.original_rows.toLocaleString()} />
            <Row label="Cleaned rows" value={preprocessSummary.cleaned_rows.toLocaleString()} />
            <Row label="Missing values" value={preprocessSummary.missing_values_found ?? 0} />
            <Row label="Duplicate rows removed" value={preprocessSummary.duplicate_rows_removed ?? preprocessSummary.duplicate_line_items_removed ?? 0} />
            <Row label="Quantity outliers" value={preprocessSummary.quantity_outliers_handled ?? 0} />
            <Row label="Single-item baskets dropped" value={preprocessSummary.single_item_transactions_removed} highlight="Not useful for association mining" />
            <Row label="Final basket count" value={preprocessSummary.num_transactions.toLocaleString()} />
            <Row label="Encoding" value="One-hot" highlight="TransactionEncoder for mining" />
            <Row label="Class distribution" value="N/A" highlight="Unsupervised association mining" />
          </dl>
          <div className="mt-5 pt-4 border-t border-ink-100 dark:border-ink-800 space-y-3">
            <TextRow label="Identifier handling" value={(preprocessSummary.identifier_columns_handled || []).join(', ') || 'None'} />
            <TextRow label="Encoding" value={preprocessSummary.categorical_encoding || 'One-hot basket encoding'} />
            <TextRow label="Feature selection" value={preprocessSummary.feature_selection || 'Product/Items selected for mining'} />
            <TextRow label="Outlier handling" value={preprocessSummary.outlier_handling || 'Quantity diagnostics applied'} />
          </div>
        </div>
      </div>

      {feedback?.available && (
        <section className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-ink-900 dark:text-mist-50">Customer feedback</p>
              <p className="text-xs text-ink-400 mt-1">Calculated from the validated {feedback.column} ratings in this dataset.</p>
            </div>
            <span className="text-xs font-semibold text-leaf-600 dark:text-leaf-400">{feedback.satisfaction_level}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <MiniStat icon={Star} label="Average rating" value={`${feedback.average_rating}/5`} />
            <MiniStat icon={Users} label="Responses" value={feedback.total_responses.toLocaleString()} />
            <MiniStat icon={ThumbsUp} label="Positive (4–5)" value={`${feedback.positive_percentage}%`} />
            <MiniStat icon={ThumbsDown} label="Negative (1–2)" value={`${feedback.negative_percentage}%`} />
            <MiniStat icon={Trophy} label="Highest rated" value={feedback.highest_rated_product || '—'} />
            <MiniStat icon={TriangleAlert} label="Lowest rated" value={feedback.lowest_rated_product || '—'} />
          </div>
        </section>
      )}

      {/* Mining snapshot */}
      <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-bold text-ink-900 dark:text-mist-50">Mining snapshot</p>
            <p className="text-xs text-ink-400">Pick an algorithm and thresholds, then run it to see live results — nothing here is precomputed.</p>
          </div>
        </div>
        <ParamsBar onRun={(algo, p) => runMine(algo, p)} />

        <div className="mt-5">
          {loading[`mine-${algorithm}`] && <LoadingState label={`Running ${algorithm}…`} />}
          {!loading[`mine-${algorithm}`] && mined && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-up">
              <MiniStat icon={Timer} label="Execution time" value={`${mined.execution_time_ms} ms`} />
              <MiniStat icon={Layers} label="Frequent itemsets" value={mined.num_itemsets} />
              <MiniStat icon={GitFork} label="Rules generated" value={mined.num_rules} />
              <MiniStat icon={Boxes} label="Max itemset size" value={mined.max_itemset_length} />
            </div>
          )}
          {!loading[`mine-${algorithm}`] && mined?.warning && (
            <p className="mt-4 text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2">{mined.warning}</p>
          )}
          {!loading[`mine-${algorithm}`] && !mined && (
            <p className="text-xs text-ink-400 py-4">Run the algorithm above to populate itemsets and rules across the whole dashboard.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-100 dark:border-ink-800 pb-2.5">
      <span className="text-ink-400">{label}{highlight && <span className="block text-[10px] text-ink-400/70">{highlight}</span>}</span>
      <span className="font-mono-num font-semibold text-ink-900 dark:text-mist-50">{value}</span>
    </div>
  )
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-ink-50 dark:bg-ink-800/60 p-4">
      <Icon size={15} className="text-leaf-500 mb-2" />
      <p className="text-lg font-bold font-mono-num text-ink-900 dark:text-mist-50">{value}</p>
      <p className="text-[11px] text-ink-400">{label}</p>
    </div>
  )
}

function TextRow({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-400">{label}</p>
      <p className="text-[11px] text-ink-600 dark:text-ink-200 leading-relaxed mt-0.5">{value}</p>
    </div>
  )
}
