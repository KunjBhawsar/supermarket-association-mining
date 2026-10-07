export default function KpiCard({ label, value, sub, icon: Icon, accent = 'leaf' }) {
  const accents = {
    leaf: 'bg-leaf-500/12 text-leaf-600 dark:text-leaf-400',
    amber: 'bg-amber-500/12 text-amber-500',
    plum: 'bg-plum-500/12 text-plum-500',
    coral: 'bg-coral-500/12 text-coral-500',
  }
  return (
    <div className="rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-400 uppercase tracking-wide">{label}</span>
        {Icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accents[accent]}`}>
            <Icon size={15} />
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold font-mono-num text-ink-900 dark:text-mist-50">{value}</p>
        {sub && <p className="text-xs text-ink-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}
