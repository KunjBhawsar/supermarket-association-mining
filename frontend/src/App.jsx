import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import UploadPage from './pages/UploadPage'
import OverviewPage from './pages/OverviewPage'
import ItemsetsPage from './pages/ItemsetsPage'
import RulesExplorerPage from './pages/RulesExplorerPage'
import ProductExplorerPage from './pages/ProductExplorerPage'
import ComparisonPage from './pages/ComparisonPage'
import MarketingPage from './pages/MarketingPage'
import VisualizationsPage from './pages/VisualizationsPage'

const TITLES = {
  '/': ['Upload dataset', 'Start by loading a supermarket transaction CSV'],
  '/overview': ['Overview', 'Key stats and live mining snapshot'],
  '/itemsets': ['Frequent Itemsets', 'Item combinations that clear the support threshold'],
  '/rules': ['Rule Explorer', 'Search, filter and inspect every mined association rule'],
  '/products': ['Product Explorer', 'Per-product frequency and related rules'],
  '/compare': ['Algorithm Comparison', 'Apriori vs FP-Growth vs FP-Max, head to head'],
  '/visualizations': ['Visualizations', 'Product, transaction, rule-metric and algorithm comparison charts'],
  '/marketing': ['Marketing Insights', 'Rules converted into concrete retail actions'],
}

function Shell() {
  const location = useLocation()
  const [title, subtitle] = TITLES[location.pathname] || ['BasketLens', '']

  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])

  return (
    <div className="min-h-screen bg-mist-100 dark:bg-ink-900">
      <Sidebar />
      <div className="pl-64 flex flex-col min-h-screen">
        <TopBar title={title} subtitle={subtitle} />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/itemsets" element={<ItemsetsPage />} />
            <Route path="/rules" element={<RulesExplorerPage />} />
            <Route path="/products" element={<ProductExplorerPage />} />
            <Route path="/compare" element={<ComparisonPage />} />
            <Route path="/visualizations" element={<VisualizationsPage />} />
            <Route path="/marketing" element={<MarketingPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
