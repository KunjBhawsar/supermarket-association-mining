import { useState } from 'react'
import { Play, Loader2 } from 'lucide-react'
import { useData } from '../context/DataContext'

const ALGO_LABELS = {
  apriori: 'Apriori',
  fpgrowth: 'FP-Growth',
  fpmax: 'FP-Max',
}

export default function ParamsBar({ onRun }) {
  const { params, setParams, algorithm, setAlgorithm, loading } = useData()
  const [local, setLocal] = useState(params)

  const busy = loading[`mine-${algorithm}`]

  const apply = () => {
    setParams(local)
    onRun(algorithm, local)
  }

  return (
    <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-4 flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide">Algorithm</label>
        <div className="flex rounded-lg overflow-hidden border border-ink-200 dark:border-ink-700">
          {Object.entries(ALGO_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setAlgorithm(key)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                algorithm === key
                  ? 'bg-leaf-500 text-ink-950'
                  : 'bg-transparent text-ink-600 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ParamField
        label="Min Support"
        value={local.min_support}
        min={0.005} max={0.5} step={0.005}
        onChange={(v) => setLocal((p) => ({ ...p, min_support: v }))}
      />
      <ParamField
        label="Min Confidence"
        value={local.min_confidence}
        min={0.05} max={0.95} step={0.05}
        onChange={(v) => setLocal((p) => ({ ...p, min_confidence: v }))}
      />
      <ParamField
        label="Min Lift"
        value={local.min_lift}
        min={0} max={10} step={0.1}
        onChange={(v) => setLocal((p) => ({ ...p, min_lift: v }))}
      />

      <button
        onClick={apply}
        disabled={busy}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ink-900 dark:bg-leaf-500 text-mist-50 dark:text-ink-950 text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60 ml-auto"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        Run {ALGO_LABELS[algorithm]}
      </button>
    </div>
  )
}

function ParamField({ label, value, min, max, step, onChange }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[140px]">
      <label className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide flex justify-between">
        {label}
        <span className="font-mono-num text-ink-900 dark:text-mist-50 normal-case">{value}</span>
      </label>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="accent-leaf-500 h-1.5"
      />
    </div>
  )
}
