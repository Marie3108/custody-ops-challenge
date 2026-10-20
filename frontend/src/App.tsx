
import { useEffect, useState } from 'react'
import './App.css'
import Transactions from './components/Transactions'
import Login from './components/Login'
import Billing from './components/Billing'
import Portfolios from './components/Portfolios'


type Client = {
  id: string
  name: string
  type: 'RETAIL' | 'INSTITUTIONAL'
  country: string
  kycStatus: 'APPROVED' | 'PENDING' | 'EXPIRED' | 'REJECTED'
  email?: string
  phone?: string
  relationshipManagerId?: number | null
  onboardedOn?: string
  version?: number
}

type ClientsResponse = {
  data: Client[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

const API_URL = 'http://localhost:3001/api/clients'

  type AuthUser = {
  id: number
  email: string
  name: string
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER'
}

function App() {
  const [activeSection, setActiveSection] = useState<
  'clients' | 'transactions' | 'portfolios' | 'billing'
  >('clients')



const [token, setToken] = useState<string | null>(null)
const [user, setUser] = useState<AuthUser | null>(null)

  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [kycStatus, setKycStatus] = useState('')
  const [clientType, setClientType] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedClient, setSelectedClient] =
    useState<Client | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        })

        if (search.trim()) {
          params.set('search', search.trim())
        }

        if (kycStatus) {
          params.set('kycStatus', kycStatus)
        }

        if (clientType) {
          params.set('type', clientType)
        }

        const response = await fetch(
  `${API_URL}?${params.toString()}`,
  {
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
)

        if (!response.ok) {
          throw new Error(`Server error (${response.status})`)
        }

        const result: ClientsResponse = await response.json()

        setClients(result.data)
        setTotal(result.pagination.total)
        setTotalPages(result.pagination.totalPages)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load clients.',
        )
        setClients([])
        setTotal(0)
        setTotalPages(0)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
 }, [page, pageSize, search, kycStatus, clientType, token])

  useEffect(() => {
    if (!selectedClient) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedClient(null)
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [selectedClient])

  function resetFilters() {
    setSearch('')
    setKycStatus('')
    setClientType('')
    setPage(1)
  }

  function changeSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function changeKyc(value: string) {
    setKycStatus(value)
    setPage(1)
  }

  function changeType(value: string) {
    setClientType(value)
    setPage(1)
  }
function navigateTo(
  section: 'clients' | 'transactions' | 'portfolios' | 'billing'
) {
  setActiveSection(section)
  setSelectedClient(null)
}
if (!token || !user) {
  return (
    <Login
      onLogin={(newToken, loggedInUser) => {
        setToken(newToken)
        setUser(loggedInUser)
      }}
    />
  )
}

  return (


    
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">V</div>
          <div>
            <strong>Vellum</strong>
            <span>Fund Services</span>
          </div>
        </div>

        <p className="nav-label">WORKSPACE</p>

        <nav className="navigation">
          <a
            className={`nav-item ${
              activeSection === 'clients' ? 'active' : ''
            }`}
            href="#clients"
            onClick={() => navigateTo('clients')}
          >
            <span className="nav-icon">▦</span>
            Clients
          </a>

<a
  className={`nav-item ${
    activeSection === 'portfolios' ? 'active' : ''
  }`}
  href="#portfolios"
  onClick={() => navigateTo('portfolios')}
>
  <span className="nav-icon">◫</span>
  Portfolios
</a>

<a
  className={`nav-item ${
    activeSection === 'transactions' ? 'active' : ''
  }`}
  href="#transactions"
  onClick={() => navigateTo('transactions')}
>
  <span className="nav-icon">⇄</span>
  Transactions
</a>

<a
  className={`nav-item ${
    activeSection === 'billing' ? 'active' : ''
  }`}
  href="#billing"
  onClick={() => navigateTo('billing')}
>
  <span className="nav-icon">▤</span>
  Billing
</a>
</nav>


        <div className="sidebar-bottom">
          <div className="environment-dot" />
          <div>
            <strong>Development</strong>
            <span>Custody Ops Console</span>
          </div>
        </div>
      </aside>

      {/* CLIENTS PAGE */}
      <section
        className="main-panel"
        id="clients"
        style={{
          display: activeSection === 'clients' ? 'block' : 'none',
        }}
      >
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span> <strong>Clients</strong>
          </div>

          <div className="topbar-right">
  <span className="connection-indicator">
    <span /> System workspace
  </span>

  <div className="user-info">
    <div>
      <strong>{user.name}</strong>
      <span>{user.role}</span>
    </div>
    <div className="avatar">
      {user.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()}
    </div>
  </div>
</div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">CLIENT OPERATIONS</p>
              <h1>Clients</h1>
              <p className="subtitle">
                Manage client records and monitor KYC status.
              </p>
            </div>

            <button
              className="secondary-button"
              type="button"
              onClick={() => setPage(1)}
            >
              ↻ Refresh
            </button>
          </div>

          <section className="stats-grid" aria-label="Client overview">
            <article className="stat-card">
              <div className="stat-top">
                <span>Total clients</span>
                <span className="stat-icon blue">▦</span>
              </div>
              <strong>
                {loading && total === 0
                  ? '—'
                  : total.toLocaleString()}
              </strong>
              <span className="stat-caption">
                Matching current filters
              </span>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Current page</span>
                <span className="stat-icon purple">≡</span>
              </div>
              <strong>
                {page}
                {totalPages > 0 ? ` / ${totalPages}` : ''}
              </strong>
              <span className="stat-caption">
                Paginated results
              </span>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Records displayed</span>
                <span className="stat-icon green">✓</span>
              </div>
              <strong>{clients.length}</strong>
              <span className="stat-caption">
                Clients on this page
              </span>
            </article>
          </section>

          <section className="table-card">
            <div className="table-heading">
              <div>
                <h2>Client directory</h2>
                <p>
                  Click a client row to view its details.
                </p>
              </div>

              <span className="record-count">
                {total.toLocaleString()} records
              </span>
            </div>

            <div className="filters">
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  placeholder="Search name, ID or email..."
                  value={search}
                  onChange={(event) =>
                    changeSearch(event.target.value)
                  }
                  aria-label="Search clients"
                />
              </label>

              <select
                value={kycStatus}
                onChange={(event) =>
                  changeKyc(event.target.value)
                }
                aria-label="Filter by KYC status"
              >
                <option value="">All KYC statuses</option>
                <option value="APPROVED">Approved</option>
                <option value="PENDING">Pending</option>
                <option value="EXPIRED">Expired</option>
                <option value="REJECTED">Rejected</option>
              </select>

              <select
                value={clientType}
                onChange={(event) =>
                  changeType(event.target.value)
                }
                aria-label="Filter by client type"
              >
                <option value="">All client types</option>
                <option value="RETAIL">Retail</option>
                <option value="INSTITUTIONAL">
                  Institutional
                </option>
              </select>

              <button
                className="reset-button"
                type="button"
                onClick={resetFilters}
              >
                Reset
              </button>
            </div>

            {error && (
              <div className="error-state" role="alert">
                <strong>Unable to load clients</strong>
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setPage(1)}
                >
                  Retry
                </button>
              </div>
            )}

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>CLIENT</th>
                    <th>CLIENT ID</th>
                    <th>TYPE</th>
                    <th>COUNTRY</th>
                    <th>KYC STATUS</th>
                    <th>RELATIONSHIP MANAGER</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="table-message">
                        <span className="spinner" />
                        Loading client records...
                      </td>
                    </tr>
                  ) : error ? null : clients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="table-message">
                        No clients match your search.
                      </td>
                    </tr>
                  ) : (
                    clients.map((client) => (
                      <tr
                        key={client.id}
                        className="clickable-row"
                        tabIndex={0}
                        onClick={() =>
                          setSelectedClient(client)
                        }
                        onKeyDown={(event) => {
                          if (
                            event.key === 'Enter' ||
                            event.key === ' '
                          ) {
                            event.preventDefault()
                            setSelectedClient(client)
                          }
                        }}
                        aria-label={`View details for ${client.name}`}
                      >
                        <td>
                          <div className="client-cell">
                            <div className="client-avatar">
                              {client.name
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((part) => part[0] ?? '')
                                .join('')
                                .toUpperCase()}
                            </div>

                            <div className="client-details">
                              <strong>{client.name}</strong>
                              <span>
                                {client.email ||
                                  'No email provided'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="client-id">
                          {client.id}
                        </td>

                        <td>
                          <span className="type-label">
                            {client.type === 'INSTITUTIONAL'
                              ? 'Institutional'
                              : 'Retail'}
                          </span>
                        </td>

                        <td>{client.country}</td>

                        <td>
                          <span
                            className={`status-badge ${client.kycStatus.toLowerCase()}`}
                          >
                            <span />
                            {client.kycStatus.charAt(0) +
                              client.kycStatus
                                .slice(1)
                                .toLowerCase()}
                          </span>
                        </td>

                        <td>
                          {client.relationshipManagerId != null
                            ? `Manager #${client.relationshipManagerId}`
                            : 'Unassigned'}
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
                  : `Showing ${(page - 1) * pageSize + 1}–${Math.min(
                      page * pageSize,
                      total,
                    )} of ${total.toLocaleString()} clients`}
              </span>

              <div className="pagination-controls">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() =>
                    setPage((current) => current - 1)
                  }
                >
                  ← Previous
                </button>

                <span className="page-number">{page}</span>

                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() =>
                    setPage((current) => current + 1)
                  }
                >
                  Next →
                </button>
              </div>
            </footer>
          </section>

          <p className="page-footnote">
            Client information is provided by the Custody Ops backend.
          </p>
        </div>
      </section>

      {/* TRANSACTIONS PAGE */}
      <section
        className="main-panel"
        id="transactions"
        style={{
          display:
            activeSection === 'transactions' ? 'block' : 'none',
        }}
      >
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span> <strong>Transactions</strong>
          </div>

          <div className="topbar-right">
            <span className="connection-indicator">
              <span /> System workspace
            </span>
            <div className="avatar">AD</div>
          </div>
        </header>

       <p>Rôle dans App : {user.role}</p>
<Transactions token={token} userRole={user.role} />
      </section>

      {/* BILLING PAGE */}
{activeSection === 'billing' && (
  <Billing token={token} role={user.role} />
)}

{/* PORTFOLIOS PAGE */}
{activeSection === 'portfolios' && (
  <Portfolios token={token} />
)}

      {/* CLIENT DETAILS MODAL */}
      {selectedClient && activeSection === 'clients' && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedClient(null)
            }
          }}
        >
          <section
            className="client-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-modal-title"
          >
            
            <button
              className="modal-close"
              type="button"
              onClick={() => setSelectedClient(null)}
              aria-label="Close client details"
            >
              ×
            </button>

            <p className="eyebrow">CLIENT DETAILS</p>
            <h2 id="client-modal-title">
              {selectedClient.name}
            </h2>
            <p className="client-modal-id">
              Client ID: {selectedClient.id}
            </p>

            <div className="client-detail-grid">
              <div>
                <span>Client type</span>
                <strong>
                  {selectedClient.type === 'INSTITUTIONAL'
                    ? 'Institutional'
                    : 'Retail'}
                </strong>
              </div>

              <div>
                <span>Country</span>
                <strong>{selectedClient.country}</strong>
              </div>

              <div>
                <span>KYC status</span>
                <strong>{selectedClient.kycStatus}</strong>
              </div>

              <div>
                <span>Email</span>
                <strong>
                  {selectedClient.email || 'Not provided'}
                </strong>
              </div>

              <div>
                <span>Phone</span>
                <strong>
                  {selectedClient.phone || 'Not provided'}
                </strong>
              </div>

              <div>
                <span>Onboarded on</span>
                <strong>
                  {selectedClient.onboardedOn
                    ? new Date(
                        selectedClient.onboardedOn,
                      ).toLocaleDateString()
                    : 'Not available'}
                </strong>
                </div>

              <div>
                <span>Relationship manager ID</span>
                <strong>
                  {selectedClient.relationshipManagerId ??
                    'Unassigned'}
                </strong>
              </div>

              <div>
                <span>Record version</span>
                <strong>
                  {selectedClient.version ?? 'Not available'}
                </strong>
              </div>
            </div>

            <div className="client-modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setSelectedClient(null)}
              >
                Close details
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
