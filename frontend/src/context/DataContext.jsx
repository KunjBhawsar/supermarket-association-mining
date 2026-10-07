import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { api } from '../api/client'

const DataContext = createContext(null)

const DEFAULT_PARAMS = { min_support: 0.02, min_confidence: 0.3, min_lift: 1.0 }

export function DataProvider({ children }) {
  const [datasetInfo, setDatasetInfo] = useState(null) // {filename, preview}
  const [preprocessSummary, setPreprocessSummary] = useState(null)
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [algorithm, setAlgorithm] = useState('apriori')
  const [results, setResults] = useState({}) // algorithm -> mine response
  const [comparison, setComparison] = useState(null)
  const [products, setProducts] = useState(null)
  const [marketing, setMarketing] = useState({})
  const [feedback, setFeedback] = useState(null)
  const [savedDatasets, setSavedDatasets] = useState([])
  const [savedDatasetsLoaded, setSavedDatasetsLoaded] = useState(false)
  const [savedDatasetsError, setSavedDatasetsError] = useState(null)

  const [loading, setLoading] = useState({})
  const [error, setError] = useState(null)

  const setLoadingKey = (key, val) => setLoading((p) => ({ ...p, [key]: val }))

  const resetAfterNewData = () => {
    setPreprocessSummary(null)
    setResults({})
    setComparison(null)
    setProducts(null)
    setMarketing({})
    setFeedback(null)
  }

  const refreshSavedDatasets = useCallback(async () => {
    try {
      const res = await api.listDatasets()
      setSavedDatasets(res.datasets || [])
      setSavedDatasetsError(null)
      return res
    } catch (e) {
      setSavedDatasetsError('Saved datasets are unavailable. Restart the project using RUN_PROJECT.bat.')
      throw e
    } finally {
      setSavedDatasetsLoaded(true)
    }
  }, [])

  useEffect(() => {
    // The backend restores the last active upload after a restart. This makes
    // the upload page reflect it instead of looking empty.
    api.getCurrentDataset()
      .then((res) => {
        if (res.dataset) {
          setDatasetInfo(res.dataset)
          setPreprocessSummary(res.dataset.preprocess_summary || null)
        }
      })
      .catch(() => {})
    refreshSavedDatasets().catch(() => {})
  }, [refreshSavedDatasets])

  useEffect(() => {
    if (!savedDatasetsError) return undefined
    // A launcher may be restarting an older backend. Recover automatically
    // when its saved-dataset API becomes available instead of requiring a
    // browser refresh.
    const retryId = window.setInterval(() => {
      api.getCurrentDataset()
        .then((res) => {
          if (res.dataset) {
            setDatasetInfo(res.dataset)
            setPreprocessSummary(res.dataset.preprocess_summary || null)
          }
        })
        .catch(() => {})
      refreshSavedDatasets().catch(() => {})
    }, 2000)
    return () => window.clearInterval(retryId)
  }, [savedDatasetsError, refreshSavedDatasets])

  const uploadFile = useCallback(async (file) => {
    setError(null)
    setLoadingKey('upload', true)
    try {
      const res = await api.uploadDataset(file)
      setDatasetInfo(res)
      resetAfterNewData()
      refreshSavedDatasets().catch(() => {})
      return res
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoadingKey('upload', false)
    }
  }, [])

  const loadLargeSample = useCallback(async () => {
    setError(null)
    setLoadingKey('upload', true)
    try {
      const res = await api.loadLargeSample()
      setDatasetInfo(res)
      resetAfterNewData()
      refreshSavedDatasets().catch(() => {})
      return res
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoadingKey('upload', false)
    }
  }, [])

  const loadSample = useCallback(async () => {
    setError(null)
    setLoadingKey('upload', true)
    try {
      const res = await api.loadSample()
      setDatasetInfo(res)
      resetAfterNewData()
      refreshSavedDatasets().catch(() => {})
      return res
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoadingKey('upload', false)
    }
  }, [])

  const activateSavedDataset = useCallback(async (datasetId) => {
    setError(null)
    setLoadingKey('activate-dataset', true)
    try {
      const res = await api.activateDataset(datasetId)
      setDatasetInfo(res)
      resetAfterNewData()
      setPreprocessSummary(res.preprocess_summary || null)
      await refreshSavedDatasets()
      return res
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoadingKey('activate-dataset', false)
    }
  }, [refreshSavedDatasets])

  const runPreprocess = useCallback(async () => {
    setError(null)
    setLoadingKey('preprocess', true)
    try {
      const res = await api.preprocess()
      setPreprocessSummary(res)
      setResults({})
      setComparison(null)
      return res
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoadingKey('preprocess', false)
    }
  }, [])

  const runMine = useCallback(async (algo, overrideParams) => {
    setError(null)
    const p = overrideParams || params
    setLoadingKey(`mine-${algo}`, true)
    try {
      const res = await api.mine({ algorithm: algo, ...p })
      setResults((prev) => ({ ...prev, [algo]: res }))
      return res
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoadingKey(`mine-${algo}`, false)
    }
  }, [params])

  const runCompare = useCallback(async (overrideParams) => {
    setError(null)
    const p = overrideParams || params
    setLoadingKey('compare', true)
    try {
      const res = await api.compare(p)
      setComparison(res)
      return res
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoadingKey('compare', false)
    }
  }, [params])

  const loadProducts = useCallback(async () => {
    setLoadingKey('products', true)
    try {
      const res = await api.getProducts()
      setProducts(res)
      return res
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingKey('products', false)
    }
  }, [])

  const loadMarketing = useCallback(async (algo, topK = 40, selectedProducts = []) => {
    setLoadingKey('marketing', true)
    try {
      const res = await api.getMarketing(algo, topK, selectedProducts)
      setMarketing((prev) => ({ ...prev, [algo]: res }))
      return res
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingKey('marketing', false)
    }
  }, [])

  const loadFeedback = useCallback(async () => {
    setLoadingKey('feedback', true)
    try {
      const res = await api.getFeedback()
      setFeedback(res)
      return res
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingKey('feedback', false)
    }
  }, [])

  const value = useMemo(() => ({
    datasetInfo, preprocessSummary, params, setParams, algorithm, setAlgorithm,
    results, comparison, products, marketing, feedback, savedDatasets, savedDatasetsLoaded, savedDatasetsError,
    loading, error, setError,
    uploadFile, loadSample, loadLargeSample, activateSavedDataset, runPreprocess, runMine, runCompare,
    loadProducts, loadMarketing, loadFeedback,
    hasData: !!datasetInfo,
    isPreprocessed: !!preprocessSummary,
  }), [datasetInfo, preprocessSummary, params, algorithm, results, comparison,
      products, marketing, feedback, savedDatasets, savedDatasetsLoaded, savedDatasetsError, loading, error,
      uploadFile, loadSample, loadLargeSample, activateSavedDataset, runPreprocess, runMine, runCompare,
      loadProducts, loadMarketing, loadFeedback])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
