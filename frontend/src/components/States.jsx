import { Loader2, AlertTriangle, Inbox, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'

export function LoadingState({ label = 'Crunching the numbers…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-ink-400 gap-3 animate-fade-up">
      <Loader2 size={26} className="animate-spin text-leaf-500" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-center animate-fade-up">
      <div className="w-11 h-11 rounded-full bg-coral-500/10 flex items-center justify-center">
        <AlertTriangle size={20} className="text-coral-500" />
      </div>
      <p className="text-sm font-semibold text-ink-900 dark:text-mist-50">Something went wrong</p>
      <p className="text-xs text-ink-400 max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink-900 dark:bg-mist-50 text-mist-50 dark:text-ink-900"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-center animate-fade-up">
      <div className="w-11 h-11 rounded-full bg-ink-100 dark:bg-ink-800 flex items-center justify-center">
        <Icon size={20} className="text-ink-400" />
      </div>
      <p className="text-sm font-semibold text-ink-900 dark:text-mist-50">{title}</p>
      {description && <p className="text-xs text-ink-400 max-w-sm">{description}</p>}
      {action}
    </div>
  )
}

export function LockedState({ description = 'Upload and preprocess a dataset first.' }) {
  return (
    <EmptyState
      icon={Lock}
      title="No data loaded yet"
      description={description}
      action={
        <Link to="/" className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-leaf-500 text-ink-950">
          Go to Upload
        </Link>
      }
    />
  )
}
