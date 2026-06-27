import { useState } from 'react'
import { Plus, Edit, Trash2, Users } from 'lucide-react'
import { useApp }         from '@/context/AppContext'
import { formatCurrency } from '@/utils/currency'
import { generateId }     from '@/utils/generators'
import { CURRENCIES }     from '@/constants'
import {
  Button, Input, Select, Textarea, Card, PageHeader, EmptyState,
} from '@/components/ui'
import type { CrewProfile, Currency } from '@/types'

const BLANK: Omit<CrewProfile, 'id'> = {
  name: '', role: '', dayRate: 0, overtimeRate: 0,
  includedHours: 10, equipmentPackage: 0, currency: 'ZAR', notes: '',
}

export default function Profiles() {
  const { profiles, settings, updateProfiles } = useApp()

  const [editing, setEditing] = useState<CrewProfile | null>(null)
  const [f, setF] = useState<Omit<CrewProfile, 'id'>>({
    ...BLANK,
    currency: settings.defaultCurrency || 'ZAR',
  })

  const set = (k: string, v: string | number) => setF(p => ({ ...p, [k]: v }))
  const num = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, parseFloat(e.target.value) || 0)

  const startNew = () => {
    setEditing(null)
    setF({ ...BLANK, currency: settings.defaultCurrency || 'ZAR' })
  }

  const startEdit = (p: CrewProfile) => {
    setEditing(p)
    setF({
      name:             p.name             || '',
      role:             p.role             || '',
      dayRate:          p.dayRate          || 0,
      overtimeRate:     p.overtimeRate     || 0,
      includedHours:    p.includedHours    || 10,
      equipmentPackage: p.equipmentPackage || 0,
      currency:         p.currency         || 'ZAR',
      notes:            p.notes            || '',
    })
  }

  const cancel = () => {
    setEditing(null)
    setF({ ...BLANK, currency: settings.defaultCurrency || 'ZAR' })
  }

  const save = () => {
    if (!f.name.trim()) return
    const profile: CrewProfile = { ...f, id: editing?.id || generateId() }
    updateProfiles(
      editing
        ? profiles.map(p => p.id === profile.id ? profile : p)
        : [...profiles, profile]
    )
    cancel()
  }

  const del = (id: string) => {
    if (confirm('Delete this profile?')) updateProfiles(profiles.filter(p => p.id !== id))
  }

  const sym = CURRENCIES[f.currency as Currency]?.symbol || '$'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Crew Profiles"
        subtitle="Save crew rates — load them in the Calculator to auto-fill"
        actions={
          !editing
            ? <Button onClick={startNew}><Plus size={15} /> New Profile</Button>
            : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* ── Form panel ── */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {editing ? `Edit: ${editing.name}` : 'New Profile'}
          </h3>

          <div className="space-y-3">
            <Input
              label="Name"
              value={f.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. John Smith"
              required
            />
            <Input
              label="Role"
              value={f.role}
              onChange={e => set('role', e.target.value)}
              placeholder="e.g. Sound Mixer"
            />
            <Select
              label="Currency"
              value={f.currency}
              onChange={e => set('currency', e.target.value)}
            >
              {Object.entries(CURRENCIES).map(([k, v]) => (
                <option key={k} value={k}>{v.flag} {k} — {v.name}</option>
              ))}
            </Select>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label={`Day Rate (${sym})`}
                type="number"
                value={f.dayRate || ''}
                onChange={num('dayRate')}
                placeholder="0.00"
                min="0"
              />
              <Input
                label={`OT Rate / hr (${sym})`}
                type="number"
                value={f.overtimeRate || ''}
                onChange={num('overtimeRate')}
                placeholder="0.00"
                min="0"
              />
              <Input
                label="Included Hours"
                type="number"
                value={f.includedHours}
                onChange={num('includedHours')}
                min="1"
              />
              <Input
                label={`Equipment / day (${sym})`}
                type="number"
                value={f.equipmentPackage || ''}
                onChange={num('equipmentPackage')}
                placeholder="0.00"
                min="0"
              />
            </div>

            <Textarea
              label="Notes"
              value={f.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Any notes about this profile…"
            />

            <div className="flex gap-2 pt-1">
              <Button
                variant="primary"
                className="flex-1 justify-center"
                onClick={save}
              >
                {editing ? 'Update Profile' : 'Save Profile'}
              </Button>
              {editing && (
                <Button variant="secondary" onClick={cancel}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* ── Profile cards ── */}
        <div className="lg:col-span-2">
          {profiles.length === 0 ? (
            <Card>
              <EmptyState
                icon={Users}
                title="No profiles yet"
                description="Save your standard rates as profiles to fill the Calculator in one click."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {profiles.map(p => {
                const psym = CURRENCIES[p.currency as Currency]?.symbol || '$'
                return (
                  <Card key={p.id} className="p-5">
                    {/* Card header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-[15px] truncate">{p.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{p.role || '—'}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={() => startEdit(p)}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => del(p.id)}
                          className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Rate grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      {[
                        ['Day Rate',       formatCurrency(p.dayRate,          p.currency as Currency)],
                        ['OT Rate / hr',   formatCurrency(p.overtimeRate,     p.currency as Currency)],
                        ['Included Hours', `${p.includedHours}h`],
                        p.equipmentPackage > 0
                          ? ['Equipment / day', formatCurrency(p.equipmentPackage, p.currency as Currency)]
                          : null,
                      ].filter(Boolean).map(([label, value]) => (
                        <div key={label as string}>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                            {label}
                          </p>
                          <p className="text-sm font-semibold text-gray-900 mt-0.5">{value as string}</p>
                        </div>
                      ))}
                    </div>

                    {p.notes && (
                      <p className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 line-clamp-2">
                        {p.notes}
                      </p>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
