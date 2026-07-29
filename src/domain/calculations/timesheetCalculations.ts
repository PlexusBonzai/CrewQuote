export type CalculationOTRuleId = "sa-film" | "sa-bcea" | "custom";
export type CalculationTurnaroundMode = "warning" | "penalty" | "manual";

export interface CalculationProfile {
  defaultCurrency: string;
  defaultDayRate: number;
  defaultIncludedHours: number;
  defaultEquipmentRental: number;
  defaultPerDiem: number;
  defaultVat: number;
  defaultOvertimeRule: CalculationOTRuleId;
  defaultOtBand1Hours: number;
  defaultOtBand1Mult: number;
  defaultOtBand2Mult: number;
  defaultMinTurnaround: number;
  defaultTurnaroundMode: CalculationTurnaroundMode;
  defaultTurnaroundPenMult: number;
  mealBreaksDeducted: boolean;
  travelTimePaid: boolean;
  equipmentRentalDaily: boolean;
  vatRegistered: boolean;
}

export interface CalculationTimesheet {
  currency?: string;
  vat?: number;
  defaultDayRate?: number;
  defaultIncludedHours?: number;
  defaultEquipmentRental?: number;
  defaultPerDiem?: number;
  defaultOvertimeRule?: CalculationOTRuleId;
  defaultOtBand1Hours?: number;
  defaultOtBand1Mult?: number;
  defaultOtBand2Mult?: number;
  defaultMinTurnaround?: number;
  defaultTurnaroundMode?: CalculationTurnaroundMode;
  defaultTurnaroundPenMult?: number;
  mealBreaksDeducted?: boolean;
  travelTimePaid?: boolean;
  equipmentRentalDaily?: boolean;
}

export interface CalculationEntry {
  id?: string;
  date?: string;
  callTime?: string;
  wrapTime?: string;
  mealBreakMinutes?: number;
  mealDeducted?: boolean;
  travelStartTime?: string;
  travelEndTime?: string;
  travelDistance?: string;
  travelPaid?: boolean;
  dayRate?: number;
  includedHours?: number;
  overtimeRule?: CalculationOTRuleId;
  otBand1Hours?: number;
  otBand1Mult?: number;
  otBand2Mult?: number;
  equipmentRental?: number;
  perDiem?: number;
  expenses?: number;
  expenseDescription?: string;
  dayRateUsed?: number;
  includedHoursUsed?: number;
  overtimeRuleUsed?: CalculationOTRuleId;
  otBand1HoursUsed?: number;
  otBand1MultUsed?: number;
  otBand2MultUsed?: number;
  equipmentRentalUsed?: number;
  perDiemUsed?: number;
  vatRateUsed?: number;
  travelPaidUsed?: boolean;
  mealDeductedUsed?: boolean;
  turnaroundRuleUsed?: CalculationTurnaroundMode;
  turnaroundMinimumHoursUsed?: number;
  turnaroundPenaltyMultUsed?: number;
}

export function num(v: unknown, def = 0) { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : def; }
export const toMins = (t: string) => { if (!t) return 0; const [h = 0, m = 0] = (t + ":0").split(":").map(Number); return h * 60 + m; };
export const durH = (s: string, e: string) => { let sm = toMins(s), em = toMins(e); if (em <= sm) em += 1440; return Math.max((em - sm) / 60, 0); };

export function getOTBands(ruleId: CalculationOTRuleId, profile: CalculationProfile): { band1Hours: number; band1Mult: number; band2Mult: number } {
  if (ruleId === "sa-film") return { band1Hours: 4, band1Mult: 1.5, band2Mult: 2.0 };
  if (ruleId === "sa-bcea") return { band1Hours: 9999, band1Mult: 1.5, band2Mult: 1.5 };
  return { band1Hours: profile.defaultOtBand1Hours ?? 4, band1Mult: profile.defaultOtBand1Mult ?? 1.5, band2Mult: profile.defaultOtBand2Mult ?? 2.0 };
}

