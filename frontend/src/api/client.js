const BASE = (import.meta.env.VITE_API_BASE_URL || '') + '/api'

async function handle(res) {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch (e) {
      /* ignore parse errors */
    }
    const err = new Error(detail)
    err.status = res.status
    throw err
  }
  return res.json()
}

export const api = {
  health: () => fetch(`${BASE}/health`).then(handle),

  uploadDataset: (file) => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${BASE}/dataset/upload`, { method: 'POST', body: form }).then(handle)
  },

  loadSample: () => fetch(`${BASE}/dataset/sample`, { method: 'POST' }).then(handle),
  loadLargeSample: () => fetch(`${BASE}/dataset/large-sample`, { method: 'POST' }).then(handle),
  listDatasets: () => fetch(`${BASE}/datasets`).then(handle),
  activateDataset: (datasetId) => fetch(`${BASE}/datasets/${encodeURIComponent(datasetId)}/activate`, { method: 'POST' }).then(handle),
  getCurrentDataset: () => fetch(`${BASE}/dataset/current`).then(handle),

  getPreview: (n = 10) => fetch(`${BASE}/dataset/preview?n=${n}`).then(handle),

  preprocess: () => fetch(`${BASE}/preprocess`, { method: 'POST' }).then(handle),

  mine: ({ algorithm, min_support, min_confidence, min_lift }) =>
    fetch(`${BASE}/mine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ algorithm, min_support, min_confidence, min_lift }),
    }).then(handle),

  compare: ({ min_support, min_confidence, min_lift }) =>
    fetch(`${BASE}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ min_support, min_confidence, min_lift }),
    }).then(handle),

  getProducts: () => fetch(`${BASE}/products`).then(handle),
  getProductSales: (product) => fetch(`${BASE}/products/${encodeURIComponent(product)}/sales`).then(handle),

  getMarketing: (algorithm, topK = 40, selectedProducts = []) => {
    const qs = new URLSearchParams({ algorithm, top_k: String(topK) })
    selectedProducts.forEach((product) => qs.append('products', product))
    return fetch(`${BASE}/marketing?${qs.toString()}`).then(handle)
  },
  getFeedback: () => fetch(`${BASE}/feedback`).then(handle),

  exportUrl: (kind, algorithm, selectedProducts = []) => {
    const qs = new URLSearchParams({ algorithm })
    selectedProducts.forEach((product) => qs.append('products', product))
    if (kind === 'cleaned') return `${BASE}/export/cleaned`
    if (kind === 'business-report') return `${BASE}/export/business-report?${qs.toString()}`
    if (kind === 'analytics-package') return `${BASE}/export/analytics-package?${qs.toString()}`
    return `${BASE}/export/${kind}?${qs.toString()}`
  },
}
