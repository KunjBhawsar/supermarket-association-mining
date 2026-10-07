import { Sun, Moon, Database, CheckCircle2 } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useData } from '../context/DataContext'

export default function TopBar({ title, subtitle }) {
  const { theme, toggle } = useTheme()
  const { datasetInfo, isPreprocessed, preprocessSummary } = useData()

  return (
    <header className="h-16 shrink-0 border-b border-ink-200/60 dark:border-ink-700/60 bg-mist-50/80 dark:bg-ink-950/80 backdrop-blur sticky top-0 z-20 flex items-center justify-between px-6">
      <div>
        <h1 className="text-[15px] font-bold text-ink-900 dark:text-mist-50 leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-ink-400 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {datasetInfo && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-200">
            {isPreprocessed ? (
              <CheckCircle2 size={13} className="text-leaf-500" />
            ) : (
              <Database size={13} />
            )}
            <span className="font-medium whitespace-nowrap">{datasetInfo.filename}</span>
            {isPreprocessed && (
              <span className="font-mono-num text-ink-400">· {preprocessSummary.num_transactions} txns</span>
            )}
          </div>
        )}
        <button
          onClick={toggle}
          aria-label="Toggle color theme"
          className="w-9 h-9 rounded-lg flex items-center justify-center border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  )
}
