import { useState } from 'react'
import { Check, Info } from 'lucide-react'
import { useApp }      from '@/context/AppContext'
import { CURRENCIES, DEFAULT_BANKING } from '@/constants'
import {
  Button, Input, Select, Textarea, Card, Alert, Tabs, PageHeader,
} from '@/components/ui'
import type { UserSettings, Currency } from '@/types'

const SETTING_TABS = [
  { id: 'profile',     label: 'Your Profile' },
  { id: 'defaults',    label: 'Defaults'     },
  { id: 'banking',     label: 'Banking'      },
  { id: 'preferences', label: 'Preferences'  },
]

export default function Settings() {
  const { settings, updateSettings } = useApp()

  const [f, setF] = useState<UserSettings>({
    ...settings,
    bankingDetails: { ...DEFAULT_BANKING, ...settings.bankingDetails },
  })

  const [tab,   setTab]   = useState('profile')
  const [saved, setSaved] = useState(false)

  const set   = (k: keyof UserSettings, v: string | number | boolean) =>
    setF(p => ({ ...p, [k]: v }))

  const setBD = (k: string, v: string) =>
    setF(p => ({ ...p, bankingDetails: { ...p.bankingDetails, [k]: v } }))

  const handleSave = () => {
    updateSettings(f)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const sym = CURRENCIES[f.defaultCurrency as Currency]?.symbol || '$'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        subtitle="Configure your profile, default rates, and banking details"
        actions={
          saved ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium">
              <Check size={14} /> Saved
            </span>
          ) : (
            <Button onClick={handleSave}>Save Settings</Button>
          )
        }
      />

      <Tabs tabs={SETTING_TABS} active={tab} onChange={setTab} />

      <div className="max-w-2xl">

        {/* ── Profile ── */}
        {tab === 'profile' && (
          <Card className="p-5 space-y-4">
            <Input
              label="Company / Freelancer Name"
              value={f.companyName}
              onChange={e => set('companyName', e.target.value)}
              placeholder="Your company name or full name"
              hint="Appears on all quotes and invoices"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Your Name"
                value={f.crewName}
                onChange={e => set('crewName', e.target.value)}
                placeholder="Full name"
              />
              <Input
                label="Role / Department"
                value={f.role}
                onChange={e => set('role', e.target.value)}
                placeholder="e.g. Sound Mixer, DIT, Gaffer"
              />
              <Input
                label="Email"
                type="email"
                value={f.email}
                onChange={e => set('email', e.target.value)}
                placeholder="you@example.com"
              />
              <Input
                label="Phone"
                type="tel"
                value={f.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+27 82 000 0000"
              />
            </div>

            <Textarea
              label="Address"
              value={f.address}
              onChange={e => set('address', e.target.value)}
              rows={2}
              placeholder="Street address, city, postal code"
            />

            <Input
              label="VAT / GST Registration Number"
              value={f.vatNumber}
              onChange={e => set('vatNumber', e.target.value)}
              placeholder="Your registered VAT or tax number"
            />
          </Card>
        )}

        {/* ── Defaults ── */}
        {tab === 'defaults' && (
          <Card className="p-5 space-y-4">
            <Alert
              type="info"
              message="These values auto-fill when you create a new quote, invoice, or timesheet."
            />

            <Select
              label="Default Currency"
              value={f.defaultCurrency}
              onChange={e => set('defaultCurrency', e.target.value as Currency)}
            >
              {Object.entries(CURRENCIES).map(([k, v]) => (
                <option key={k} value={k}>{v.flag} {k} — {v.name}</option>
              ))}
            </Select>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Default VAT %"
                type="number"
                value={f.defaultVat}
                onChange={e => set('defaultVat', parseFloat(e.target.value) || 0)}
                placeholder="0"
                min="0"
                max="100"
              />
              <Input
                label="Included Hours / Day (before OT)"
                type="number"
                value={f.defaultIncludedHours}
                onChange={e => set('defaultIncludedHours', parseFloat(e.target.value) || 10)}
                placeholder="10"
                min="1"
              />
              <Input
                label={`Default OT Rate / hr (${sym})`}
                type="number"
                value={f.defaultOvertimeRate}
                onChange={e => set('defaultOvertimeRate', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                min="0"
              />
              <Input
                label="Minimum Turnaround (hours)"
                type="number"
                value={f.defaultMinTurnaround}
                onChange={e => set('defaultMinTurnaround', parseFloat(e.target.value) || 10)}
                placeholder="10"
                min="1"
                hint="Warning shown when turnaround is below this"
              />
            </div>
          </Card>
        )}

        {/* ── Banking ── */}
        {tab === 'banking' && (
          <Card className="p-5 space-y-4">
            <Alert
              type="info"
              message="These details appear on every invoice you create. Keep them accurate."
            />

            <Input
              label="Account Name"
              value={f.bankingDetails.accountName}
              onChange={e => setBD('accountName', e.target.value)}
              placeholder="Name on the account"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Bank Name"
                value={f.bankingDetails.bankName}
                onChange={e => setBD('bankName', e.target.value)}
                placeholder="e.g. Standard Bank"
              />
              <Input
                label="Account Number"
                value={f.bankingDetails.accountNumber}
                onChange={e => setBD('accountNumber', e.target.value)}
              />
              <Input
                label="Branch / Sort Code"
                value={f.bankingDetails.branchCode}
                onChange={e => setBD('branchCode', e.target.value)}
                placeholder="e.g. 051001"
              />
              <Input
                label="SWIFT / BIC Code"
                value={f.bankingDetails.swiftCode}
                onChange={e => setBD('swiftCode', e.target.value)}
                placeholder="International transfers"
              />
              <Input
                label="IBAN"
                value={f.bankingDetails.iban}
                onChange={e => setBD('iban', e.target.value)}
                placeholder="European accounts"
              />
              <Input
                label="Default Payment Reference"
                value={f.bankingDetails.reference}
                onChange={e => setBD('reference', e.target.value)}
                placeholder="e.g. Invoice number"
              />
            </div>
          </Card>
        )}

        {/* ── Preferences ── */}
        {tab === 'preferences' && (
          <Card className="p-5 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Timesheet Defaults</h3>
              <p className="text-sm text-gray-500 mb-4">
                These settings apply to all new timesheets. Each timesheet can override them individually.
              </p>

              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={f.travelTimePaid}
                    onChange={e => set('travelTimePaid', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                      Travel time is paid
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Travel hours will be added to paid hours when calculating overtime
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={f.mealBreaksDeducted}
                    onChange={e => set('mealBreaksDeducted', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                      Meal breaks are deducted
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Meal break duration is subtracted from working hours before calculating paid time
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-start gap-2 text-sm text-gray-500">
                <Info size={15} className="mt-0.5 flex-shrink-0 text-blue-400" />
                <p>
                  CrewQuote Pro doesn't hard-code any union or labour rules. All settings are
                  fully configurable to match the terms of your production or country.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Save button (bottom) */}
        <div className="mt-4 flex justify-end">
          <Button onClick={handleSave} size="lg">
            {saved ? <><Check size={16} /> Saved!</> : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
