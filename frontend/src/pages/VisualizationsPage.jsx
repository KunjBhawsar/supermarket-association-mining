import { useEffect, useMemo } from 'react'
import { BarChart3, LockKeyhole } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ComposedChart } from 'recharts'
import { useData } from '../context/DataContext'
import { LockedState, EmptyState } from '../components/States'

const LABEL = { apriori: 'Apriori', fpgrowth: 'FP-Growth', fpmax: 'FP-Max' }

function histogram(values, bins = 12) {
  const clean = values.filter((v) => Number.isFinite(v))
  if (!clean.length) return []
  const min = Math.min(...clean), max = Math.max(...clean)
  if (min === max) return [{ range: min.toFixed(3), count: clean.length }]
  const width = (max - min) / bins
  const out = Array.from({ length: bins }, (_, i) => ({ range: `${(min + i * width).toFixed(3)}–${(min + (i + 1) * width).toFixed(3)}`, count: 0 }))
  clean.forEach((v) => { let i = Math.floor((v - min) / width); if (i >= bins) i = bins - 1; out[i].count += 1 })
  return out
}

export default function VisualizationsPage() {
  const { preprocessSummary, results, feedback, loadFeedback } = useData()

  useEffect(() => {
    if (preprocessSummary) loadFeedback()
  }, [preprocessSummary, loadFeedback])

  // IMPORTANT: keep hooks unconditional. The previous version called useMemo
  // only after the preprocess guard, which changed hook order and could trigger
  // React's "Maximum update depth exceeded" / recursion-style runtime error.
  const rows = Object.entries(results || {})
  const algoData = rows.map(([key, r]) => ({ name: LABEL[key] || key, time: Number(r.execution_time_ms) || 0, itemsets: Number(r.num_itemsets) || 0, rules: Number(r.num_rules) || 0 }))
  const activeKey = results?.apriori ? 'apriori' : results?.fpgrowth ? 'fpgrowth' : results?.fpmax ? 'fpmax' : null
  const active = activeKey ? results[activeKey] : null
  const itemSupport = active?.itemsets?.map((x) => Number(x.support)).filter(Number.isFinite) || []
  const ruleSupport = active?.rules?.map((x) => Number(x.support)).filter(Number.isFinite) || []
  const confidence = active?.rules?.map((x) => Number(x.confidence)).filter(Number.isFinite) || []
  const lift = active?.rules?.map((x) => Number(x.lift)).filter(Number.isFinite) || []

  const charts = useMemo(() => ({
    support: histogram(itemSupport),
    confidence: histogram(confidence),
    lift: histogram(lift),
    ruleSupport: histogram(ruleSupport),
  }), [itemSupport.join(','), confidence.join(','), lift.join(','), ruleSupport.join(',')])

  if (!preprocessSummary) return <LockedState />
  if (!rows.length && !feedback?.available) return <EmptyState icon={BarChart3} title="No visualization data yet" description="Run Apriori for mining charts, or upload a dataset with a Feedback/Rating column for customer-feedback charts." />

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
        <p className="text-sm font-bold text-ink-900 dark:text-mist-50">Analytics visualization</p>
        <p className="text-xs text-ink-400 mt-1">Charts below use the algorithms actually run in this session. Start with Apriori by default, then compare other algorithms when needed.</p>
      </div>

      {feedback?.available && (
        <section>
          <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-1">Customer feedback</p>
          <p className="text-xs text-ink-400 mb-3">All ratings use valid values from 1 (Very Poor) to 5 (Excellent).</p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <FeedbackBar title="Feedback rating distribution" subtitle="X-axis: Feedback rating · Y-axis: Number of customer responses" data={feedback.distribution || []} dataKey="count" name="Responses" />
            <FeedbackBar title="Average feedback by product" subtitle="X-axis: Product · Y-axis: Average feedback rating" data={(feedback.product_ratings || []).slice(0, 12)} dataKey="average_rating" name="Average rating" max={5} />
            <SalesFeedbackChart data={(feedback.product_ratings || []).slice(0, 12)} />
            {feedback.trend?.length > 0 && <FeedbackTrend data={feedback.trend} />}
          </div>
          {feedback.insights?.length > 0 && (
            <div className="mt-5 rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
              <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-3">Feedback insights</p>
              <ul className="space-y-2 text-xs text-ink-500 dark:text-ink-200 leading-relaxed">
                {feedback.insights.map((insight) => <li key={insight}>• {insight}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      {rows.length > 0 && <>
        <section>
          <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-3">Algorithm comparison</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <ChartCard title="Execution time" data={algoData} dataKey="time" name="Time (ms)->" />
            <ChartCard title="Frequent itemsets" data={algoData} dataKey="itemsets" name="Itemsets->" />
            <ChartCard title="Association rules" data={algoData} dataKey="rules" name="Rules->" />
          </div>
        </section>

        <section>
          <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-3">Mining distributions</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <HistCard title="Itemset support distribution" data={charts.support} />
            <HistCard title="Rule support distribution" data={charts.ruleSupport} />
            <HistCard title="Rule confidence distribution" data={charts.confidence} />
            <HistCard title="Rule lift distribution" data={charts.lift} />
          </div>
        </section>

        <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
          <p className="text-sm font-bold text-ink-900 dark:text-mist-50">How to read these charts</p>
          <div className="grid md:grid-cols-3 gap-4 mt-4 text-xs text-ink-500 dark:text-ink-200 leading-relaxed">
            <p><b className="text-ink-900 dark:text-mist-50">Support:</b> how often an itemset appears across transactions. Higher support means broader store relevance.</p>
            <p><b className="text-ink-900 dark:text-mist-50">Confidence:</b> how often the consequent appears when the antecedent is present. Higher confidence is useful for cross-selling.</p>
            <p><b className="text-ink-900 dark:text-mist-50">Lift:</b> how much stronger the relationship is than random co-occurrence. Values above 1 indicate positive association.</p>
          </div>
        </div>
      </>}
    </div>
  )
}

function FeedbackBar({ title, subtitle, data, dataKey, name, max }) {
  const xKey = data?.[0]?.rating !== undefined ? 'rating' : 'product'

  return (
    <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
      <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-1">
        {title}
      </p>

      <p className="text-xs text-ink-400 mb-3">
        {subtitle}
      </p>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{
            top: 19,
            right: 20,
            bottom: xKey === 'product' ? 10 : 12,
            left: xKey === 'product' ? 12 : 12,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey={xKey}
            tick={{
              fontSize: 11,
              fontWeight: 800
            }}
            angle={xKey === 'product' ? -30 : 0}
            textAnchor={xKey === 'product' ? 'end' : 'middle'}
            height={xKey === 'product' ? 58 : 24}
            label={{
              value: xKey === 'product' ? 'Product->' : 'Feedback rating->',
              position: 'bottom',
              offset: 1,
              style: {
                fontWeight: 800,
                fontSize: 11
              }
            }}
          />

          <YAxis
            domain={max ? [0, max] : [0, 'auto']}
            allowDecimals={!!max}
            tick={{
              fontSize: 11,
              fontWeight: 800
            }}
            label={{
              value: max
                ? 'Average feedback rating->'
                : 'Number of customer responses->',
              angle: -90,
              position: 'left',
              offset: -15,
              dy:-75,
              style: {
                fontWeight: 800,
                fontSize: 11
              }
            }}
          />

          <Tooltip />

          <Bar
            dataKey={dataKey}
            name={name}
            fill="#F5A623"
            radius={[5, 5, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function SalesFeedbackChart({ data }) {
  return <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
    <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-1">Feedback vs sales</p><p className="text-xs text-ink-400 mb-3">Bars: product transactions · Line: average feedback (1–5)</p>
    <ResponsiveContainer width="100%" height={315}><ComposedChart data={data} margin={{ top: 8, right:5, bottom: 4, left: 2 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="product" tick={{ fontSize: 11, fontWeight: 800 }} angle={-30} textAnchor="end" height={64} label={{ value: 'Product->', position: 'bottom', offset: -5, style: { fontWeight: 800, fontSize: 11 } }} /><YAxis yAxisId="sales" tick={{ fontSize: 11, fontWeight: 800 }} label={{ value: 'Sales transactions->', angle: -90, position: 'left', offset: 1, dx: 12, dy: -45, style: { fontWeight: 800, fontSize: 11 } }} /><Tooltip /><Legend verticalAlign="top" align="center" height={28} iconSize={10} wrapperStyle={{ fontWeight: 800, fontSize: 11, whiteSpace: 'nowrap' }} /><Bar yAxisId="sales" dataKey="sales" name="Sales transactions" fill="#2FBF71" /><Line yAxisId="rating" type="monotone" dataKey="average_rating" name="Average rating" stroke="#8B6FD9" strokeWidth={3} /></ComposedChart></ResponsiveContainer>
  </div>
}

function FeedbackTrend({ data }) {
  return <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
    <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-1">Feedback trend</p><p className="text-xs text-ink-400 mb-3">X-axis: Date · Y-axis: Average feedback rating</p>
    <ResponsiveContainer width="100%" height={300}><LineChart data={data} margin={{ top: 8, right: 20, bottom: 12, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11, fontWeight: 800 }} label={{ value: 'Date->', position: 'bottom', offset: 0, style: { fontWeight: 800, fontSize: 11 } }} /><YAxis domain={[0, 5]} tick={{ fontSize: 11, fontWeight: 800 }} label={{ value: 'Average feedback rating->', angle: -90, position: 'left', offset: -25, dy:-55,  style: { fontWeight: 800, fontSize: 11 } }} /><Tooltip /><Line type="monotone" dataKey="average_rating" name="Average rating" stroke="#F5A623" strokeWidth={3} /></LineChart></ResponsiveContainer>
  </div>
}

function ChartCard({ title, data, dataKey, name }) {
  return <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
    <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-1">{title}</p>
    <p className="text-xs text-ink-400 mb-3">X-axis: Algorithm · Y-axis: Measured result</p>
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 14, bottom: 5, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-ink-200)" vertical={false} className="dark:opacity-10 opacity-40" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} label={{ value: 'Algorithm', position: 'bottom', offset: -10, style: { fontWeight: 800, fontSize: 11, fill: 'var(--color-ink-400)' } }} />
        <YAxis allowDecimals={false} label={{ value: name, angle: -90, position: 'left', offset: 10, dy:-45,  style: { fontWeight: 800, fontSize: 11, fill: 'var(--color-ink-400)' } }} tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: 'var(--color-ink-850)', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' }} />
        <Bar dataKey={dataKey} name={name} fill="#2FBF71" barSize={28} maxBarSize={28} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
}

function HistCard({ title, data }) {
  return <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5">
    <p className="text-sm font-bold text-ink-900 dark:text-mist-50 mb-1">{title}</p>
    <p className="text-xs text-ink-400 mb-3">X-axis: Metric value range · Y-axis: Number of itemsets/rules in that range</p>
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 14, bottom: 6, left: 6 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-ink-200)" vertical={false} className="dark:opacity-10 opacity-40" />
        <XAxis dataKey="range" tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} angle={-25} textAnchor="end" height={60} axisLine={false} tickLine={false} label={{ value: 'Metric value range->', position: 'bottom', offset: -5, style: { fontWeight: 800, fontSize: 11, fill: 'var(--color-ink-400)' } }} />
        <YAxis allowDecimals={false} label={{ value: 'Count->', angle: -90, position: 'left', offset: -12, dy: -16, style: { fontWeight: 800, fontSize: 11, fill: 'var(--color-ink-400)' } }} tick={{ fontSize: 11, fontWeight: 800, fill: 'var(--color-ink-400)' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: 'var(--color-ink-850)', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' }} />
        <Bar dataKey="count" name="Count" fill="#8B6FD9" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
}
