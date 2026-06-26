// ============================================================================
// Shared components used by both Quotes and Invoices
// ============================================================================

import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit, Download, Save } from 'lucide-react'
import { formatCurrency }    from '@/utils/currency'
import { formatDate }        from '@/utils/date'
import { generateId }        from '@/utils/generators'
import { CURRENCIES, QUOTE_STATUSES, INVOICE_STATUSES } from '@/constants'
import {
  Button, Input, Select, Textarea, Card, Badge, PageHeader, SummaryRow,
} from '@/components/ui'
import type { LineItem, Quote, Invoice, UserSettings, Currency } from '@/types'

// ── Line Items Editor ──────────────────────────────────────────────────────

interface LineItemsEditorProps {
  items: LineItem[]
  onChange: (items: LineItem[]) => void
  currency: Currency
}

export function LineItemsEditor({ items, onChange, currency }: LineItemsEditorProps) {
  const [row, setRow] = useState({ description: '', quantity: '1', rate: '' })
  const sym = CURRENCIES[currency]?.symbol || '$'

  const addItem = () => {
    if (!row.description || !row.rate) return
    const qty    = parseFloat(row.quantity) || 1
    const rate   = parseFloat(row.rate)     || 0
    onChange([...items, { id: generateId(), description: row.description, quantity: qty, rate, amount: qty * rate }])
    setRow({ description: '', quantity: '1', rate: '' })
  }

  const remove = (id: string) => onChange(items.filter(i => i.id !== id))

  return (
    <div>
      {/* Existing items */}
      {items.length > 0 && (
        <div className="mb-3">
          <div className="grid grid-cols-12 gap-2 px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            <div className="col-span-6">Description</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Rate</div>
            <div className="col-span-1 text-right">Amt</div>
            <div className="col-span-1" />
          </div>
          {items.map(item => (
            <div key={item.id} className="grid grid-cols-12 gap-2 items-center py-2 px-2 border-b border-gray-100 hover:bg-gray-50 rounded-lg group">
              <div className="col-span-6 text-sm text-gray-800 truncate">{item.description}</div>
              <div className="col-span-2 text-sm text-right text-gray-500">{item.quantity}</div>
              <div className="col-span-2 text-sm text-right text-gray-500">{sym}{(item.rate).toFixed(2)}</div>
              <div className="col-span-1 text-sm text-right font-medium">{sym}{(item.amount).toFixed(2)}</div>
              <div className="col-span-1 flex justify-end">
                <button
                  onClick={() => remove(item.id)}
                  className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add row */}
      <div className="grid grid-cols-12 gap-2 items-end border-t border-gray-100 pt-3">
        <div className="col-span-6">
          <Input
            placeholder="Description"
            value={row.description}
            onChange={e => setRow(p => ({ ...p, description: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addItem()}
          />
        </div>
        <div className="col-span-2">
          <Input
            type="number"
            placeholder="Qty"
            value={row.quantity}
            onChange={e => setRow(p => ({ ...p, quantity: e.target.value }))}
            min="1"
          />
        </div>
        <div className="col-span-2">
          <Input
            type="number"
            placeholder="Rate"
            value={row.rate}
            onChange={e => setRow(p => ({ ...p, rate: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addItem()}
          />
        </div>
        <div className="col-span-1 text-sm text-right text-gray-400 pb-2">
          {sym}{((parseFloat(row.quantity) || 1) * (parseFloat(row.rate) || 0)).toFixed(2)}
        </div>
        <div className="col-span-1 pb-0.5">
          <Button variant="primary" size="sm" onClick={addItem} className="w-full justify-center px-2">
            <Plus size={14} />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Totals Panel ───────────────────────────────────────────────────────────

interface TotalsPanelProps {
  subtotal: number
  vat: number
  vatAmount: number
  total: number
  currency: Currency
  onVatChange: (vat: string) => void
}

export function TotalsPanel({ subtotal, vat, vatAmount, total, currency, onVatChange }: TotalsPanelProps) {
  return (
    <Card className="p-5 sticky top-20">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Summary</h3>
      <div className="space-y-1">
        <SummaryRow label="Subtotal" value={formatCurrency(subtotal, currency)} />
        <div className="flex items-center justify-between text-sm text-gray-600 py-1">
          <span>VAT</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={vat}
              onChange={e => onVatChange(e.target.value)}
              className="w-16 text-right px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0"
              min="0"
              max="100"
            />
            <span className="text-gray-400">%</span>
          </div>
        </div>
        {vat > 0 && <SummaryRow label="VAT Amount" value={formatCurrency(vatAmount, currency)} />}
      </div>
      <div className="border-t-2 border-gray-900 pt-3 mt-3 flex justify-between">
        <span className="font-bold text-gray-900">TOTAL</span>
        <span className="font-bold text-lg text-gray-900">{formatCurrency(total, currency)}</span>
      </div>
    </Card>
  )
}

// ── Document Totals Hook ───────────────────────────────────────────────────

export function useDocTotals(initialItems: LineItem[], initialVat: number) {
  const [items, setItems] = useState<LineItem[]>(initialItems)
  const [vatStr, setVatStr] = useState(String(initialVat || 0))

  const totals = useMemo(() => {
    const vat      = parseFloat(vatStr) || 0
    const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0)
    const vatAmt   = subtotal * (vat / 100)
    return { subtotal, vat, vatAmount: vatAmt, total: subtotal + vatAmt }
  }, [items, vatStr])

  return { items, setItems, vatStr, setVatStr, totals }
}

// ── Document Detail (read-only view, shared by Quote + Invoice) ────────────

interface DocumentDetailProps {
  doc: Quote | Invoice
  type: 'quote' | 'invoice'
  settings: UserSettings
  onBack: () => void
  onEdit: () => void
  onExport: () => void
  onStatusChange: (status: string) => void
}

export function DocumentDetail({
  doc, type, settings, onBack, onEdit, onExport, onStatusChange,
}: DocumentDetailProps) {
  const isInvoice = type === 'invoice'
  const inv       = doc as Invoice
  const q         = doc as Quote
  const currency  = doc.currency || 'ZAR'
  const sym       = CURRENCIES[currency]?.symbol || '$'
  const statuses  = isInvoice ? INVOICE_STATUSES : QUOTE_STATUSES
  const num       = q.quoteNumber || inv.invoiceNumber
  const client    = q.client || inv.clientName
  const status    = statuses[doc.status as keyof typeof statuses]

  return (
    <div className="space-y-5">
      <PageHeader
        title={num || '—'}
        subtitle={`${isInvoice ? 'Invoice' : 'Quote'} for ${client || '—'}`}
        back
        onBack={onBack}
        actions={
          <>
            <Badge className={status?.color || 'bg-gray-100 text-gray-700'}>
              {status?.label || doc.status}
            </Badge>
            <Select
              value={doc.status}
              onChange={e => onStatusChange(e.target.value)}
              className="w-36"
            >
              {Object.entries(statuses).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
            <Button variant="secondary" onClick={onEdit}>
              <Edit size={15} /> Edit
            </Button>
            <Button onClick={onExport}>
              <Download size={15} /> Export PDF
            </Button>
          </>
        }
      />

      <Card className="p-8 max-w-3xl mx-auto">
        {/* Doc header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              {isInvoice ? 'INVOICE' : 'QUOTE'}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">{num}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-gray-900 text-lg leading-tight">
              {doc.companyName || settings.companyName || ''}
            </p>
            {doc.crewName && <p className="text-gray-500 text-sm">{doc.crewName}</p>}
            {doc.role      && <p className="text-gray-500 text-sm">{doc.role}</p>}
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Bill To</p>
            <p className="font-medium text-gray-900">{client || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {isInvoice ? 'Issue Date' : 'Date'}
            </p>
            <p className="font-medium text-gray-900">
              {formatDate(isInvoice ? inv.issueDate : q.date)}
            </p>
            {isInvoice && inv.dueDate && (
              <>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 mt-3">Due Date</p>
                <p className="font-medium text-gray-900">{formatDate(inv.dueDate)}</p>
              </>
            )}
          </div>
        </div>

        {/* Line items */}
        <div>
          <div className="grid grid-cols-12 gap-4 pb-2 border-t-2 border-b border-gray-900/80 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-6">Description</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Rate</div>
            <div className="col-span-2 text-right">Amount</div>
          </div>
          {(doc.lineItems || []).map(item => (
            <div key={item.id} className="grid grid-cols-12 gap-4 py-3 border-b border-gray-100">
              <div className="col-span-6 text-sm text-gray-800">{item.description}</div>
              <div className="col-span-2 text-sm text-right text-gray-500">{item.quantity}</div>
              <div className="col-span-2 text-sm text-right text-gray-500">{sym}{item.rate.toFixed(2)}</div>
              <div className="col-span-2 text-sm text-right font-medium">{sym}{item.amount.toFixed(2)}</div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="flex justify-end mt-5">
          <div className="w-60 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span className="font-medium text-gray-900">{formatCurrency(doc.subtotal, currency)}</span>
            </div>
            {doc.vat > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>VAT ({doc.vat}%)</span>
                <span className="font-medium text-gray-900">{formatCurrency(doc.vatAmount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 pt-2 border-t-2 border-gray-900 text-base">
              <span>TOTAL</span>
              <span>{formatCurrency(doc.total, currency)}</span>
            </div>
          </div>
        </div>

        {/* Banking (invoice only) */}
        {isInvoice && inv.bankingDetails && Object.values(inv.bankingDetails).some(Boolean) && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Banking Details</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {[
                ['Account Name',   inv.bankingDetails.accountName],
                ['Bank',           inv.bankingDetails.bankName],
                ['Account Number', inv.bankingDetails.accountNumber],
                ['Branch Code',    inv.bankingDetails.branchCode],
                inv.bankingDetails.swiftCode && ['SWIFT',     inv.bankingDetails.swiftCode],
                inv.bankingDetails.iban      && ['IBAN',      inv.bankingDetails.iban],
                inv.bankingDetails.reference && ['Reference', inv.bankingDetails.reference],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{value as string}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {(q.notes || inv.paymentNotes) && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Notes</p>
            <p className="text-sm text-gray-600 leading-relaxed">{q.notes || inv.paymentNotes}</p>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Document Form Shared State ─────────────────────────────────────────────

interface BaseDocFields {
  companyName: string
  crewName: string
  role: string
  currency: Currency
  status: string
}

interface QuoteFields extends BaseDocFields {
  quoteNumber: string
  client: string
  date: string
  notes: string
}

interface InvoiceFields extends BaseDocFields {
  invoiceNumber: string
  clientName: string
  issueDate: string
  dueDate: string
  paymentNotes: string
  bankingDetails: {
    accountName: string; bankName: string; accountNumber: string
    branchCode: string; swiftCode: string; iban: string; reference: string
  }
}

export type { QuoteFields, InvoiceFields, BaseDocFields }
