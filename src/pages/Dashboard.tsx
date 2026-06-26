import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  DollarSign, AlertCircle, FileText, Clock, Receipt, ArrowUpRight,
} from 'lucide-react'
import { useApp }            from '@/context/AppContext'
import { formatCurrency }    from '@/utils/currency'
import { formatDate }        from '@/utils/date'
import { calculateTimesheetSummary } from '@/utils/calculations'
import { INVOICE_STATUSES }  from '@/constants'
import { Card, StatCard, Badge } from '@/components/ui'

// ── Helpers ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Dashboard() {
  const { quotes, invoices, timesheets, settings } = useApp()
  const nav = useNavigate()
  const cur = settings.defaultCurrency || 'ZAR'

  const metrics = useMemo(() => {
    const paid        = invoices.filter(i => i.status === 'paid')
    const unpaid      = invoices.filter(i => i.status === 'unpaid')
    const revenue     = paid.reduce((s, i) => s + (i.total || 0), 0)
    const outstanding = unpaid.reduce((s, i) => s + (i.total || 0), 0)
    const uninvoiced  = timesheets.filter(t => !t.invoiceId).length

    const year = new Date().getFullYear()
    const chartData = MONTHS.map((m, idx) => ({
      m,
      rev: paid
        .filter(i => {
          const d = new Date(i.issueDate || i.createdAt)
          return d.getFullYear() === year && d.getMonth() === idx
        })
        .reduce((s, i) => s + (i.total || 0), 0),
    }))

    return { revenue, outstanding, uninvoiced, unpaidCount: unpaid.length, chartData }
  }, [invoices, timesheets])

  // Recent activity feed
  const recent = useMemo(() => [
    ...quotes.map(q => ({ type: 'quote'     as const, id: q.id, num: q.quoteNumber,      name: q.client || '—',              date: q.createdAt, total: q.total,    cur: q.currency })),
    ...invoices.map(i => ({ type: 'invoice'  as const, id: i.id, num: i.invoiceNumber,     name: i.clientName || '—',           date: i.createdAt, total: i.total,    cur: i.currency })),
    ...timesheets.map(t => ({ type: 'timesheet' as const, id: t.id, num: t.timesheetNumber, name: t.productionName || '—',       date: t.createdAt, total: calculateTimesheetSummary(t, settings).grandTotal, cur: t.currency })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8), [quotes, invoices, timesheets, settings])

  const typeStyle = {
    quote:     { label: 'Quote',     className: 'bg-blue-100 text-blue-700',   icon: FileText },
    invoice:   { label: 'Invoice',   className: 'bg-green-100 text-green-700', icon: Receipt  },
    timesheet: { label: 'Timesheet', className: 'bg-purple-100 text-purple-700', icon: Clock  },
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Welcome back{settings.crewName ? `, ${settings.crewName}` : ''}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(metrics.revenue, cur)}
          subtitle="From paid invoices"
          icon={DollarSign}
          color="green"
        />
        <StatCard
          title="Outstanding"
          value={formatCurrency(metrics.outstanding, cur)}
          subtitle={`${metrics.unpaidCount} unpaid invoice${metrics.unpaidCount !== 1 ? 's' : ''}`}
          icon={AlertCircle}
          color="amber"
        />
        <StatCard
          title="Quotes"
          value={quotes.length}
          subtitle="Total created"
          icon={FileText}
          color="blue"
        />
        <StatCard
          title="Timesheets"
          value={timesheets.length}
          subtitle={`${metrics.uninvoiced} not invoiced`}
          icon={Clock}
          color="purple"
        />
      </div>

      {/* Chart + Invoice overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue This Year</h3>
          {metrics.revenue === 0 ? (
            <div className="flex items-center justify-center h-44 text-gray-400 text-sm">
              No paid invoices yet — mark invoices as paid to see revenue here.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={metrics.chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v, cur), 'Revenue']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="rev"
                  stroke="#2563EB"
                  fill="#EFF6FF"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Invoice Status</h3>
          <div className="space-y-3">
            {Object.entries(INVOICE_STATUSES).map(([key, cfg]) => {
              const count = invoices.filter(i => i.status === key).length
              const total = invoices.filter(i => i.status === key).reduce((s, i) => s + (i.total || 0), 0)
              return (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={cfg.color}>{cfg.label}</Badge>
                    <span className="text-xs text-gray-400">{count}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(total, cur)}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={() => nav('/invoices')}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              View all invoices <ArrowUpRight size={13} />
            </button>
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Activity</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No activity yet. Create a quote, invoice, or timesheet to get started.
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map((item, i) => {
              const cfg  = typeStyle[item.type]
              const Icon = cfg.icon
              return (
                <div
                  key={`${item.type}-${item.id}-${i}`}
                  className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                  onClick={() => nav(`/${item.type}s`)}
                >
                  <div className={`p-2 rounded-lg ${cfg.className}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.num}
                      {item.name && item.name !== '—' && (
                        <span className="text-gray-400 font-normal"> — {item.name}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {cfg.label} · {formatDate(item.date)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 flex-shrink-0">
                    {formatCurrency(item.total || 0, item.cur)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
