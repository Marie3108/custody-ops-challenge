
import { useCallback, useEffect, useState } from 'react'

type Invoice = {
  id: number
  clientId: string
  invoiceMonth: string
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID'
  currency: string
  total: number | string
}

type BillingProps = {
  token: string
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER'
}

const API = 'http://localhost:3001/api/invoices'

export default function Billing({ token, role }: BillingProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clientId, setClientId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [generationClientId, setGenerationClientId] = useState('')
  const [generationMonth, setGenerationMonth] = useState(
    new Date().toISOString().slice(0, 7)
  )
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

 
  const loadInvoices = useCallback(async () => {
    setLoading(true)
    setMessage('')
    setError(false)

    try {
      const params = new URLSearchParams()

      if (clientId.trim()) {
        params.set('clientId', clientId.trim())
      }

      if (filterStatus) {
        params.set('status', filterStatus)
      }

      const response = await fetch(`${API}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to load invoices')
      }

      const rows = Array.isArray(result) ? result : result.data

      const normalizedRows: Invoice[] = Array.isArray(rows)
        ? rows.map((invoice: Invoice) => ({
            ...invoice,
            invoiceMonth: String(invoice.invoiceMonth).slice(0, 10),
          }))
        : []

      setInvoices(normalizedRows)
    } catch (err) {
      setError(true)
      setMessage(
        err instanceof Error ? err.message : 'Loading failed'
      )
    } finally {
      setLoading(false)
    }
  }, [token, clientId, filterStatus])


  useEffect(() => {
    void loadInvoices()
  }, [loadInvoices])

  async function generateInvoice() {
    if (!generationClientId.trim() || !generationMonth) {
      setError(true)
      setMessage('Enter a client ID and select an invoice month.')
      return
    }

    setGenerating(true)
    setError(false)
    setMessage('')

    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: generationClientId.trim(),
          month: generationMonth,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Invoice generation failed')
      }

      setMessage(`Invoice #${result.id} generated successfully.`)
      setClientId('')
      setFilterStatus('')
      await loadInvoices()
    } catch (err) {
      setError(true)
      setMessage(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function changeStatus(
    id: number,
    action: 'issue' | 'pay' | 'void'
  ) {
    setError(false)
    setMessage('')

    try {
      const response = await fetch(`${API}/${id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Status update failed')
      }

      setMessage(`Invoice #${id} updated successfully.`)
      await loadInvoices()
    } catch (err) {
      setError(true)
      setMessage(err instanceof Error ? err.message : 'Status update failed')
    }
  }

  const counts = {
    total: invoices.length,
    draft: invoices.filter((invoice) => invoice.status === 'DRAFT').length,
    issued: invoices.filter((invoice) => invoice.status === 'ISSUED').length,
    paid: invoices.filter((invoice) => invoice.status === 'PAID').length,
  }

  function formatMoney(invoice: Invoice) {
    return Number(invoice.total).toLocaleString('de-DE', {
      style: 'currency',
      currency: invoice.currency || 'EUR',
    })
  }

    

 /* function formatMonth(value: string) {
    const month = String(value).slice(0, 7)
    const [year, monthNumber] = month.split('-')
    return year && monthNumber ? `${monthNumber}/${year}` : month
  }
*/

function formatMonth(value: string) {
  const normalized = String(value).slice(0, 10)
  const [year, month] = normalized.split('-')

  return year && month ? `${month}/${year}` : normalized
}
  return (
    <section className="main-panel billing-page">
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">FINANCIAL OPERATIONS</p>
            <h1>Billing</h1>
            <p className="subtitle">
              Generate, issue and manage monthly client invoices.
            </p>
          </div>

          <button
            className="secondary-button"
            onClick={() => void loadInvoices()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        <div className="billing-stats">
          <div className="billing-stat">
            <span>Total invoices</span>
            <strong>{counts.total}</strong>
            <small>Matching current filters</small>
          </div>
          <div className="billing-stat">
            <span>Drafts</span>
            <strong>{counts.draft}</strong>
            <small>Awaiting issue</small>
          </div>
          <div className="billing-stat">
            <span>Issued</span>
            <strong>{counts.issued}</strong>
            <small>Awaiting payment</small>
          </div>
          <div className="billing-stat">
            <span>Paid</span>
            <strong>{counts.paid}</strong>
            <small>Successfully paid</small>
          </div>
        </div>

        {role !== 'VIEWER' && (
          <section className="table-card invoice-generator">
            <div className="billing-section-heading">
              <div>
                <h2>Generate an invoice</h2>
                <p>Create a monthly invoice for a client.</p>
              </div>
              <span className="billing-icon">＋</span>
            </div>

            <div className="billing-form">
              <label>
                Client ID
                <input
                  value={generationClientId}
                  onChange={(event) =>
                    setGenerationClientId(event.target.value)
                  }
                  placeholder="e.g. C-00069"
                />
              </label>

              <label>
                Invoice month
                <input
                  type="month"
                  value={generationMonth}
                  onChange={(event) => setGenerationMonth(event.target.value)}
                />
              </label>

              <button
                className="primary-button"
                onClick={() => void generateInvoice()}
                disabled={generating}
              >
                {generating ? 'Generating…' : 'Generate invoice'}
              </button>
            </div>
          </section>
        )}

        <section className="table-card billing-list">
          <div className="billing-section-heading">
            <div>
              <h2>Invoice directory</h2>
              <p>Review invoice status and available actions.</p>
            </div>
            <span className="billing-record-count">
              {invoices.length} records
            </span>
          </div>

          <div className="filters billing-filters">
            <input
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="Search by client ID…"
              aria-label="Filter by client ID"
            />

            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              aria-label="Filter by invoice status"
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ISSUED">Issued</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Void</option>
            </select>

            <button
              className="secondary-button"
              onClick={() => {
                setClientId('')
                setFilterStatus('')
              }}
            >
              Reset filters
            </button>
          </div>

          {message && (
            <p
              className={`billing-message ${error ? 'is-error' : 'is-success'}`}
              role="status"
            >
              {message}
            </p>
          )}

          {loading ? (
            <div className="billing-empty">
              <p>Loading invoices…</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th>Billing month</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <strong className="invoice-number">
                          INV-{String(invoice.id).padStart(5, '0')}
                        </strong>
                      </td>
                      <td>
                        <span className="invoice-client">
                          {invoice.clientId}
                        </span>
                      </td>
                      <td>{formatMonth(invoice.invoiceMonth)}</td>
                      <td>
                        <span
                          className={`invoice-status status-${invoice.status.toLowerCase()}`}
                        >
                          <span className="status-dot" />
                          {invoice.status}
                        </span>
                      </td>
                      <td className="invoice-total">
                        {formatMoney(invoice)}
                      </td>
                      <td>
                        <div className="billing-actions">
                          {invoice.status === 'DRAFT' &&
                            role !== 'VIEWER' && (
                              <button
                                className="action-button action-primary"
                                onClick={() =>
                                  void changeStatus(invoice.id, 'issue')
                                }
                              >
                                Issue
                              </button>
                            )}

                          {role === 'ADMIN' &&
                            invoice.status === 'ISSUED' && (
                              <>
                                <button
                                  className="action-button action-primary"
                                  onClick={() =>
                                    void changeStatus(invoice.id, 'pay')
                                  }
                                >
                                  Mark paid
                                </button>
                                <button
                                  className="action-button action-danger"
                                  onClick={() =>
                                    void changeStatus(invoice.id, 'void')
                                  }
                                >
                                  Void
                                </button>
                              </>
                            )}

                          {invoice.status === 'PAID' && (
                            <span className="no-action">Completed</span>
                          )}

                          {invoice.status === 'VOID' && (
                            <span className="no-action">Voided</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className="billing-empty">
                          <span className="billing-empty-icon">▤</span>
                          <strong>No invoices found</strong>
                          <p>
                            Try changing your filters or generate an invoice
                            for a client.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <style>{`
        .billing-page .page-content {
          max-width: 1500px;
        }

        .billing-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
          margin: 28px 0;
        }

        .billing-stat {
          background: #fff;
          border: 1px solid #e5eaf2;
          border-radius: 15px;
          padding: 22px 24px;
          box-shadow: 0 3px 12px rgba(25, 45, 75, 0.025);
        }

        .billing-stat span,
        .billing-stat small {
          display: block;
          color: #7888a2;
          font-size: 13px;
        }

        .billing-stat strong {
          display: block;
          color: #202d42;
          font-size: 30px;
          margin: 13px 0 8px;
          font-weight: 700;
        }

        .table-card {
          background: #fff;
          border: 1px solid #e5eaf2;
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 24px;
          box-shadow: 0 4px 16px rgba(25, 45, 75, 0.035);
        }

        .billing-section-heading {
          padding: 24px 28px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }

        .billing-section-heading h2 {
          margin: 0 0 7px;
          color: #19263b;
          font-size: 19px;
        }

        .billing-section-heading p {
          margin: 0;
          color: #8492a9;
          font-size: 13px;
        }

        .billing-icon {
          display: grid;
          place-items: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: #edf3ff;
          color: #3868c8;
          font-size: 25px;
        }

        .billing-form {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto;
          gap: 18px;
          align-items: end;
          padding: 0 28px 26px;
        }

        .billing-form label {
          display: grid;
          gap: 8px;
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
        }

        .billing-form input,
        .billing-filters input,
        .billing-filters select {
          box-sizing: border-box;
          width: 100%;
          min-height: 44px;
          border: 1px solid #dbe3ef;
          border-radius: 9px;
          background: #fff;
          color: #29374d;
          padding: 0 13px;
          font: inherit;
          font-size: 13px;
          outline: none;
        }

        .billing-form input:focus,
        .billing-filters input:focus,
        .billing-filters select:focus {
          border-color: #789be8;
          box-shadow: 0 0 0 3px rgba(89, 129, 220, 0.12);
        }

        .primary-button,
        .secondary-button,
        .action-button {
          border-radius: 9px;
          min-height: 42px;
          padding: 0 17px;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }

        .primary-button,
        .action-primary {
          border: 1px solid #315eb9;
          background: #315eb9;
          color: #fff;
        }

        .primary-button:hover,
        .action-primary:hover {
          background: #244b9a;
        }

        .primary-button:disabled,
        .secondary-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .secondary-button {
          border: 1px solid #d9e2ef;
          background: #fff;
          color: #344762;
        }

        .secondary-button:hover {
          background: #f5f8fc;
          border-color: #b8c8de;
        }

        .billing-record-count {
          padding: 10px 13px;
          border-radius: 9px;
          background: #f2f5fa;
          color: #667894;
          font-size: 12px;
          white-space: nowrap;
        }

        .billing-filters {
          display: grid;
          grid-template-columns: minmax(200px, 1fr) minmax(160px, 220px) auto;
          gap: 12px;
          padding: 0 28px 22px;
        }

        .billing-message {
          margin: 0 28px 20px;
          padding: 12px 15px;
          border-radius: 9px;
          font-size: 13px;
        }

        .billing-message.is-success {
          background: #eaf7ef;
          color: #217548;
        }

        .billing-message.is-error {
          background: #fff0f0;
          color: #b42332;
        }

        .billing-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .billing-table thead {
          background: #f7f9fc;
        }

        .billing-table th {
          padding: 15px 22px;
          color: #8391a8;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.07em;
          white-space: nowrap;
        }

        .billing-table td {
          padding: 19px 22px;
          border-top: 1px solid #edf0f5;
          color: #53647e;
          font-size: 13px;
          white-space: nowrap;
        }

        .billing-table tbody tr:hover {
          background: #fbfcfe;
        }

        .invoice-number {
          color: #26364f;
          font-size: 12px;
        }

        .invoice-client {
          color: #345da9;
          font-weight: 600;
        }

        .invoice-total {
          color: #202d42 !important;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .invoice-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border-radius: 20px;
          padding: 7px 10px;
          font-size: 10px;
          font-weight: 700;
        }

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .status-draft {
          background: #fff4dc;
          color: #9b6a0b;
        }

        .status-issued {
          background: #eaf1ff;
          color: #315eb9;
        }

        .status-paid {
          background: #e7f7ee;
          color: #21804c;
        }

        .status-void {
          background: #f0f1f4;
          color: #697386;
        }

        .billing-actions {
          display: flex;
          gap: 7px;
          align-items: center;
        }

        .action-button {
          min-height: 32px;
          padding: 0 11px;
          font-size: 11px;
        }

        .action-danger {
          border: 1px solid #f0caca;
          background: #fff;
          color: #b42332;
        }

        .action-danger:hover {
          background: #fff0f0;
        }

        .no-action {
          color: #9aa5b5;
          font-size: 12px;
        }

        .billing-empty {
          padding: 38px 20px;
          text-align: center;
          color: #8492a9;
          white-space: normal;
        }

        .billing-empty-icon {
          display: block;
          margin-bottom: 10px;
          color: #a2b2ca;
          font-size: 27px;
        }

        .billing-empty strong {
          display: block;
          color: #344762;
          font-size: 14px;
        }

        .billing-empty p {
          margin: 8px 0 0;
          font-size: 13px;
        }

        @media (max-width: 1000px) {
          .billing-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .billing-form {
            grid-template-columns: 1fr 1fr;
          }

          .billing-form .primary-button {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 650px) {
          .billing-stats {
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .billing-stat {
            padding: 16px;
          }

          .billing-stat strong {
            font-size: 24px;
          }

          .billing-form,
          .billing-filters {
            grid-template-columns: 1fr;
            padding-left: 16px;
            padding-right: 16px;
          }

          .billing-section-heading {
            padding: 18px 16px;
          }

          .billing-table th,
          .billing-table td {
            padding: 13px;
          }
        }
      `}</style>
    </section>
  )
}
