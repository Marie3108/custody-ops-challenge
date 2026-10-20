
import { useEffect, useState } from 'react'

type Transaction = {
  id: string
  externalRef: string
  clientId: string
  clientName: string
  portfolioId: string
  isin: string
  instrumentName: string
  type: 'BUY' | 'SELL' | 'TRANSFER_IN' | 'TRANSFER_OUT'
  tradeDate: string
  settlementDate: string
  quantity: number
  price: number | null
  currency: string
  status: 'PENDING' | 'SETTLED' | 'CANCELLED' | 'FAILED'
}

type TransactionsResponse = {
  data: Transaction[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

const API_URL = 'http://localhost:3001/api/transactions'
const PAGE_SIZE = 10


type TransactionsProps = {
  token: string
  userRole: 'ADMIN' | 'OPERATOR' | 'VIEWER'
}

export default function Transactions({ token, userRole }: TransactionsProps) {
    
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  async function loadTransactions(signal?: AbortSignal) {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sortBy: 'tradeDate',
        sortOrder: 'desc',
      })

      if (search.trim()) params.set('search', search.trim())
      if (status) params.set('status', status)
      if (type) params.set('type', type)

      //const response = await fetch(`${API_URL}?${params}`, { signal })
      const response = await fetch(`${API_URL}?${params}`, {
  signal,
  headers: {
    Authorization: `Bearer ${token}`,
  },
})

      if (!response.ok) {
        throw new Error(`Server error (${response.status})`)
      }

      const result: TransactionsResponse = await response.json()
      setTransactions(result.data)
      setTotal(result.pagination.total)
      setTotalPages(result.pagination.totalPages)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Unable to load transactions.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void loadTransactions(controller.signal)
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [page, search, status, type])

  function resetFilters() {
    setSearch('')
    setStatus('')
    setType('')
    setPage(1)
    setSelectedIds([])
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    )
  }

  function togglePageSelection() {
    const pendingIds = transactions
      .filter((transaction) => transaction.status === 'PENDING')
      .map((transaction) => transaction.id)

    const allSelected =
      pendingIds.length > 0 &&
      pendingIds.every((id) => selectedIds.includes(id))

    setSelectedIds((current) =>
      allSelected
        ? current.filter((id) => !pendingIds.includes(id))
        : [...new Set([...current, ...pendingIds])],
    )
  }

  async function bulkAction(action: 'approve' | 'cancel') {
    if (selectedIds.length === 0) return

    const confirmed = window.confirm(
      `Confirm ${action === 'approve' ? 'approval' : 'cancellation'} of ${selectedIds.length} selected transaction(s)?`,
    )

    if (!confirmed) return

    setActionLoading(true)
    setActionMessage('')
    setError('')

    try {
     const response = await fetch('http://localhost:3001/api/transactions/bulk-status', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ ids: selectedIds, action }),
})

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || `Server error (${response.status})`)
      }

      setActionMessage(
        `Processed ${result.processed}: ${result.succeeded} succeeded, ${result.failed} failed.`,
      )
      setSelectedIds([])
      await loadTransactions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk action failed.')
    } finally {
      setActionLoading(false)
    }
  }

  const pendingOnPage = transactions.filter(
    (transaction) => transaction.status === 'PENDING',
  )
  const allPendingSelected =
    pendingOnPage.length > 0 &&
    pendingOnPage.every((transaction) => selectedIds.includes(transaction.id))

  return (
    <section className="page-content transactions-page">
   
<div className="page-heading">
  <div>
    <p className="eyebrow">OPERATIONS</p>
    <h1>Transactions</h1>
    <p className="subtitle">
      Search, review and process transaction records.
    </p>
  </div>

  <div style={{ display: 'flex', gap: '8px' }}>
    <button
      className="secondary-button"
      type="button"
      onClick={() => void loadTransactions()}
      disabled={loading}
    >
      ↻ Refresh
    </button>

    <button
      className="secondary-button"
      type="button"
      onClick={async () => {
        try {
          const params = new URLSearchParams()

          if (search.trim()) params.set('search', search.trim())
          if (status) params.set('status', status)
          if (type) params.set('type', type)

          params.set('sortBy', 'tradeDate')
          params.set('sortOrder', 'desc')

          const response = await fetch(
            `http://localhost:3001/api/transactions/export?${params.toString()}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )

          if (!response.ok) {
            throw new Error('Export failed')
          }

          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')

          link.href = url
          link.download = 'transactions.csv'
          document.body.appendChild(link)
          link.click()
          link.remove()
          URL.revokeObjectURL(url)
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Export failed'
          )
        }
      }}
    >
      Export CSV
    </button>
  </div>
</div>


      <section className="stats-grid" aria-label="Transaction overview">
        <article className="stat-card">
          <div className="stat-top"><span>Total matching</span></div>
          <strong>{total.toLocaleString()}</strong>
          <span className="stat-caption">Transactions matching filters</span>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span>Current page</span></div>
          <strong>{page}{totalPages ? ` / ${totalPages}` : ''}</strong>
          <span className="stat-caption">Paginated results</span>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span>Pending on page</span></div>
          <strong>{pendingOnPage.length}</strong>
          <span className="stat-caption">Eligible for bulk action</span>
        </article>
      </section>

      <section className="table-card">
        <div className="table-heading">
          <div>
            <h2>Transaction register</h2>
            <p>Select pending transactions to approve or cancel.</p>
          </div>
          <span className="record-count">{total.toLocaleString()} records</span>
        </div>

        <div className="filters">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="Search ID, reference, client ID or ISIN..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
                setSelectedIds([])
              }}
              aria-label="Search transactions"
            />
          </label>

          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
              setSelectedIds([])
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="SETTLED">Settled</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="FAILED">Failed</option>
          </select>

          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value)
              setPage(1)
              setSelectedIds([])
            }}
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
            <option value="TRANSFER_IN">Transfer in</option>
            <option value="TRANSFER_OUT">Transfer out</option>
          </select>

          <button className="reset-button" type="button" onClick={resetFilters}>
            Reset
          </button>
        </div>

       {selectedIds.length > 0 && userRole !== 'VIEWER' && (
  <div className="filters">
    
            <span>{selectedIds.length} selected</span>
            <button
              className="secondary-button"
              type="button"
              disabled={actionLoading}
              onClick={() => void bulkAction('approve')}
            >
              Approve
            </button>
            <button
              className="reset-button"
              type="button"
              disabled={actionLoading}
              onClick={() => void bulkAction('cancel')}
            >
              Cancel
            </button>
          </div>
        )}

        {actionMessage && <p role="status">{actionMessage}</p>}

        {error && (
          <div className="error-state" role="alert">
            <strong>Unable to load or process transactions</strong>
            <span>{error}</span>
            <button type="button" onClick={() => void loadTransactions()}>
              Retry
            </button>
          </div>
        )}

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select pending transactions on this page"
                    checked={allPendingSelected}
                    onChange={togglePageSelection}
                    disabled={pendingOnPage.length === 0}
                  />
                </th>
                <th>ID</th>
                <th>CLIENT</th>
                <th>INSTRUMENT</th>
                <th>TYPE</th>
                <th>TRADE DATE</th>
                <th>QUANTITY</th>
                <th>PRICE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="table-message">Loading transactions...</td></tr>
              ) : error ? null : transactions.length === 0 ? (
                <tr><td colSpan={9} className="table-message">No transactions found.</td></tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${transaction.id}`}
                        checked={selectedIds.includes(transaction.id)}
                        disabled={transaction.status !== 'PENDING' || actionLoading}
                        onChange={() => toggleSelection(transaction.id)}
                      />
                    </td>
                    <td>{transaction.id}</td>
                    <td>
                      <strong>{transaction.clientName}</strong>
                      <br />
                      <small>{transaction.clientId}</small>
                    </td>
                    <td>
                      <strong>{transaction.instrumentName}</strong>
                      <br />
                      <small>{transaction.isin}</small>
                    </td>
                    <td>{transaction.type}</td>
                    <td>{new Date(transaction.tradeDate).toLocaleDateString()}</td>
                    <td>{transaction.quantity.toLocaleString()}</td>
                    <td>
                      {transaction.price == null
                        ? '—'
                        : `${transaction.price.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          })} ${transaction.currency}`}
                    </td>
                    <td>
                      <span className={`status-badge ${transaction.status.toLowerCase()}`}>
                        <span />
                        {transaction.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="pagination">
          <span>
            {total === 0
              ? 'No results'
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()} transactions`}
          </span>
          <div className="pagination-controls">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => {
                setPage((current) => current - 1)
                setSelectedIds([])
              }}
            >
              ← Previous
            </button>
            <span className="page-number">{page}</span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => {
                setPage((current) => current + 1)
                setSelectedIds([])
              }}
            >
              Next →
            </button>
          </div>
        </footer>
      </section>
    </section>
  )
}
