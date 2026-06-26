import { useState, useMemo } from 'react'
import { Plus, Trash2, Download, Clock, Receipt, AlertTriangle } from 'lucide-react'
import { useApp }               from '@/context/AppContext'
import { formatCurrency }       from '@/utils/currency'
import { formatDate, today }    from '@/utils/date'
import { hoursToHM }            from '@/utils/time'
import { calculateTimesheetSummary, calculateEntry } from '@/utils/calculations'
import { generateId, generateTimesheetNumber, generateInvoiceNumber } from '@/utils/generators'
import { openTimesheetPDF }     from '@/services/pdf'
import { CURRENCIES, TIMESHEET_STATUSES } from '@/constants'
import {
  Button, Input, Select, Textarea, Card, Badge, PageHeader, EmptyState, Alert, Tabs,
} from '@/components/ui'
import type { Timesheet, TimesheetEntry, Currency, Invoice } from '@/types'

type View = 'list' | 'setup' | 'detail'

// ── Timesheet Setup Form ───────────────────────────────────────────────────

function TimesheetSetup({
  onSave, onBack,
}: { onSave: (ts: Timesheet) => void; onBack: () => void }) {
  const { timesheets, settings } = useApp()

  const [f, setF] = useState({
    crewName:      settings.crewName || '',
    role:          settings.role     || '',
    productionName: '',
    currency:      (settings.defaultCurrency || 'ZAR') as Currency,
    vat:           String(settings.defaultVat || 0),
  })

  const [s, setS] = useState({
    includedHoursPerDay:  settings.defaultIncludedHours || 10,
    minTurnaroundHours:   settings.defaultMinTurnaround || 10,
    travelTimePaid:       settings.travelTimePaid !== false,
    mealBreaksDeducted:   settings.mealBreaksDeducted !== false,
    overtimeRate:         settings.defaultOvertimeRate || 0,
  })

  const set  = (k: string, v: string | boolean | number) => setF(p => ({ ...p, [k]: v }))
  const setS2= (k: string, v: string | boolean | number) => setS(p => ({ ...p, [k]: v }))

  const create = () => {
    onSave({
      id:              generateId(),
      timesheetNumber: generateTimesheetNumber(timesheets),
      crewName:        f.crewName,
      role:            f.role,
      productionName:  f.productionName,
      currency:        f.currency,
      vat:             parseFloat(f.vat) || 0,
      status:          'open',
      entries:         [],
      settings: {
        includedHoursPerDay:  parseFloat(String(s.includedHoursPerDay)) || 10,
        minTurnaroundHours:   parseFloat(String(s.minTurnaroundHours))  || 10,
        travelTimePaid:       s.travelTimePaid,
        mealBreaksDeducted:   s.mealBreaksDeducted,
        overtimeRate:         parseFloat(String(s.overtimeRate))  || 0,
      },
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="New Timesheet"
        subtitle="Set up a production timesheet"
        back
        onBack={onBack}
        actions={
          <Button onClick={create}>
            Create Timesheet →
          </Button>
        }
      />

      <div className="max-w-2xl space-y-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Timesheet Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Crew Name"       value={f.crewName}        onChange={e => set('crewName', e.target.value)} />
            <Input label="Role"            value={f.role}            onChange={e => set('role',     e.target.value)} placeholder="e.g. Sound Mixer" />
            <Input label="Production Name" value={f.productionName}  onChange={e => set('productionName', e.target.value)} placeholder="Film / series name" className="sm:col-span-2" />
            <Select label="Currency" value={f.currency} onChange={e => set('currency', e.target.value as Currency)}>
              {Object.entries(CURRENCIES).map(([k, v]) => (
                <option key={k} value={k}>{v.flag} {k}</option>
              ))}
            </Select>
            <Input label="VAT %" type="number" value={f.vat} onChange={e => set('vat', e.target.value)} placeholder="0" />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Default Settings</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Input label="Included Hours / Day"          type="number" value={String(s.includedHoursPerDay)} onChange={e => setS2('includedHoursPerDay', e.target.value)} />
            <Input label={`Default OT Rate / hr (${CURRENCIES[f.currency]?.symbol})`} type="number" value={String(s.overtimeRate)} onChange={e => setS2('overtimeRate', e.target.value)} placeholder="0.00" />
            <Input label="Min Turnaround (hrs)"          type="number" value={String(s.minTurnaroundHours)}  onChange={e => setS2('minTurnaroundHours', e.target.value)} />
          </div>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={s.travelTimePaid} onChange={e => setS2('travelTimePaid', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Travel time is paid</p>
                <p className="text-xs text-gray-400">Travel hours will be added to paid hours</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={s.mealBreaksDeducted} onChange={e => setS2('mealBreaksDeducted', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Meal breaks are deducted</p>
                <p className="text-xs text-gray-400">Meal break duration subtracted from working hours</p>
              </div>
            </label>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ── Day Entry Form ─────────────────────────────────────────────────────────

function DayEntryForm({ ts, onAddEntry, currency }: {
  ts: Timesheet
  onAddEntry: (entry: TimesheetEntry) => void
  currency: Currency
}) {
  const sym = CURRENCIES[currency]?.symbol || '$'
  const defRate = ts.settings?.overtimeRate || 0
  const defInc  = ts.settings?.includedHoursPerDay || 10

  const [e, setE] = useState<Partial<TimesheetEntry>>({
    date:               today(),
    location:           '',
    callTime:           '08:00',
    wrapTime:           '18:00',
    mealBreakMinutes:   60,
    travelStartTime:    '',
    travelEndTime:      '',
    travelDistance:     0,
    notes:              '',
    dayRate:            0,
    includedHours:      defInc,
    overtimeRate:       defRate,
    equipmentRental:    0,
    perDiem:            0,
    otherExpenses:      0,
  })

  const upd = (k: string, v: string | number) => setE(p => ({ ...p, [k]: v }))
  const numUpd = (k: string) => (ev: React.ChangeEvent<HTMLInputElement>) => upd(k, parseFloat(ev.target.value) || 0)
  const calc = useMemo(() => calculateEntry(e as TimesheetEntry, ts.settings || {}), [e, ts.settings])

  const addDay = () => {
    onAddEntry({ id: generateId(), ...e } as TimesheetEntry)
    setE(p => ({ ...p, date: '', location: '', notes: '', travelStartTime: '', travelEndTime: '' }))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Day Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Date"     type="date" value={e.date || ''} onChange={ev => upd('date', ev.target.value)} />
            <Input label="Location" value={e.location || ''} onChange={ev => upd('location', ev.target.value)} placeholder="Set / studio location" />
            <Input label="Call Time (24h)" type="time" value={e.callTime || '08:00'} onChange={ev => upd('callTime', ev.target.value)} />
            <Input label="Wrap Time (24h)" type="time" value={e.wrapTime || '18:00'} onChange={ev => upd('wrapTime', ev.target.value)} />
            <Input label="Meal Break (minutes)" type="number" value={String(e.mealBreakMinutes ?? 60)} onChange={numUpd('mealBreakMinutes')} />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Travel</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Travel Start" type="time" value={e.travelStartTime || ''} onChange={ev => upd('travelStartTime', ev.target.value)} />
            <Input label="Travel End"   type="time" value={e.travelEndTime   || ''} onChange={ev => upd('travelEndTime',   ev.target.value)} />
            <Input label="Distance (km)" type="number" value={String(e.travelDistance || 0)} onChange={numUpd('travelDistance')} placeholder="0" />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Rates & Costs</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={`Day Rate (${sym})`}            type="number" value={String(e.dayRate || '')}           onChange={numUpd('dayRate')}          placeholder="0.00" />
            <Input label="Included Hours"                  type="number" value={String(e.includedHours ?? defInc)} onChange={numUpd('includedHours')} />
            <Input label={`OT Rate / hr (${sym})`}        type="number" value={String(e.overtimeRate ?? defRate)}  onChange={numUpd('overtimeRate')}     placeholder="0.00" />
            <Input label={`Equipment Rental (${sym})`}    type="number" value={String(e.equipmentRental || '')}   onChange={numUpd('equipmentRental')}  placeholder="0.00" />
            <Input label={`Per Diem (${sym})`}            type="number" value={String(e.perDiem || '')}           onChange={numUpd('perDiem')}          placeholder="0.00" />
            <Input label={`Other Expenses (${sym})`}      type="number" value={String(e.otherExpenses || '')}     onChange={numUpd('otherExpenses')}    placeholder="0.00" />
          </div>
          <div className="mt-4">
            <Textarea label="Notes" value={e.notes || ''} onChange={ev => upd('notes', ev.target.value)} rows={2} placeholder="Shoot notes…" />
          </div>
        </Card>
      </div>

      {/* Live preview */}
      <div>
        <Card className="p-5 sticky top-20">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Day Preview</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600"><span>On-set</span><span>{hoursToHM(calc.onSet)}</span></div>
            {calc.meal > 0 && <div className="flex justify-between text-gray-600"><span>Meal deduction</span><span className="text-red-500">−{hoursToHM(calc.meal)}</span></div>}
            {calc.trav > 0 && <div className="flex justify-between text-gray-600"><span>Travel</span><span className="text-blue-500">+{hoursToHM(calc.trav)}</span></div>}
            <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-100">
              <span>Paid Hours</span><span>{hoursToHM(calc.paid)}</span>
            </div>
            {calc.otH > 0 && (
              <Alert type="warning" message={`${hoursToHM(calc.otH)} OT @ ${formatCurrency(Number(e.overtimeRate) || 0, currency)}/hr`} className="my-2" />
            )}
            <div className="border-t border-gray-100 pt-2 space-y-1">
              <div className="flex justify-between text-gray-600"><span>Day Rate</span><span>{formatCurrency(Number(e.dayRate) || 0, currency)}</span></div>
              {calc.otC  > 0 && <div className="flex justify-between text-gray-600"><span>Overtime</span><span>{formatCurrency(calc.otC, currency)}</span></div>}
              {Number(e.equipmentRental) > 0 && <div className="flex justify-between text-gray-600"><span>Equipment</span><span>{formatCurrency(Number(e.equipmentRental), currency)}</span></div>}
              {Number(e.perDiem)         > 0 && <div className="flex justify-between text-gray-600"><span>Per Diem</span><span>{formatCurrency(Number(e.perDiem), currency)}</span></div>}
              {Number(e.otherExpenses)   > 0 && <div className="flex justify-between text-gray-600"><span>Other</span><span>{formatCurrency(Number(e.otherExpenses), currency)}</span></div>}
            </div>
            <div className="border-t-2 border-gray-900 pt-2.5 flex justify-between font-bold text-gray-900">
              <span>Day Total</span><span className="text-lg">{formatCurrency(calc.total, currency)}</span>
            </div>
          </div>
          <Button variant="primary" className="w-full justify-center mt-4" onClick={addDay}>
            <Plus size={15} /> Add This Day
          </Button>
        </Card>
      </div>
    </div>
  )
}

// ── Timesheet Detail ───────────────────────────────────────────────────────

function TimesheetDetail({
  ts, onBack, onUpdate, onCreateInvoice, onExport,
}: {
  ts: Timesheet
  onBack: () => void
  onUpdate: (ts: Timesheet) => void
  onCreateInvoice: (ts: Timesheet, summary: ReturnType<typeof calculateTimesheetSummary>) => void
  onExport: (ts: Timesheet, summary: ReturnType<typeof calculateTimesheetSummary>) => void
}) {
  const { settings } = useApp()
  const [tab, setTab] = useState('add')
  const summary = useMemo(() => calculateTimesheetSummary(ts, settings), [ts, settings])
  const cur = ts.currency || 'ZAR'
  const sym = CURRENCIES[cur]?.symbol || '$'

  const addEntry  = (entry: TimesheetEntry) => onUpdate({ ...ts, entries: [...ts.entries, entry] })
  const delEntry  = (id: string)            => onUpdate({ ...ts, entries: ts.entries.filter(e => e.id !== id) })
  const statusCfg = TIMESHEET_STATUSES[ts.status] || TIMESHEET_STATUSES.open

  const TABS = [
    { id: 'add',     label: 'Add Day'                                  },
    { id: 'weekly',  label: 'Weekly',  count: ts.entries.length        },
    { id: 'summary', label: 'Summary'                                  },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title={ts.timesheetNumber}
        subtitle={ts.productionName || 'Untitled Production'}
        back
        onBack={onBack}
        actions={
          <>
            <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
            <Button variant="secondary" onClick={() => onExport(ts, summary)}>
              <Download size={15} /> Export PDF
            </Button>
            {ts.status !== 'invoiced' && (
              <Button variant="success" onClick={() => onCreateInvoice(ts, summary)}>
                <Receipt size={15} /> Create Invoice
              </Button>
            )}
          </>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* Add Day */}
      {tab === 'add' && (
        <DayEntryForm ts={ts} onAddEntry={addEntry} currency={cur} />
      )}

      {/* Weekly Table */}
      {tab === 'weekly' && (
        ts.entries.length === 0 ? (
          <Card>
            <EmptyState icon={Clock} title="No days added yet" description='Switch to "Add Day" to enter shoot days.' />
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    {['Date', 'Location', 'Call', 'Wrap', 'Meal', 'Travel', 'Paid Hrs', 'OT Hrs', 'Day Total', ''].map((h, i) => (
                      <th key={i} className={`px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider ${i >= 6 ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {summary.results.map((e, i) => (
                    <>
                      <tr key={e.id || i} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-medium">{formatDate(e.date)}</td>
                        <td className="px-3 py-2.5 text-gray-500 max-w-[120px] truncate">{e.location || '—'}</td>
                        <td className="px-3 py-2.5">{e.callTime || '—'}</td>
                        <td className="px-3 py-2.5">{e.wrapTime || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-500">{e.mealBreakMinutes || 0}m</td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{e.trav > 0 ? hoursToHM(e.trav) : '—'}</td>
                        <td className="px-3 py-2.5 text-right font-medium">{hoursToHM(e.paid || 0)}</td>
                        <td className={`px-3 py-2.5 text-right font-medium ${e.otH > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                          {e.otH > 0 ? hoursToHM(e.otH) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold">{formatCurrency(e.total, cur)}</td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => delEntry(e.id)} className="p-1 text-gray-300 hover:text-red-500 rounded">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                      {e.twarn && (
                        <tr key={`warn-${i}`}>
                          <td colSpan={10} className="px-3 py-1">
                            <div className="flex items-center gap-1.5 text-amber-600 text-xs">
                              <AlertTriangle size={12} />
                              {e.twarn}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}

      {/* Summary */}
      {tab === 'summary' && (
        <div className="space-y-4">
          {/* Turnaround warnings */}
          {summary.warnings.map((w, i) => (
            <Alert key={i} type="warning" message={w} />
          ))}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Hours */}
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Hours Summary</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600"><span>Total Days</span><span className="font-medium text-gray-900">{summary.totalDays}</span></div>
                <div className="flex justify-between text-gray-600"><span>Total Paid Hours</span><span className="font-medium text-gray-900">{hoursToHM(summary.totalPaidH)}</span></div>
                <div className="flex justify-between text-gray-600"><span>Normal Hours</span><span className="font-medium text-gray-900">{hoursToHM(summary.totalPaidH - summary.totalOtH)}</span></div>
                {summary.totalOtH > 0 && (
                  <div className="flex justify-between"><span className="text-gray-600">Overtime Hours</span><span className="font-semibold text-amber-600">{hoursToHM(summary.totalOtH)}</span></div>
                )}
                {summary.totalTravH > 0 && (
                  <div className="flex justify-between text-gray-600"><span>Travel Hours</span><span className="font-medium text-gray-900">{hoursToHM(summary.totalTravH)}</span></div>
                )}
              </div>
            </Card>

            {/* Costs */}
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Cost Summary</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600"><span>Day Rates</span><span>{formatCurrency(summary.totalDayRates, cur)}</span></div>
                {summary.totalOtCost > 0 && <div className="flex justify-between text-gray-600"><span>Overtime</span><span>{formatCurrency(summary.totalOtCost, cur)}</span></div>}
                {summary.totalEq    > 0 && <div className="flex justify-between text-gray-600"><span>Equipment</span><span>{formatCurrency(summary.totalEq, cur)}</span></div>}
                {summary.totalPD    > 0 && <div className="flex justify-between text-gray-600"><span>Per Diem</span><span>{formatCurrency(summary.totalPD, cur)}</span></div>}
                {summary.totalOther > 0 && <div className="flex justify-between text-gray-600"><span>Other</span><span>{formatCurrency(summary.totalOther, cur)}</span></div>}
                <div className="border-t border-gray-100 pt-2 flex justify-between text-gray-600">
                  <span>Subtotal</span><span className="font-semibold text-gray-900">{formatCurrency(summary.subtotal, cur)}</span>
                </div>
                {summary.vatPct > 0 && <div className="flex justify-between text-gray-600"><span>VAT ({ts.vat}%)</span><span>{formatCurrency(summary.vatAmt, cur)}</span></div>}
                <div className="border-t-2 border-gray-900 pt-2.5 flex justify-between font-bold text-gray-900 text-base">
                  <span>TOTAL DUE</span><span>{formatCurrency(summary.grandTotal, cur)}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => onExport(ts, summary)}>
              <Download size={15} /> Export PDF Timesheet
            </Button>
            {ts.status !== 'invoiced' && (
              <Button variant="success" onClick={() => onCreateInvoice(ts, summary)}>
                <Receipt size={15} /> Create Invoice from Timesheet
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Timesheets Page ────────────────────────────────────────────────────────

export default function Timesheets() {
  const { timesheets, invoices, settings, updateTimesheets, updateInvoices } = useApp()
  const [view, setView]         = useState<View>('list')
  const [selected, setSelected] = useState<Timesheet | null>(null)

  const create = ()              => { setSelected(null); setView('setup') }
  const back   = ()              => setView('list')

  const saveTS = (ts: Timesheet) => {
    updateTimesheets(
      timesheets.find(x => x.id === ts.id)
        ? timesheets.map(x => x.id === ts.id ? ts : x)
        : [...timesheets, ts]
    )
  }

  const del = (id: string) => {
    if (confirm('Delete this timesheet? This cannot be undone.')) {
      updateTimesheets(timesheets.filter(t => t.id !== id))
    }
  }

  const createInvoiceFromTS = (ts: Timesheet, summary: ReturnType<typeof calculateTimesheetSummary>) => {
    const li = [
      summary.totalDayRates > 0 && { id: generateId(), description: `Day Rates — ${summary.totalDays} day${summary.totalDays !== 1 ? 's' : ''}`, quantity: summary.totalDays, rate: summary.totalDayRates / summary.totalDays, amount: summary.totalDayRates },
      summary.totalOtCost   > 0 && { id: generateId(), description: `Overtime — ${hoursToHM(summary.totalOtH)}`, quantity: 1, rate: summary.totalOtCost, amount: summary.totalOtCost },
      summary.totalEq       > 0 && { id: generateId(), description: 'Equipment Rental',   quantity: 1, rate: summary.totalEq,    amount: summary.totalEq    },
      summary.totalPD       > 0 && { id: generateId(), description: 'Per Diem',            quantity: 1, rate: summary.totalPD,    amount: summary.totalPD    },
      summary.totalOther    > 0 && { id: generateId(), description: 'Additional Expenses', quantity: 1, rate: summary.totalOther, amount: summary.totalOther },
    ].filter(Boolean) as Invoice['lineItems']

    const inv: Invoice = {
      id: generateId(),
      invoiceNumber:  generateInvoiceNumber(invoices),
      companyName:    settings.companyName || '',
      issueDate:      today(),
      dueDate:        '',
      clientName:     ts.productionName || '',
      crewName:       ts.crewName        || '',
      role:           ts.role            || '',
      lineItems:      li,
      subtotal:       summary.subtotal,
      vat:            summary.vatPct,
      vatAmount:      summary.vatAmt,
      total:          summary.grandTotal,
      paymentNotes:   '',
      bankingDetails: { ...settings.bankingDetails },
      status:         'draft',
      currency:       ts.currency,
      fromTimesheetId: ts.id,
      createdAt:      new Date().toISOString(),
    }

    updateInvoices([...invoices, inv])
    const updated: Timesheet = { ...ts, status: 'invoiced', invoiceId: inv.id }
    saveTS(updated)
    setSelected(updated)
  }

  // Keep selected in sync with store
  const currentTS = selected ? timesheets.find(t => t.id === selected.id) || selected : null

  if (view === 'setup')            return <TimesheetSetup  onSave={ts => { saveTS(ts); setSelected(ts); setView('detail') }} onBack={back} />
  if (view === 'detail' && currentTS) return (
    <TimesheetDetail
      ts={currentTS}
      onBack={back}
      onUpdate={ts => { saveTS(ts); setSelected(ts) }}
      onCreateInvoice={createInvoiceFromTS}
      onExport={(ts, s) => openTimesheetPDF(ts, settings)}
    />
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Timesheets"
        subtitle={`${timesheets.length} timesheet${timesheets.length !== 1 ? 's' : ''}`}
        actions={
          <Button onClick={create}>
            <Plus size={15} /> New Timesheet
          </Button>
        }
      />

      <Card>
        {timesheets.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No timesheets yet"
            description="Track daily hours, overtime, travel, and expenses for any production."
            action={<Button onClick={create}><Plus size={15} /> Create Timesheet</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Timesheet #', 'Production', 'Crew', 'Days', 'Status', 'Total', ''].map((h, i) => (
                    <th key={i} className={`px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider ${i >= 5 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...timesheets]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map(ts => {
                    const summary = calculateTimesheetSummary(ts, settings)
                    const st = TIMESHEET_STATUSES[ts.status] || TIMESHEET_STATUSES.open
                    return (
                      <tr key={ts.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5">
                          <button onClick={() => { setSelected(ts); setView('detail') }} className="text-sm font-semibold text-blue-600 hover:text-blue-800">
                            {ts.timesheetNumber}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-700">{ts.productionName || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{ts.crewName || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{ts.entries.length}</td>
                        <td className="px-5 py-3.5"><Badge className={st.color}>{st.label}</Badge></td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 text-right">{formatCurrency(summary.grandTotal, ts.currency)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => { setSelected(ts); setView('detail') }} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Clock    size={15} /></button>
                            <button onClick={() => openTimesheetPDF(ts, settings)}         className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Download size={15} /></button>
                            <button onClick={() => del(ts.id)}                             className="p-1.5 rounded-md hover:bg-red-50  text-gray-400 hover:text-red-600"><Trash2   size={15} /></button>
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