const parseDateOnly = (d?: string) => { if (!d) return null; const dt = new Date(`${d}T12:00:00`); return Number.isNaN(dt.getTime()) ? null : dt; };
const parseTimeParts = (t?: string) => { if (!t) return null; const [hRaw, mRaw = "0"] = t.split(":"); const h = Number(hRaw), m = Number(mRaw); if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null; return { h, m }; };
export const entryCallDateTime = (e: CalculationEntry) => { const d = parseDateOnly(e.date); const t = parseTimeParts(e.callTime); if (!d || !t) return null; d.setHours(t.h, t.m, 0, 0); return d; };
export const entryWrapDateTime = (e: CalculationEntry) => { const call = entryCallDateTime(e); const t = parseTimeParts(e.wrapTime); if (!call || !t) return null; const wrap = new Date(call); wrap.setHours(t.h, t.m, 0, 0); if (wrap.getTime() <= call.getTime()) wrap.setDate(wrap.getDate() + 1); return wrap; };
export const sortEntriesForTurnaround = <T extends CalculationEntry>(entries: T[]) => [...entries].map((entry, index) => ({ entry, index, start: entryCallDateTime(entry)?.getTime() })).sort((a, b) => (a.start ?? Number.POSITIVE_INFINITY) - (b.start ?? Number.POSITIVE_INFINITY) || a.index - b.index).map(({ entry }) => entry);
export const calcTurnaround = (prev: CalculationEntry, next: CalculationEntry) => { const prevWrap = entryWrapDateTime(prev); const nextCall = entryCallDateTime(next); if (!prevWrap || !nextCall) return null; return Math.max((nextCall.getTime() - prevWrap.getTime()) / 3600000, 0); };

export function profileForTimesheet<P extends CalculationProfile>(profile: P, ts?: CalculationTimesheet): P {
  if (!ts) return profile;
  return { ...profile, defaultCurrency: ts.currency || profile.defaultCurrency, defaultDayRate: num(ts.defaultDayRate, profile.defaultDayRate), defaultIncludedHours: num(ts.defaultIncludedHours, profile.defaultIncludedHours), defaultEquipmentRental: num(ts.defaultEquipmentRental, profile.defaultEquipmentRental), defaultPerDiem: num(ts.defaultPerDiem, profile.defaultPerDiem), defaultVat: num(ts.vat, profile.defaultVat), defaultOvertimeRule: ts.defaultOvertimeRule || profile.defaultOvertimeRule, defaultOtBand1Hours: num(ts.defaultOtBand1Hours, profile.defaultOtBand1Hours), defaultOtBand1Mult: num(ts.defaultOtBand1Mult, profile.defaultOtBand1Mult), defaultOtBand2Mult: num(ts.defaultOtBand2Mult, profile.defaultOtBand2Mult), defaultMinTurnaround: num(ts.defaultMinTurnaround, profile.defaultMinTurnaround), defaultTurnaroundMode: ts.defaultTurnaroundMode || profile.defaultTurnaroundMode, defaultTurnaroundPenMult: num(ts.defaultTurnaroundPenMult, profile.defaultTurnaroundPenMult), mealBreaksDeducted: ts.mealBreaksDeducted ?? profile.mealBreaksDeducted, travelTimePaid: ts.travelTimePaid ?? profile.travelTimePaid, equipmentRentalDaily: ts.equipmentRentalDaily ?? profile.equipmentRentalDaily } as P;
}

export function calcDay(e: CalculationEntry, profile: CalculationProfile) {
  try { const call = e.callTime || "08:00"; const wrap = e.wrapTime || "18:00"; const onSetH = durH(call, wrap); const overnight = toMins(wrap) <= toMins(call); const mealDeducted = e.mealDeductedUsed ?? e.mealDeducted ?? profile.mealBreaksDeducted ?? true; const travelPaid = e.travelPaidUsed ?? e.travelPaid ?? profile.travelTimePaid ?? true; const mealH = mealDeducted ? Math.max(num(e.mealBreakMinutes) / 60, 0) : 0; const workH = Math.max(onSetH - mealH, 0); const travH = travelPaid && e.travelStartTime && e.travelEndTime ? durH(e.travelStartTime, e.travelEndTime) : 0; const paidH = workH + travH; const dayRate = num(e.dayRateUsed ?? e.dayRate, profile.defaultDayRate ?? 0); const incH = Math.max(num(e.includedHoursUsed ?? e.includedHours, profile.defaultIncludedHours ?? 10), 1); const baseHourly = dayRate / incH; const ruleId = (e.overtimeRuleUsed || e.overtimeRule || profile.defaultOvertimeRule || "sa-film") as CalculationOTRuleId; const ovEntry = { defaultOtBand1Hours: num(e.otBand1HoursUsed ?? e.otBand1Hours, profile.defaultOtBand1Hours ?? 4), defaultOtBand1Mult: num(e.otBand1MultUsed ?? e.otBand1Mult, profile.defaultOtBand1Mult ?? 1.5), defaultOtBand2Mult: num(e.otBand2MultUsed ?? e.otBand2Mult, profile.defaultOtBand2Mult ?? 2.0) }; const bands = getOTBands(ruleId, { ...profile, ...ovEntry }); const totalOtH = Math.max(paidH - incH, 0); const b1H = Math.min(totalOtH, bands.band1Hours); const b2H = Math.max(totalOtH - bands.band1Hours, 0); const b1Cost = b1H * baseHourly * bands.band1Mult; const b2Cost = b2H * baseHourly * bands.band2Mult; const totalOtCost = b1Cost + b2Cost; const equip = num(e.equipmentRentalUsed ?? e.equipmentRental, profile.equipmentRentalDaily ? profile.defaultEquipmentRental : 0); const perDiem = num(e.perDiemUsed ?? e.perDiem, profile.defaultPerDiem ?? 0); const expenses = num(e.expenses, 0); const total = dayRate + totalOtCost + equip + perDiem + expenses; return { onSetH, overnight, mealH, workH, travH, paidH, incH, baseHourly, totalOtH, b1H, b1Cost, b2H, b2Cost, totalOtCost, equip, perDiem, expenses, dayRate, total, ruleId, bands }; } catch { return { onSetH: 0, overnight: false, mealH: 0, workH: 0, travH: 0, paidH: 0, incH: 10, baseHourly: 0, totalOtH: 0, b1H: 0, b1Cost: 0, b2H: 0, b2Cost: 0, totalOtCost: 0, equip: 0, perDiem: 0, expenses: 0, dayRate: 0, total: 0, ruleId: "sa-film" as CalculationOTRuleId, bands: { band1Hours: 4, band1Mult: 1.5, band2Mult: 2.0 } }; }
}

