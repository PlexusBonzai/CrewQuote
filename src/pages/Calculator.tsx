import { useMemo, useState } from 'react'
import { useNavigate }        from 'react-router-dom'
import { FileText, Receipt }  from 'lucide-react'
import { useApp }             from '@/context/AppContext'
import { formatCurrency }     from '@/utils/currency'
import { today }              from '@/utils/date'
import { generateId }         from '@/utils/generators'
import { generateQuoteNumber, generateInvoiceNumber } from '@/utils/generators'
import { CURRENCIES }         from '@/constants'
import {
  Button, Input, Select, Textarea, Card, Alert, SummaryRow, PageHeader,
} from '@/components/ui'
import type { Currency } from '@/types'

export default function Calculator() {
  const { quotes, invoices, profiles, settings, updateQuotes, updateInvoices } = useApp()
  const nav = useNavigate()

  const [form, setForm] = useState({
    crewName:    settings.crewName  || '',
    role:        settings.role      || '',
    clientName:  '',
    shootDate:   today(),
    currency:    (settings.defaultCurrency || 'ZAR') as Currency,
    dayRate:     '',
    hoursWorked: '',
    includedHours: String(settings.defaultIncludedHours || 10),
    overtimeRate:  String(settings.defaultOvertimeRate  || 0),
    equipment:     '',
    additional:    '',
    notes:         '',
    vat:           String(settings.defaultVat || 0),
    includeVat:    (settings.defaultVat || 0) > 0,
  })

  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))
  const sym = CURRENCIES[form.currency]?.symbol || '$'

  // Real-time calculations
  const calc = useMemo(() => {
    const day    = parseFloat(form.dayRate)     || 0
    const hours  = parseFloat(form.hoursWorked) || 0
    const inc    = parseFloat(form.includedHours) || 10
    const otRate = parseFloat(form.overtimeRate)  || 0
    const eq     = parseFloat(form.equipment)     || 0
    const add    = parseFloat(form.additional)    || 0
    const vatPct = form.includeVat ? (parseFloat(form.vat) || 0) : 0

    const otHours = Math.max(hours - inc, 0)
    const otCost  = otHours * otRate
    const sub     = day + otCost + eq + add
    const vatAmt  = sub * (vatPct / 100)

    return { day, otHours, otCost, eq, add, sub, vatPct, vatAmt, total: sub + vatAmt }
  }, [form])

  // Build line items from calculation
  const buildLineItems = () => {
    const items = []
    if (calc.day)    items.push({ id: generateId(), description: 'Day Rate', quantity: 1, rate: calc.day, amount: calc.day })
    if (calc.otCost) items.push({ id: generateId(), description: `Overtime — ${calc.otHours.toFixed(1)} hrs @ ${formatCurrency(parseFloat(form.overtimeRate) || 0, form.currency)}/hr`, quantity: 1, rate: calc.otCost, amount: calc.otCost })
    if (calc.eq)     items.push({ id: generateId(), description: 'Equipment Rental', quantity: 1, rate: calc.eq, amount: calc.eq })
    if (calc.add)    items.push({ id: generateId(), description: 'Additional Expenses', quantity: 1, rate: calc.add, amount: calc.add })
    return items
  }

  const saveAsQuote = () => {
    const q = {
      id: generateId(),
      quoteNumber:  generateQuoteNumber(quotes),
      companyName:  settings.companyName || '',
      crewName:     form.crewName,
      role:         form.role,
      client:       form.clientName,
      date:         form.shootDate,
      lineItems:    buildLineItems(),
      subtotal:     calc.sub,
      vat:          calc.vatPct,
      vatAmount:    calc.vatAmt,
      total:        calc.total,
      notes:        form.notes,
      currency:     form.currency,
      status:       'draft' as const,
      createdAt:    new Date().toISOString(),
    }
    updateQuotes([...quotes, q])
    nav('/quotes')
  }

  const saveAsInvoice = () => {
    const inv = {
      id: generateId(),
      invoiceNumber:  generateInvoiceNumber(invoices),
      companyName:    settings.companyName || '',
      issueDate:      today(),
      dueDate:        '',
      clientName:     form.clientName,
      crewName:       form.crewName,
      role:           form.role,
      lineItems:      buildLineItems(),
      subtotal:       calc.sub,
      vat:            calc.vatPct,
      vatAmount:      calc.vatAmt,
      total:          calc.total,
      paymentNotes:   '',
      bankingDetails: { ...settings.bankingDetails },
      status:         'draft' as const,
      currency:       form.currency,
      createdAt:      new Date().toISOString(),
    }
    updateInvoices([...invoices, inv])
    nav('/invoices')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rate Calculator"
        subtitle="Calculate costs instantly — then save as a quote or invoice"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left column: inputs ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Load profile */}
          {profiles.length > 0 && (
            <Card className="p-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Load a Crew Profile</p>
                <p className="text-xs text-gray-400">Auto-fill rates from a saved profile</p>
              </div>
              <Select
                className="w-52"
                onChange={e => {
                  const p = profiles.find(x => x.id === e.target.value)
                  if (!p) return
                  setForm(prev => ({
                    ...prev,
                    crewName:      p.name          || '',
                    role:          p.role          || '',
                    dayRate:       String(p.dayRate        || ''),
                    overtimeRate:  String(p.overtimeRate   || ''),
                    includedHours: String(p.includedHours  || 10),
                    equipment:     String(p.equipmentPackage || ''),
                    currency:      p.currency || prev.currency,
                  }))
                }}
              >
                <option value="">Select profile…</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.role}</option>
                ))}
              </Select>
            </Card>
          )}

          {/* Job Details */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Job Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Crew Name"          value={form.crewName}   onChange={e => set('crewName', e.target.value)}   placeholder="Your name"           />
              <Input label="Role"               value={form.role}       onChange={e => set('role', e.target.value)}       placeholder="e.g. Sound Mixer"    />
              <Input label="Client / Production" value={form.clientName} onChange={e => set('clientName', e.target.value)} placeholder="Production name"      />
              <Input label="Shoot Date" type="date" value={form.shootDate} onChange={e => set('shootDate', e.target.value)} />
              <Select label="Currency" value={form.currency} onChange={e => set('currency', e.target.value as Currency)}>
                {Object.entries(CURRENCIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.flag} {k} — {v.name}</option>
                ))}
              </Select>
            </div>
          </Card>

          {/* Rates & Hours */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Rates & Hours</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label={`Day Rate (${sym})`}             type="number" value={form.dayRate}      onChange={e => set('dayRate', e.target.value)}      placeholder="0.00" min="0" />
              <Input label="Hours Worked"                    type="number" value={form.hoursWorked}  onChange={e => set('hoursWorked', e.target.value)}  placeholder="0" step="0.5" min="0" />
              <Input label="Included Hours (before OT)"      type="number" value={form.includedHours} onChange={e => set('includedHours', e.target.value)} placeholder="10" />
              <Input label={`Overtime Rate (${sym}/hr)`}     type="number" value={form.overtimeRate}  onChange={e => set('overtimeRate', e.target.value)}  placeholder="0.00" />
            </div>
          </Card>

          {/* Additional Costs */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Additional Costs</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Input label={`Equipment Rental (${sym})`}     type="number" value={form.equipment}   onChange={e => set('equipment', e.target.value)}   placeholder="0.00" />
              <Input label={`Additional Expenses (${sym})`}  type="number" value={form.additional}  onChange={e => set('additional', e.target.value)}  placeholder="0.00" />
            </div>

            <div className="flex items-center gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.includeVat}
                  onChange={e => set('includeVat', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                Include VAT
              </label>
              {form.includeVat && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={form.vat}
                    onChange={e => set('vat', e.target.value)}
                    placeholder="0"
                    className="w-20 text-right"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              )}
            </div>

            <Textarea
              label="Notes"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Additional notes or terms…"
            />
          </Card>
        </div>

        {/* ── Right column: summary ── */}
        <div>
          <Card className="p-5 sticky top-20">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Cost Breakdown</h3>

            <div className="space-y-1 mb-4">
              <SummaryRow label="Base Day Rate"    value={formatCurrency(calc.day, form.currency)} />
              {calc.otHours > 0 && <>
                <SummaryRow label="Overtime Hours" value={<span className="text-amber-600 font-medium">{calc.otHours.toFixed(1)} hrs</span>} />
                <SummaryRow label="Overtime Cost"  value={formatCurrency(calc.otCost, form.currency)} />
              </>}
              {calc.eq  > 0 && <SummaryRow label="Equipment"   value={formatCurrency(calc.eq,  form.currency)} />}
              {calc.add > 0 && <SummaryRow label="Additional"  value={formatCurrency(calc.add, form.currency)} />}

              <div className="border-t border-gray-200 pt-2 mt-2">
                <SummaryRow label="Subtotal" value={<span className="font-semibold">{formatCurrency(calc.sub, form.currency)}</span>} />
                {calc.vatPct > 0 && <SummaryRow label={`VAT (${calc.vatPct}%)`} value={formatCurrency(calc.vatAmt, form.currency)} />}
              </div>

              <div className="border-t-2 border-gray-900 pt-3 mt-2 flex justify-between">
                <span className="font-bold text-gray-900">TOTAL</span>
                <span className="font-bold text-xl text-gray-900">{formatCurrency(calc.total, form.currency)}</span>
              </div>
            </div>

            {calc.otHours > 0 && (
              <Alert
                type="warning"
                message={`${calc.otHours.toFixed(1)} OT hrs at ${formatCurrency(parseFloat(form.overtimeRate) || 0, form.currency)}/hr`}
                className="mb-4"
              />
            )}

            <div className="space-y-2 mt-2">
              <Button variant="primary" className="w-full justify-center" onClick={saveAsQuote}>
                <FileText size={15} /> Save as Quote
              </Button>
              <Button variant="secondary" className="w-full justify-center" onClick={saveAsInvoice}>
                <Receipt size={15} /> Save as Invoice
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
