import { useState } from 'react'
import { Plus, Eye, Edit, Trash2, Download, Receipt } from 'lucide-react'
import { useApp }            from '@/context/AppContext'
import { formatCurrency }    from '@/utils/currency'
import { formatDate, today } from '@/utils/date'
import { generateId, generateInvoiceNumber } from '@/utils/generators'
import { openInvoicePDF }    from '@/services/pdf'
import { CURRENCIES, INVOICE_STATUSES, DEFAULT_BANKING } from '@/constants'
import {
  Button, Input, Select, Textarea, Card, Badge, PageHeader, EmptyState,
} from '@/components/ui'
import {
  LineItemsEditor, TotalsPanel, DocumentDetail, useDocTotals,
} from '@/components/shared/DocumentComponents'
import type { Invoice, Currency } from '@/types'

type View = 'list' | 'create' | 'edit' | 'detail'

// ── Invoice Form ───────────────────────────────────────────────────────────

function InvoiceForm({
  invoice, onSave, onBack,
}: { invoice?: Invoice; onSave: (i: Invoice) => void; onBack: () => void }) {
  const { invoices, settings } = useApp()
  const bd = settings.bankingDetails || DEFAULT_BANKING

  const [f, setF] = useState({
    invoiceNumber: invoice?.invoiceNumber || generateInvoiceNumber(invoices),
    companyName:   invoice?.companyName   || settings.companyName || '',
    crewName:      invoice?.crewName      || settings.crewName    || '',
    role:          invoice?.role          || settings.role        || '',
    clientName:    invoice?.clientName    || '',
    issueDate:     invoice?.issueDate     || today(),
    dueDate:       invoice?.dueDate       || '',
    currency:      (invoice?.currency     || settings.defaultCurrency || 'ZAR') as Currency,
    paymentNotes:  invoice?.paymentNotes  || '',
    status:        invoice?.status        || 'draft',
    bankingDetails: invoice?.bankingDetails || { ...bd },
  })

  const { items, setItems, vatStr, setVatStr, totals } = useDocTotals(
    invoice?.lineItems || [],
    invoice?.vat       || settings.defaultVat || 0,
  )

  const set  = (k: string, v: string)                => setF(p => ({ ...p, [k]: v }))
  const setBD= (k: string, v: string)                => setF(p => ({ ...p, bankingDetails: { ...p.bankingDetails, [k]: v } }))

  const handleSave = () => {
    onSave({
      ...f,
      ...totals,
      status:   f.status as Invoice['status'],
      currency: f.currency,
      id:         invoice?.id   || generateId(),
      lineItems:  items,
      createdAt:  invoice?.createdAt || new Date().toISOString(),
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={invoice?.id ? `Edit ${f.invoiceNumber}` : 'New Invoice'}
        back
        onBack={onBack}
        actions={
          <>
            <Select value={f.status} onChange={e => set('status', e.target.value)} className="w-36">
              {Object.entries(INVOICE_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
            <Button onClick={handleSave}>
              <Receipt size={15} /> Save Invoice
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {/* Header details */}
          <Card className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Company / Your Name"  value={f.companyName}   onChange={e => set('companyName',   e.target.value)} />
              <Input label="Invoice Number"        value={f.invoiceNumber} onChange={e => set('invoiceNumber', e.target.value)} />
              <Input label="Crew Name"             value={f.crewName}      onChange={e => set('crewName',      e.target.value)} />
              <Input label="Role"                  value={f.role}          onChange={e => set('role',          e.target.value)} placeholder="e.g. Sound Mixer" />
              <Input label="Client / Production"   value={f.clientName}    onChange={e => set('clientName',    e.target.value)} />
              <Select label="Currency" value={f.currency} onChange={e => set('currency', e.target.value)}>
                {Object.entries(CURRENCIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.flag} {k}</option>
                ))}
              </Select>
              <Input label="Issue Date" type="date" value={f.issueDate} onChange={e => set('issueDate', e.target.value)} />
              <Input label="Due Date"   type="date" value={f.dueDate}   onChange={e => set('dueDate',   e.target.value)} />
            </div>
          </Card>

          {/* Line items */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Line Items</h3>
            <LineItemsEditor items={items} onChange={setItems} currency={f.currency} />
          </Card>

          {/* Banking details */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Banking Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Account Name"         value={f.bankingDetails.accountName   || ''} onChange={e => setBD('accountName',   e.target.value)} />
              <Input label="Bank Name"             value={f.bankingDetails.bankName      || ''} onChange={e => setBD('bankName',      e.target.value)} />
              <Input label="Account Number"        value={f.bankingDetails.accountNumber || ''} onChange={e => setBD('accountNumber', e.target.value)} />
              <Input label="Branch / Sort Code"    value={f.bankingDetails.branchCode    || ''} onChange={e => setBD('branchCode',    e.target.value)} />
              <Input label="SWIFT / BIC"           value={f.bankingDetails.swiftCode     || ''} onChange={e => setBD('swiftCode',     e.target.value)} />
              <Input label="Payment Reference"     value={f.bankingDetails.reference     || ''} onChange={e => setBD('reference',     e.target.value)} />
            </div>
          </Card>

          {/* Payment notes */}
          <Card className="p-5">
            <Textarea
              label="Payment Notes"
              value={f.paymentNotes}
              onChange={e => set('paymentNotes', e.target.value)}
              rows={3}
              placeholder="e.g. Please pay within 30 days of invoice date"
            />
          </Card>
        </div>

        <TotalsPanel
          {...totals}
          currency={f.currency}
          onVatChange={setVatStr}
        />
      </div>
    </div>
  )
}

// ── Invoices Page ──────────────────────────────────────────────────────────

export default function Invoices() {
  const { invoices, settings, updateInvoices } = useApp()
  const [view, setView]         = useState<View>('list')
  const [selected, setSelected] = useState<Invoice | null>(null)

  const open   = (i: Invoice) => { setSelected(i); setView('detail') }
  const edit   = (i: Invoice) => { setSelected(i); setView('edit') }
  const create = ()            => { setSelected(null); setView('create') }
  const back   = ()            => setView('list')

  const save = (inv: Invoice) => {
    updateInvoices(
      invoices.find(x => x.id === inv.id)
        ? invoices.map(x => x.id === inv.id ? inv : x)
        : [...invoices, inv]
    )
    back()
  }

  const del = (id: string) => {
    if (confirm('Delete this invoice? This cannot be undone.')) updateInvoices(invoices.filter(i => i.id !== id))
  }

  const changeStatus = (inv: Invoice, status: string) => {
    const updated = { ...inv, status: status as Invoice['status'] }
    updateInvoices(invoices.map(x => x.id === updated.id ? updated : x))
    setSelected(updated)
  }

  if (view === 'create')               return <InvoiceForm onSave={save} onBack={back} />
  if (view === 'edit'   && selected)   return <InvoiceForm invoice={selected} onSave={save} onBack={back} />
  if (view === 'detail' && selected) {
    const current = invoices.find(i => i.id === selected.id) || selected
    return (
      <DocumentDetail
        doc={current}
        type="invoice"
        settings={settings}
        onBack={back}
        onEdit={() => edit(current)}
        onExport={() => openInvoicePDF(current, settings)}
        onStatusChange={s => changeStatus(current, s)}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}
        actions={
          <Button onClick={create}>
            <Plus size={15} /> New Invoice
          </Button>
        }
      />

      <Card>
        {invoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No invoices yet"
            description="Create an invoice or generate one from a timesheet."
            action={<Button onClick={create}><Plus size={15} /> Create Invoice</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Invoice #', 'Client', 'Issue Date', 'Due Date', 'Status', 'Total', ''].map((h, i) => (
                    <th key={i} className={`px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider ${i >= 5 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...invoices]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map(inv => {
                    const st = INVOICE_STATUSES[inv.status] || INVOICE_STATUSES.draft
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5">
                          <button onClick={() => open(inv)} className="text-sm font-semibold text-blue-600 hover:text-blue-800">
                            {inv.invoiceNumber}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-700">{inv.clientName || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-400">{formatDate(inv.issueDate)}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-400">{formatDate(inv.dueDate) || '—'}</td>
                        <td className="px-5 py-3.5">
                          <Badge className={st.color}>{st.label}</Badge>
                        </td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 text-right">
                          {formatCurrency(inv.total, inv.currency)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => open(inv)}  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Eye      size={15} /></button>
                            <button onClick={() => edit(inv)}  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Edit     size={15} /></button>
                            <button onClick={() => openInvoicePDF(inv, settings)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Download size={15} /></button>
                            <button onClick={() => del(inv.id)} className="p-1.5 rounded-md hover:bg-red-50  text-gray-400 hover:text-red-600"><Trash2   size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
