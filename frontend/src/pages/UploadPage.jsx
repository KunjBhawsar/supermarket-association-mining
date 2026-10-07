import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, FileSpreadsheet, Sparkles, ArrowRight, ShoppingBasket, History, Check } from 'lucide-react'
import { useData } from '../context/DataContext'
import { LoadingState, ErrorState } from '../components/States'

export default function UploadPage() {
  const { datasetInfo, savedDatasets, savedDatasetsLoaded, savedDatasetsError, uploadFile, loadSample, loadLargeSample, activateSavedDataset, runPreprocess, preprocessSummary, loading, error, setError } = useData()
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const onFiles = useCallback(async (files) => {
    if (!files || !files.length) return
    try {
      await uploadFile(files[0])
    } catch (e) { /* surfaced via context error */ }
  }, [uploadFile])

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    onFiles(e.dataTransfer.files)
  }

  const handlePreprocess = async () => {
    try {
      await runPreprocess()
      navigate('/overview')
    } catch (e) { /* handled */ }
  }

  const openSavedDataset = async (datasetId) => {
    try {
      await activateSavedDataset(datasetId)
    } catch (e) { /* surfaced via context error */ }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-14">
      <div className="mb-10 animate-fade-up">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-leaf-600 dark:text-leaf-400 bg-leaf-500/10 px-3 py-1 rounded-full mb-5">
          <Sparkles size={13} /> Data Warehousing &amp; Mining Project
        </div>
        <h1 className="text-3xl font-extrabold text-ink-900 dark:text-mist-50 tracking-tight leading-tight">
          Find the products your customers already buy together.
        </h1>
        <p className="text-sm text-ink-400 mt-3 max-w-xl leading-relaxed">
          Upload a supermarket transaction log and BasketLens mines frequent itemsets and
          association rules with Apriori, FP-Growth and FP-Max — then turns the strongest
          rules into concrete cross-sell, bundling and shelf-placement moves.
        </p>
      </div>

      {error && <div className="mb-6"><ErrorState message={error} onRetry={() => setError(null)} /></div>}

      {loading.upload ? (
        <LoadingState label="Reading your CSV…" />
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-leaf-500 bg-leaf-500/5'
              : 'border-ink-200 dark:border-ink-700 hover:border-ink-300 dark:hover:border-ink-600 bg-white dark:bg-ink-850'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <div className="w-12 h-12 rounded-xl bg-ink-100 dark:bg-ink-800 flex items-center justify-center mx-auto mb-4">
            <UploadCloud size={22} className="text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900 dark:text-mist-50">
            Drop your transaction CSV here, or click to browse
          </p>
          <p className="text-xs text-ink-400 mt-1.5">
            Supports TransactionID + Items/Product (Date, CustomerID, Quantity optional)
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 my-6">
        <div className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
        <span className="text-xs text-ink-400">or</span>
        <div className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
      </div>

      <button
        onClick={() => loadSample().catch(() => {})}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-850 py-4 text-sm font-semibold text-ink-900 dark:text-mist-50 hover:border-leaf-500/60 transition-colors"
      >
        <ShoppingBasket size={16} className="text-leaf-500" />
        Use Preloaded 1500 Supermarket Transactions Dataset
      </button>

      <button
        onClick={() => loadLargeSample().catch(() => {})}
        className="w-full mt-3 flex items-center justify-center gap-2 rounded-2xl border border-leaf-500/40 bg-leaf-500/5 py-4 text-sm font-semibold text-ink-900 dark:text-mist-50 hover:border-leaf-500 transition-colors"
      >
        <FileSpreadsheet size={16} className="text-leaf-500" />
        Use Preloaded 1,00,000 Supermarket Transactions Dataset
      </button>

      <section className="mt-8 rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-ink-200/60 dark:border-ink-700/60">
          <History size={16} className="text-leaf-500" />
          <div>
            <p className="text-sm font-semibold text-ink-900 dark:text-mist-50">Saved datasets</p>
            <p className="text-xs text-ink-400">Stored locally on this computer and kept after closing the project.</p>
          </div>
        </div>
        {savedDatasetsError ? (
          <p className="px-5 py-4 text-xs text-rose-600 dark:text-rose-300">{savedDatasetsError}</p>
        ) : !savedDatasetsLoaded ? (
          <p className="px-5 py-4 text-xs text-ink-400">Checking saved datasets…</p>
        ) : savedDatasets.length === 0 ? (
          <p className="px-5 py-4 text-xs text-ink-400">No saved datasets yet. Upload a CSV or choose a sample above; it will appear here.</p>
        ) : (
          <div className="divide-y divide-ink-100 dark:divide-ink-800 max-h-56 overflow-y-auto">
            {savedDatasets.map((saved) => {
              const isActive = datasetInfo?.dataset_id === saved.dataset_id
              return (
                <div key={saved.dataset_id} className="flex items-center gap-3 px-5 py-3">
                  <FileSpreadsheet size={15} className="text-ink-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-ink-800 dark:text-mist-100 truncate">{saved.filename}</p>
                    <p className="text-[11px] text-ink-400">
                      Saved {new Date(saved.created_at).toLocaleString()} {saved.preprocessed ? '· Cleaned and ready' : '· Needs cleaning'}
                    </p>
                  </div>
                  <button
                    onClick={() => openSavedDataset(saved.dataset_id)}
                    disabled={isActive || loading['activate-dataset']}
                    className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-mist-200 hover:border-leaf-500 disabled:opacity-60"
                  >
                    {isActive ? <span className="inline-flex items-center gap-1"><Check size={13} /> Open</span> : 'Open'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {datasetInfo && (
        <div className="mt-10 rounded-2xl border border-ink-200/60 dark:border-ink-700/60 bg-white dark:bg-ink-850 overflow-hidden animate-fade-up">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/60 dark:border-ink-700/60">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet size={16} className="text-leaf-500" />
              <div>
                <p className="text-sm font-semibold text-ink-900 dark:text-mist-50">{datasetInfo.filename}</p>
                <p className="text-xs text-ink-400">{datasetInfo.preview.total_rows.toLocaleString()} rows · {datasetInfo.preview.columns.length} columns</p>
              </div>
            </div>
            <button
              onClick={handlePreprocess}
              disabled={loading.preprocess}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-leaf-500 text-ink-950 hover:opacity-90 disabled:opacity-60"
            >
              {loading.preprocess ? 'Cleaning…' : 'Clean & continue'} <ArrowRight size={14} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-ink-50 dark:bg-ink-800/60 text-ink-400 text-left">
                  {datasetInfo.preview.columns.map((c) => (
                    <th key={c} className="px-4 py-2 font-semibold whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datasetInfo.preview.rows.slice(0, 8).map((row, i) => (
                  <tr key={i} className="border-t border-ink-100 dark:border-ink-800">
                    {datasetInfo.preview.columns.map((c) => (
                      <td key={c} className="px-4 py-2 text-ink-600 dark:text-ink-200 whitespace-nowrap font-mono-num">{String(row[c] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preprocessSummary && (
        <div className="mt-4 text-center">
          <button onClick={() => navigate('/overview')} className="text-xs font-semibold text-leaf-600 dark:text-leaf-400 hover:underline">
            Already preprocessed — go to dashboard →
          </button>
        </div>
      )}
    </div>
  )
}
