
import { useEffect, useMemo, useState } from 'react'

type Portfolio = {
  id: number | string
  clientId: string
  clientName: string | null
  name: string
  baseCurrency: string
  status: string
}

type Props = {
  token: string
}

export default function Portfolios({ token }: Props) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadPortfolios() {
      try {
        setLoading(true)
        setError('')

       const response = await fetch('http://localhost:3001/api/portfolios', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
  signal: controller.signal,
})
        if (!response.ok) {
          throw new Error(`Unable to load portfolios (${response.status})`)
        }

        const data = await response.json()
        setPortfolios(Array.isArray(data) ? data : data.data ?? [])
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadPortfolios()
    return () => controller.abort()
  }, [token])

  const statuses = useMemo(
    () => [...new Set(portfolios.map((p) => p.status).filter(Boolean))].sort(),
    [portfolios],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()

    return portfolios.filter((p) => {
      const matchesSearch =
        !term ||
        String(p.id).toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term) ||
        (p.clientId ?? '').toLowerCase().includes(term) ||
        (p.clientName ?? '').toLowerCase().includes(term)

      const matchesStatus =
        statusFilter === 'ALL' || p.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [portfolios, search, statusFilter])

  const activeCount = portfolios.filter(
    (p) => p.status?.toUpperCase() === 'ACTIVE',
  ).length

  return (
    <section className="main-panel">
      <header className="topbar">
        <div className="breadcrumbs">
          Workspace <span>/</span> <strong>Portfolios</strong>
        </div>
        <span className="connection-indicator">
          <span /> Portfolio overview
        </span>
      </header>

      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">INVESTMENT OPERATIONS</p>
            <h1>Portfolios</h1>
            <p className="page-description">
              Review client portfolios, base currencies and current statuses.
            </p>
          </div>
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <span className="stat-label">Total portfolios</span>
            <strong className="stat-value">{portfolios.length}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Active portfolios</span>
            <strong className="stat-value">{activeCount}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Currencies</span>
            <strong className="stat-value">
              {new Set(portfolios.map((p) => p.baseCurrency).filter(Boolean)).size}
            </strong>
          </article>
        </div>

        <div className="table-card">
          <div className="table-toolbar">
            <div>
              <h2>Portfolio directory</h2>
              <p>{filtered.length} portfolios shown</p>
            </div>

            <div className="filter-controls">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search portfolios or clients…"
                aria-label="Search portfolios"
              />

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="ALL">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="error-message" role="alert">
              {error}
              <button onClick={() => window.location.reload()}>Retry</button>
            </div>
          )}

          {loading ? (
            <div className="empty-state">Loading portfolios…</div>
          ) : !error && filtered.length === 0 ? (
            <div className="empty-state">
              <strong>No portfolios found</strong>
              <p>Try changing your search or status filter.</p>
            </div>
          ) : !error ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Portfolio</th>
                    <th>Client</th>
                    <th>Base currency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((portfolio) => (
                    <tr key={portfolio.id}>
                      <td>
                        <strong>{portfolio.name}</strong>
                        <small>Portfolio ID: {portfolio.id}</small>
                      </td>
                      <td>
                        <strong>{portfolio.clientName || '—'}</strong>
                        <small>Client ID: {portfolio.clientId || '—'}</small>
                      </td>
                      <td>{portfolio.baseCurrency || '—'}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            portfolio.status?.toUpperCase() === 'ACTIVE'
                              ? 'status-active'
                              : ''
                          }`}
                        >
                          {portfolio.status || 'Unknown'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
