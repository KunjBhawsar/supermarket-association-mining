import { NavLink } from 'react-router-dom'
import {
  UploadCloud, LayoutDashboard, Layers, GitBranch, BarChart3,
  Search, ArrowLeftRight, Megaphone, ShoppingBasket,
} from 'lucide-react'
import { useData } from '../context/DataContext'

const NAV = [
  { to: '/', label: 'Upload', icon: UploadCloud, always: true },
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/itemsets', label: 'Frequent Itemsets', icon: Layers },
  { to: '/rules', label: 'Rule Explorer', icon: Search },
  { to: '/products', label: 'Product Explorer', icon: ShoppingBasket },
  { to: '/compare', label: 'Algorithm Comparison', icon: ArrowLeftRight },
  { to: '/visualizations', label: 'Visualizations', icon: BarChart3 },
  { to: '/marketing', label: 'Marketing Insights', icon: Megaphone },
]

export default function Sidebar() {
  const { hasData, isPreprocessed } = useData()

  return (
    <aside className="fixed left-0 top-0 h-full w-64 shrink-0 border-r border-ink-200/60 dark:border-ink-700/60 bg-mist-50 dark:bg-ink-950 flex flex-col">
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-ink-200/60 dark:border-ink-700/60">
        <div className="w-8 h-8 rounded-md bg-leaf-500 flex items-center justify-center">
          <GitBranch size={17} className="text-ink-950" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-ink-900 dark:text-mist-50 tracking-tight">BasketLens</p>
          <p className="text-[11px] text-ink-400">Association Rule Mining</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, always }) => {
          const disabled = !always && (to === '/overview' || to === '/itemsets' || to === '/rules' ||
            to === '/products' || to === '/compare' || to === '/visualizations' || to === '/marketing') && !isPreprocessed
          return (
            <NavLink
              key={to}
              to={disabled ? '#' : to}
              onClick={(e) => disabled && e.preventDefault()}
              className={({ isActive }) => [
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                disabled
                  ? 'text-ink-400/50 cursor-not-allowed'
                  : isActive
                    ? 'bg-leaf-500/15 text-leaf-600 dark:text-leaf-400 font-semibold'
                    : 'text-ink-600 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800',
              ].join(' ')}
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </NavLink>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-ink-200/60 dark:border-ink-700/60">
        <p className="text-[11px] text-ink-400 leading-relaxed">
          DWM Mini Project — Apriori · FP-Growth · FP-Max
        </p>
      </div>
    </aside>
  )
}
