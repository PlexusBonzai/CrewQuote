import { useState } from 'react'
import { Plus, Eye, Edit, Trash2, Download, FileText } from 'lucide-react'
import { useApp }          from '@/context/AppContext'
import { formatCurrency }  from '@/utils/currency'
import { formatDate, today } from '@/utils/date'
import { generateId, generateQuoteNumber } from '@/utils/generators'
import { openQuotePDF }    from '@/services/pdf'
import { CURRENCIES, QUOTE_STATUSES } from '@/constants'
import {
  Button, Input, Select, Textarea, Card, Badge, PageHeader, EmptyState,
  SummaryRow,
} from '@/components/ui'
import {
  LineItemsEditor, TotalsPanel, DocumentDetail, useDocTotals,
} from '@/components/shared/DocumentComponents'
import type { Quote, Currency } from '@/types'

type View = 'list' | 'create' | 'edit' | 'detail'

// ── Quote Form ─────────────────────────────────────────────────────────────

function QuoteForm({
  quote, onSave, onBack,
}: { quote?: Quote; onSave: (q: Quote) => void; onBack: () => void }) {
  const { quotes, settings } = useApp()

  const [f, setF] = useState({
    quoteNumber:  quote?.quoteNumber  || generateQuoteNumber(quotes),
    companyName:  quote?.companyName  || settings.companyName || '',
    crewName:     quote?.crewName     || settings.crewName    || '',
    role:         quote?.role         || settings.role        || '',
    client:       quote?.client       || '',
    date:         quote?.date         || today(),
    currency:     (quote?.currency    || settings.defaultCurrency || 'ZAR') as Currency,
    notes:        quote?.notes        || '',
    status:       quote?.status       || 'draft',
  })

  const { items, setItems, vatStr, setVatStr, totals } = useDocTotals(
    quote?.lineItems || [],
    quote?.vat       || settings.defaultVat || 0,
  )

  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    onSave({
      ...f,
      ...totals,
      status: f.status as Quote['status'],
      currency: f.currency as Currency,
      id:          quote?.id  || generateId(),
      lineItems:   items,
      createdAt:   quote?.createdAt || new Date().toISOString(),
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={quote?.id ? `Edit ${f.quoteNumber}` : 'New Quote'}
        back
        onBack={onBack}
        actions={
          <>
            <Select value={f.status} onChange={e => set('status', e.target.value)} className="w-36">
              {Object.entries(QUOTE_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
            <Button onClick={handleSave}>
              <FileText size={15} /> Save Quote
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Company / Your Name" value={f.companyName} onChange={e => set('companyName', e.target.value)} placeholder="Your name or company" />
              <Input label="Quote Number"         value={f.quoteNumber} onChange={e => set('quoteNumber', e.target.value)} />
              <Input label="Crew Name"            value={f.crewName}    onChange={e => set('crewName',    e.target.value)} />
              <Input label="Role"                 value={f.role}        onChange={e => set('role',        e.target.value)} placeholder="e.g. Sound Mixer" />
              <Input label="Client / Production"  value={f.client}      onChange={e => set('client',      e.target.value)} />
              <Input label="Date" type="date"     value={f.date}        onChange={e => set('date',        e.target.value)} />
              <Select label="Currency" value={f.currency} onChange={e => set('currency', e.target.value)}>
                {Object.entries(CURRENCIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.flag} {k}</option>
                ))}
              </Select>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Line Items</h3>
            <LineItemsEditor items={items} onChange={setItems} currency={f.currency} />
          </Card>

          <Card className="p-5">
            <Textarea
              label="Notes / Payment Terms"
              value={f.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Payment due within 30 days…"
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

// ── Quotes Page ────────────────────────────────────────────────────────────

export default function Quotes() {
  const { quotes, settings, updateQuotes } = useApp()
  const [view, setView]       = useState<View>('list')
  const [selected, setSelected] = useState<Quote | null>(null)

  const open   = (q: Quote) => { setSelected(q); setView('detail') }
  const edit   = (q: Quote) => { setSelected(q); setView('edit') }
  const create = ()          => { setSelected(null); setView('create') }
  const back   = ()          => setView('list')

  const save = (q: Quote) => {
    updateQuotes(quotes.find(x => x.id === q.id) ? quotes.map(x => x.id === q.id ? q : x) : [...quotes, q])
    back()
  }

  const del = (id: string) => {
    if (confirm('Delete this quote? This cannot be undone.')) updateQuotes(quotes.filter(q => q.id !== id))
  }

  const changeStatus = (q: Quote, status: string) => {
    const updated = { ...q, status: status as Quote['status'] }
    updateQuotes(quotes.map(x => x.id === updated.id ? updated : x))
    setSelected(updated)
  }

  if (view === 'create')               return <QuoteForm onSave={save} onBack={back} />
  if (view === 'edit'   && selected)   return <QuoteForm quote={selected} onSave={save} onBack={back} />
  if (view === 'detail' && selected) {
    const current = quotes.find(q => q.id === selected.id) || selected
    return (
      <DocumentDetail
        doc={current}
        type="quote"
        settings={settings}
        onBack={back}
        onEdit={() => edit(current)}
        onExport={() => openQuotePDF(current, settings)}
        onStatusChange={s => changeStatus(current, s)}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quotes"
        subtitle={`${quotes.length} quote${quotes.length !== 1 ? 's' : ''}`}
        actions={
          <Button onClick={create}>
            <Plus size={15} /> New Quote
          </Button>
        }
      />

      <Card>
        {quotes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No quotes yet"
            description="Create your first professional quote to send to clients."
            action={<Button onClick={create}><Plus size={15} /> Create Quote</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Quote #', 'Client', 'Date', 'Status', 'Total', ''].map((h, i) => (
                    <th key={i} className={`px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider ${i === 4 || i === 5 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...quotes]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map(q => {
                    const st = QUOTE_STATUSES[q.status] || QUOTE_STATUSES.draft
                    return (
                      <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => open(q)}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                          >
                            {q.quoteNumber}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-700">{q.client || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-400">{formatDate(q.date)}</td>
                        <td className="px-5 py-3.5">
                          <Badge className={st.color}>{st.label}</Badge>
                        </td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 text-right">
                          {formatCurrency(q.total, q.currency)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => open(q)}   className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Eye      size={15} /></button>
                            <button onClick={() => edit(q)}   className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Edit     size={15} /></button>
                            <button onClick={() => openQuotePDF(q, settings)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Download size={15} /></button>
                            <button onClick={() => del(q.id)} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600">    <Trash2   size={15} /></button>
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