export function calcSummary<T extends CalculationEntry>(entries: T[], profile: CalculationProfile) { const sortedEntries = sortEntriesForTurnaround(entries || []); const calcs = sortedEntries.map((e, i) => { const c = calcDay(e, profile); const prev = i > 0 ? sortedEntries[i - 1] : undefined; const turnaround = prev ? calcTurnaround(prev, e) : null; const minTR = num(e.turnaroundMinimumHoursUsed, profile.defaultMinTurnaround || 10); const trMode = (e.turnaroundRuleUsed || profile.defaultTurnaroundMode || "warning") as CalculationTurnaroundMode; const shortfall = turnaround !== null ? Math.max(minTR - turnaround, 0) : 0; const turnaroundPenalty = trMode === "penalty" ? shortfall * (c.baseHourly || 0) * num(e.turnaroundPenaltyMultUsed, profile.defaultTurnaroundPenMult || 1) : 0; const vatRate = profile.vatRegistered ? num(e.vatRateUsed, profile.defaultVat) : 0; const totalWithPenalty = c.total + turnaroundPenalty; return { entry: e, c: { ...c, turnaround, turnaroundPenalty, totalWithPenalty, vatRate, vatAmount: totalWithPenalty * (vatRate / 100) } }; }); const totalDays = calcs.length; const totalDayRates = calcs.reduce((s, { c }) => s + (c.dayRate || 0), 0); const totalOtCost = calcs.reduce((s, { c }) => s + (c.totalOtCost || 0), 0); const totalOtH = calcs.reduce((s, { c }) => s + (c.totalOtH || 0), 0); const totalEquip = calcs.reduce((s, { c }) => s + (c.equip || 0), 0); const totalPerDiem = calcs.reduce((s, { c }) => s + (c.perDiem || 0), 0); const totalExp = calcs.reduce((s, { c }) => s + (c.expenses || 0), 0); const totalTurnaroundPenalty = calcs.reduce((s, { c }) => s + (c.turnaroundPenalty || 0), 0); const totalPaidH = calcs.reduce((s, { c }) => s + (c.paidH || 0), 0); const totalTravH = calcs.reduce((s, { c }) => s + (c.travH || 0), 0); const subtotal = totalDayRates + totalOtCost + totalEquip + totalPerDiem + totalExp + totalTurnaroundPenalty; const vatRates = [...new Set(calcs.map(({ c }) => c.vatRate || 0))]; const vatPct = vatRates.length === 1 ? vatRates[0] : (profile.vatRegistered ? num(profile.defaultVat) : 0); const mixedVat = vatRates.length > 1; const vatAmt = calcs.reduce((s, { c }) => s + (c.vatAmount || 0), 0); const grandTotal = subtotal + vatAmt; return { calcs, totalDays, totalDayRates, totalOtCost, totalOtH, totalEquip, totalPerDiem, totalExp, totalTurnaroundPenalty, totalPaidH, totalTravH, subtotal, vatPct, mixedVat, vatAmt, grandTotal }; }
