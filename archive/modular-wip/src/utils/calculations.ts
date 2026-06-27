import { durationHours, calculateTurnaround } from './time'
import type {
  TimesheetEntry,
  TimesheetSettings,
  EntryCalc,
  Timesheet,
  TimesheetSummary,
  UserSettings,
} from '@/types'

// ── Rate Calculator ────────────────────────────────────────────────────────

export interface RateCalcInput {
  dayRate: number
  hoursWorked: number
  includedHours: number
  overtimeRate: number
  equipmentRental: number
  additionalExpenses: number
  vatPercent: number
}

export interface RateCalcResult {
  dayRate: number
  overtimeHours: number
  overtimeCost: number
  equipmentRental: number
  additionalExpenses: number
  subtotal: number
  vatAmount: number
  total: number
}

export function calculateRates(input: RateCalcInput): RateCalcResult {
  const {
    dayRate, hoursWorked, includedHours, overtimeRate,
    equipmentRental, additionalExpenses, vatPercent,
  } = input

  const overtimeHours  = Math.max(hoursWorked - includedHours, 0)
  const overtimeCost   = overtimeHours * overtimeRate
  const subtotal       = dayRate + overtimeCost + equipmentRental + additionalExpenses
  const vatAmount      = subtotal * (vatPercent / 100)
  const total          = subtotal + vatAmount

  return { dayRate, overtimeHours, overtimeCost, equipmentRental, additionalExpenses, subtotal, vatAmount, total }
}

// ── Timesheet Entry ────────────────────────────────────────────────────────

/**
 * Calculate all derived values for a single timesheet day entry.
 * Handles overnight shoots, meal deductions, and optional travel.
 */
export function calculateEntry(
  entry: TimesheetEntry,
  settings: Partial<TimesheetSettings> & Partial<UserSettings> = {}
): EntryCalc {
  const mealDeducted = settings.mealBreaksDeducted !== false
  const travelPaid   = settings.travelTimePaid     !== false

  // On-set duration: handles overnight (e.g. call 22:00, wrap 06:00 = 8h)
  const onSet = durationHours(entry.callTime || '08:00', entry.wrapTime || '18:00')
  const meal  = mealDeducted ? (entry.mealBreakMinutes || 0) / 60 : 0
  const work  = onSet - meal

  // Travel time only counted if setting is enabled and times are provided
  const trav = travelPaid && entry.travelStartTime && entry.travelEndTime
    ? durationHours(entry.travelStartTime, entry.travelEndTime)
    : 0

  const paid   = work + trav
  const inc    = entry.includedHours || 10
  const otH    = Math.max(paid - inc, 0)
  const otR    = entry.overtimeRate || 0
  const otC    = otH * otR

  const total =
    (entry.dayRate         || 0) +
    otC +
    (entry.equipmentRental || 0) +
    (entry.perDiem         || 0) +
    (entry.otherExpenses   || 0)

  return { onSet, meal, work, trav, paid, otH, otC, total }
}

// ── Timesheet Summary ──────────────────────────────────────────────────────

/**
 * Calculate a complete summary for a timesheet, including per-entry calculations
 * and turnaround warnings.
 */
export function calculateTimesheetSummary(
  ts: Timesheet,
  globalSettings: Partial<UserSettings> = {}
): TimesheetSummary {
  const tsSettings: Partial<TimesheetSettings> = ts.settings || {}
  const effectiveSettings = { ...globalSettings, ...tsSettings }
  const minTurnaround = parseFloat(String(tsSettings.minTurnaroundHours || globalSettings.defaultMinTurnaround || 10))

  const entries = ts.entries || []
  const warnings: string[] = []

  const results = entries.map((entry, i) => {
    const calc = calculateEntry(entry, effectiveSettings)

    // Calculate turnaround from previous day
    let turnaround: number | null = null
    let twarn: string | null = null

    if (i > 0) {
      const prev = entries[i - 1]
      turnaround = calculateTurnaround(prev.wrapTime, entry.callTime)

      if (turnaround !== null && turnaround < minTurnaround) {
        const shortBy = (minTurnaround - turnaround).toFixed(1)
        twarn = `Short turnaround: ${turnaround.toFixed(1)}h — ${shortBy}h below ${minTurnaround}h minimum`
        warnings.push(`${entry.date || `Day ${i + 1}`}: ${twarn}`)
      }
    }

    return { ...entry, ...calc, turnaround, twarn }
  })

  const totalDayRates = entries.reduce((s, e) => s + (e.dayRate         || 0), 0)
  const totalOtCost   = results.reduce((s, e) => s + (e.otC             || 0), 0)
  const totalEq       = entries.reduce((s, e) => s + (e.equipmentRental || 0), 0)
  const totalPD       = entries.reduce((s, e) => s + (e.perDiem         || 0), 0)
  const totalOther    = entries.reduce((s, e) => s + (e.otherExpenses   || 0), 0)
  const totalPaidH    = results.reduce((s, e) => s + (e.paid            || 0), 0)
  const totalOtH      = results.reduce((s, e) => s + (e.otH             || 0), 0)
  const totalTravH    = results.reduce((s, e) => s + (e.trav            || 0), 0)

  const subtotal  = totalDayRates + totalOtCost + totalEq + totalPD + totalOther
  const vatPct    = parseFloat(String(ts.vat || 0))
  const vatAmt    = subtotal * (vatPct / 100)
  const grandTotal = subtotal + vatAmt

  return {
    results,
    totalDays: entries.length,
    totalDayRates,
    totalOtCost,
    totalEq,
    totalPD,
    totalOther,
    totalPaidH,
    totalOtH,
    totalTravH,
    subtotal,
    vatPct,
    vatAmt,
    grandTotal,
    warnings,
  }
}

// ── Document Totals ────────────────────────────────────────────────────────

export interface LineItem {
  id: string
  description: string
  quantity: number
  rate: number
  amount: number
}

export function calculateDocumentTotals(
  lineItems: LineItem[],
  vatPercent: number
): { subtotal: number; vatAmount: number; total: number } {
  const subtotal  = lineItems.reduce((s, i) => s + (i.amount || 0), 0)
  const vatAmount = subtotal * (vatPercent / 100)
  return { subtotal, vatAmount, total: subtotal + vatAmount }
}
