import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
import {
  Clock, Receipt, Settings, Film, Plus, ChevronLeft, Trash2,
  AlertTriangle, CheckCircle, Moon, ChevronDown, ChevronUp,
  Save, Zap, Copy, FileText, Info
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type OTRuleId        = "sa-film" | "sa-bcea" | "custom";
type TurnaroundMode  = "warning" | "penalty" | "manual";
type ToastType       = "success" | "error" | "info";

interface ToastMsg { id: string; msg: string; type: ToastType; }

interface TimesheetEntry {
  id: string;
  date: string;
  productionName: string;
  location: string;
  notes: string;
  callTime: string;
  wrapTime: string;
  mealBreakMinutes: number;
  mealDeducted: boolean;
  travelStartTime: string;
  travelEndTime: string;
  travelDistance: string;
  travelPaid: boolean;
  dayRate: number;
  includedHours: number;
  overtimeRule: OTRuleId;
  otBand1Hours: number;
  otBand1Mult: number;
  otBand2Mult: number;
  equipmentRental: number;
  perDiem: number;
  expenses: number;
  isSunday: boolean;
  isPublicHoliday: boolean;
}

interface Timesheet {
  id: string;
  timesheetNumber: string;
  productionName: string;
  crewName: string;
  role: string;
  currency: string;
  vat: number;
  status: "open" | "submitted" | "invoiced";
  entries: TimesheetEntry[];
  invoiceId?: string;
  createdAt: string;
}

interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  isExtra?: boolean;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  clientName: string;
  crewName: string;
  role: string;
  companyName: string;
  timesheetNumber: string;
  lineItems: InvoiceLine[];
  subtotal: number;
  vat: number;
  vatAmount: number;
  total: number;
  currency: string;
  status: "draft" | "unpaid" | "paid";
  banking: Record<string, string>;
  paymentNotes: string;
  fromTimesheetId: string;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// OT RULE PRESETS
// ═══════════════════════════════════════════════════════════════════════════

const OT_PRESETS: Record<OTRuleId, { name: string; desc: string }> = {
  "sa-film":  { name: "SA Film / Commercial Standard", desc: "First 4 OT hrs @ 1.5×, remaining @ 2×" },
  "sa-bcea":  { name: "SA BCEA Basic",                  desc: "All OT @ 1.5×" },
  "custom":   { name: "Custom Rule",                    desc: "Define your own overtime bands" },
};

function getOTBands(ruleId: OTRuleId, profile: Profile): { band1Hours: number; band1Mult: number; band2Mult: number } {
  if (ruleId === "sa-film") return { band1Hours: 4,    band1Mult: 1.5, band2Mult: 2.0 };
  if (ruleId === "sa-bcea") return { band1Hours: 9999, band1Mult: 1.5, band2Mult: 1.5 };
  return { band1Hours: profile.defaultOtBand1Hours ?? 4, band1Mult: profile.defaultOtBand1Mult ?? 1.5, band2Mult: profile.defaultOtBand2Mult ?? 2.0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PROFILE = {
  fullName: "", role: "", companyName: "", email: "", phone: "", address: "", vatNumber: "",
  defaultCurrency:          "ZAR",
  defaultDayRate:           0,
  defaultIncludedHours:     10,
  defaultEquipmentRental:   0,
  defaultPerDiem:           0,
  defaultVat:               0,
  defaultOvertimeRule:      "sa-film" as OTRuleId,
  defaultOtBand1Hours:      4,
  defaultOtBand1Mult:       1.5,
  defaultOtBand2Mult:       2.0,
  defaultMinTurnaround:     10,
  defaultTurnaroundMode:    "warning" as TurnaroundMode,
  defaultTurnaroundPenMult: 1.5,
  mealBreaksDeducted:       true,
  travelTimePaid:           true,
  equipmentRentalDaily:     true,
  bankAccountName: "", bankName: "", bankAccountNumber: "",
  bankBranchCode:  "", bankSwift:  "", bankIban: "", bankReference: "",
};
type Profile = typeof DEFAULT_PROFILE;

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const Store = {
  async get(k: string) {
    try { const r = await (window as any).storage.get(k); return r?.value ? JSON.parse(r.value) : null; }
    catch { return null; }
  },
  async set(k: string, v: unknown) {
    try { await (window as any).storage.set(k, JSON.stringify(v)); } catch {}
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const toMins     = (t: string) => { if (!t) return 0; const [h = 0, m = 0] = (t + ":0").split(":").map(Number); return h * 60 + m; };
const durH       = (s: string, e: string) => { let sm = toMins(s), em = toMins(e); if (em <= sm) em += 1440; return Math.max((em - sm) / 60, 0); };
const hoursToHM  = (h: number) => { const n = Math.abs(h ?? 0); const hrs = Math.floor(n); const m = Math.round((n - hrs) * 60); return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`; };
const safe       = (v: unknown, def = 0) => parseFloat(String(v ?? def)) || def;
const uid        = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const todayStr   = () => new Date().toISOString().split("T")[0];
const nextDayStr = (d: string) => { try { const dt = new Date(d + "T12:00:00"); dt.setDate(dt.getDate() + 1); return dt.toISOString().split("T")[0]; } catch { return todayStr(); } };
const fmtDate    = (d: string) => { if (!d) return "—"; try { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d + "T12:00:00")); } catch { return d; } };
const fmtMoney   = (n: unknown, cur = "ZAR") => {
  const sym = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[cur] || "R";
  const locale = { ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "de-DE" }[cur] || "en-ZA";
  return `${sym} ${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(String(n ?? 0)) || 0)}`;
};
const calcTurnaround = (prevWrap: string, nextCall: string) => {
  if (!prevWrap || !nextCall) return null;
  let w = toMins(prevWrap), n = toMins(nextCall);
  if (n <= w) n += 1440;
  return (n - w) / 60;
};

/** Core per-day calculation — FULLY DEFENSIVE, never throws */
function calcDay(e: Partial<TimesheetEntry>, profile: Profile) {
  try {
    const call  = e.callTime    || "08:00";
    const wrap  = e.wrapTime    || "18:00";
    const onSetH    = durH(call, wrap);
    const overnight = toMins(wrap) <= toMins(call);
    const mealDeducted = e.mealDeducted ?? profile.mealBreaksDeducted ?? true;
    const travelPaid   = e.travelPaid   ?? profile.travelTimePaid     ?? true;
    const mealH = mealDeducted ? Math.max(safe(e.mealBreakMinutes) / 60, 0) : 0;
    const workH = Math.max(onSetH - mealH, 0);
    const travH = travelPaid && e.travelStartTime && e.travelEndTime ? durH(e.travelStartTime, e.travelEndTime) : 0;
    const paidH = workH + travH;
    const dayRate     = safe(e.dayRate,       profile.defaultDayRate       ?? 0);
    const incH        = Math.max(safe(e.includedHours, profile.defaultIncludedHours ?? 10), 1);
    const baseHourly  = dayRate / incH;
    const ruleId      = (e.overtimeRule || profile.defaultOvertimeRule || "sa-film") as OTRuleId;
    const ovEntry     = { defaultOtBand1Hours: safe(e.otBand1Hours, profile.defaultOtBand1Hours ?? 4), defaultOtBand1Mult: safe(e.otBand1Mult, profile.defaultOtBand1Mult ?? 1.5), defaultOtBand2Mult: safe(e.otBand2Mult, profile.defaultOtBand2Mult ?? 2.0) };
    const bands       = getOTBands(ruleId, { ...profile, ...ovEntry } as Profile);
    const totalOtH    = Math.max(paidH - incH, 0);
    const b1H         = Math.min(totalOtH, bands.band1Hours);
    const b2H         = Math.max(totalOtH - bands.band1Hours, 0);
    const b1Cost      = b1H * baseHourly * bands.band1Mult;
    const b2Cost      = b2H * baseHourly * bands.band2Mult;
    const totalOtCost = b1Cost + b2Cost;
    const equip    = safe(e.equipmentRental, profile.equipmentRentalDaily ? profile.defaultEquipmentRental : 0);
    const perDiem  = safe(e.perDiem,  profile.defaultPerDiem  ?? 0);
    const expenses = safe(e.expenses, 0);
    const total    = dayRate + totalOtCost + equip + perDiem + expenses;
    return { onSetH, overnight, mealH, workH, travH, paidH, incH, baseHourly, totalOtH, b1H, b1Cost, b2H, b2Cost, totalOtCost, equip, perDiem, expenses, dayRate, total, ruleId, bands };
  } catch {
    return { onSetH: 0, overnight: false, mealH: 0, workH: 0, travH: 0, paidH: 0, incH: 10, baseHourly: 0, totalOtH: 0, b1H: 0, b1Cost: 0, b2H: 0, b2Cost: 0, totalOtCost: 0, equip: 0, perDiem: 0, expenses: 0, dayRate: 0, total: 0, ruleId: "sa-film" as OTRuleId, bands: { band1Hours: 4, band1Mult: 1.5, band2Mult: 2.0 } };
  }
}

function calcSummary(entries: TimesheetEntry[], profile: Profile) {
  const calcs        = (entries || []).map(e => ({ entry: e, c: calcDay(e, profile) }));
  const totalDays    = calcs.length;
  const totalDayRates = calcs.reduce((s, { c }) => s + (c.dayRate    || 0), 0);
  const totalOtCost  = calcs.reduce((s, { c }) => s + (c.totalOtCost || 0), 0);
  const totalOtH     = calcs.reduce((s, { c }) => s + (c.totalOtH    || 0), 0);
  const totalEquip   = calcs.reduce((s, { c }) => s + (c.equip       || 0), 0);
  const totalPerDiem = calcs.reduce((s, { c }) => s + (c.perDiem     || 0), 0);
  const totalExp     = calcs.reduce((s, { c }) => s + (c.expenses    || 0), 0);
  const totalPaidH   = calcs.reduce((s, { c }) => s + (c.paidH       || 0), 0);
  const totalTravH   = calcs.reduce((s, { c }) => s + (c.travH       || 0), 0);
  const subtotal     = totalDayRates + totalOtCost + totalEquip + totalPerDiem + totalExp;
  const vatPct       = safe(profile.defaultVat);
  const vatAmt       = subtotal * (vatPct / 100);
  const grandTotal   = subtotal + vatAmt;
  return { calcs, totalDays, totalDayRates, totalOtCost, totalOtH, totalEquip, totalPerDiem, totalExp, totalPaidH, totalTravH, subtotal, vatPct, vatAmt, grandTotal };
}

const genTSNum  = (list: Timesheet[]) => { const yr = new Date().getFullYear(); return `T-${yr}-${String((list || []).filter(t => t?.timesheetNumber?.startsWith(`T-${yr}`)).length + 1).padStart(4, "0")}`; };
const genINVNum = (list: Invoice[])   => { const yr = new Date().getFullYear(); return `I-${yr}-${String((list || []).filter(i => i?.invoiceNumber?.startsWith(`I-${yr}`)).length + 1).padStart(4, "0")}`; };

/** Default fields for a new entry, auto-filled from profile */
const entryDefaults = (profile: Profile, prev?: TimesheetEntry, prodName?: string): Omit<TimesheetEntry, "id"> => ({
  date:             prev ? nextDayStr(prev.date) : todayStr(),
  productionName:   prodName || prev?.productionName || "",
  location:         "",
  notes:            "",
  callTime:         "08:00",
  wrapTime:         "18:00",
  mealBreakMinutes: 60,
  mealDeducted:     profile.mealBreaksDeducted,
  travelStartTime:  "",
  travelEndTime:    "",
  travelDistance:   "",
  travelPaid:       profile.travelTimePaid,
  dayRate:          profile.defaultDayRate,
  includedHours:    profile.defaultIncludedHours,
  overtimeRule:     profile.defaultOvertimeRule,
  otBand1Hours:     profile.defaultOtBand1Hours,
  otBand1Mult:      profile.defaultOtBand1Mult,
  otBand2Mult:      profile.defaultOtBand2Mult,
  equipmentRental:  profile.equipmentRentalDaily ? profile.defaultEquipmentRental : 0,
  perDiem:          profile.defaultPerDiem,
  expenses:         0,
  isSunday:         false,
  isPublicHoliday:  false,
});

/** Duplicate previous day (keep rates/location, clear times/notes) */
const duplicateEntry = (prev: TimesheetEntry, currentDate: string): Omit<TimesheetEntry, "id"> => ({
  ...prev,
  date:             currentDate,
  callTime:         "08:00",
  wrapTime:         "18:00",
  notes:            "",
  travelStartTime:  "",
  travelEndTime:    "",
  travelDistance:   "",
  expenses:         0,
});

// ═══════════════════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════

const Fld = ({ label, hint, children }: { label?: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>}
    {children}
    {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
  </div>
);

const base = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors";

const Inp = ({ label, hint, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) =>
  <Fld label={label} hint={hint}><input className={base} {...p} /></Fld>;

const TInp = ({ label, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) =>
  <Fld label={label}><input className={`${base} font-mono text-[15px] font-semibold`} type="time" {...p} /></Fld>;

const SInp = ({ label, hint, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string; children: React.ReactNode }) =>
  <Fld label={label} hint={hint}><select className={base} {...p}>{children}</select></Fld>;

const TxInp = ({ label, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) =>
  <Fld label={label}><textarea className={`${base} resize-none`} {...p} /></Fld>;

const Tog = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex items-start justify-between gap-4 cursor-pointer py-2 select-none">
    <div><p className="text-sm font-medium text-gray-800">{label}</p>{hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}</div>
    <div className="flex-shrink-0" onClick={() => onChange(!checked)}
      style={{ width: 40, height: 22, background: checked ? "#2563EB" : "#D1D5DB", borderRadius: 11, position: "relative", cursor: "pointer", transition: "background .2s" }}>
      <div style={{ position: "absolute", width: 18, height: 18, background: "#fff", borderRadius: "50%", top: 2, left: checked ? 20 : 2, transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
    </div>
  </label>
);

const Btn = ({ children, variant = "primary", size = "md", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => {
  const v: Record<string, string> = { primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm", secondary: "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm", ghost: "hover:bg-gray-100 text-gray-600", success: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm", danger: "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200", amber: "bg-amber-500 hover:bg-amber-600 text-white shadow-sm" };
  const s: Record<string, string> = { xs: "px-2.5 py-1 text-xs rounded-md", sm: "px-3 py-1.5 text-xs rounded-md", md: "px-4 py-2 text-sm rounded-lg", lg: "px-5 py-2.5 text-sm rounded-xl" };
  return <button className={`inline-flex items-center gap-2 font-medium transition-colors ${v[variant] || v.primary} ${s[size] || s.md} disabled:opacity-40 disabled:cursor-not-allowed ${className}`} {...p}>{children}</button>;
};

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) =>
  <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>{children}</div>;

const Badge = ({ children, color = "gray" }: { children: React.ReactNode; color?: string }) => {
  const c: Record<string, string> = { gray: "bg-gray-100 text-gray-700", blue: "bg-blue-100 text-blue-700", green: "bg-green-100 text-green-700", amber: "bg-amber-100 text-amber-800", purple: "bg-purple-100 text-purple-700", red: "bg-red-100 text-red-700" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c[color] || c.gray}`}>{children}</span>;
};

const SRow = ({ label, value, bold, amber, indent }: { label: string; value: React.ReactNode; bold?: boolean; amber?: boolean; indent?: boolean }) => (
  <div className={`flex justify-between text-sm py-0.5 ${indent ? "pl-3" : ""} ${bold ? "font-bold text-gray-900 pt-2" : "text-gray-600"}`}>
    <span>{label}</span>
    <span className={`tabular-nums ${amber ? "text-amber-600 font-semibold" : bold ? "text-gray-900" : "font-medium text-gray-900"}`}>{value}</span>
  </div>
);

const AlertBox = ({ type = "info", children }: { type?: string; children: React.ReactNode }) => {
  const t: Record<string, string> = { info: "bg-blue-50 border-blue-200 text-blue-800", warning: "bg-amber-50 border-amber-200 text-amber-900", success: "bg-green-50 border-green-200 text-green-800", error: "bg-red-50 border-red-200 text-red-800" };
  const I: Record<string, React.ElementType> = { info: Info, warning: AlertTriangle, success: CheckCircle, error: AlertTriangle };
  const Icon = I[type] || Info;
  return <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-sm ${t[type] || t.info}`}><Icon size={15} className="flex-shrink-0 mt-0.5" /><div>{children}</div></div>;
};

// ═══════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════

function ToastContainer({ toasts }: { toasts: ToastMsg[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium min-w-64 max-w-sm animate-pulse ${t.type === "success" ? "bg-emerald-600 text-white" : t.type === "error" ? "bg-red-600 text-white" : "bg-slate-800 text-white"}`}>
          {t.type === "success" ? <CheckCircle size={16} /> : t.type === "error" ? <AlertTriangle size={16} /> : <Info size={16} />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════

function SettingsPage({ profile, onSave }: { profile: Profile; onSave: (p: Profile) => void }) {
  const [f, setF] = useState<Profile>({ ...DEFAULT_PROFILE, ...profile });
  const [tab, setTab] = useState("profile");
  const [saved, setSaved] = useState(false);
  const set  = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const setN = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }));
  const setT = (k: keyof Profile) => (v: boolean) => setF(p => ({ ...p, [k]: v }));
  const save = () => { onSave(f); setSaved(true); setTimeout(() => setSaved(false), 2500); };
  const sym  = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[f.defaultCurrency] || "R";
  const isCustom = f.defaultOvertimeRule === "custom";
  const TABS = [["profile", "Your Profile"], ["rates", "Default Rates"], ["overtime", "Overtime & Turnaround"], ["timesheet", "Timesheet"], ["banking", "Banking"]];

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">Settings</h1><p className="text-sm text-gray-500 mt-0.5">Set your details once — they auto-fill every timesheet.</p></div>
        {saved ? <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 text-sm font-medium rounded-lg border border-green-200"><CheckCircle size={14} /> Saved</span>
               : <Btn onClick={save}><Save size={14} /> Save Settings</Btn>}
      </div>

      <div className="flex border-b border-gray-200 overflow-x-auto">
        {TABS.map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {lbl}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {tab === "profile" && (
          <div className="space-y-4">
            <Inp label="Full Name"             value={f.fullName}    onChange={set("fullName")}    placeholder="Your full name" />
            <div className="grid grid-cols-2 gap-4">
              <Inp label="Role"                 value={f.role}        onChange={set("role")}        placeholder="e.g. Sound Mixer" />
              <Inp label="Company / Trading Name" value={f.companyName} onChange={set("companyName")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Inp label="Email" type="email"   value={f.email}       onChange={set("email")} />
              <Inp label="Phone" type="tel"     value={f.phone}       onChange={set("phone")} />
            </div>
            <TxInp label="Address"             value={f.address}     onChange={set("address")} rows={2} placeholder="Street, city, postal code" />
            <Inp label="VAT / Tax Number"       value={f.vatNumber}   onChange={set("vatNumber")} placeholder="Your VAT registration number" />
          </div>
        )}

        {tab === "rates" && (
          <div className="space-y-4">
            <AlertBox type="info">These rates auto-fill every timesheet day. Overtime is calculated automatically from your day rate and included hours.</AlertBox>
            <SInp label="Default Currency" value={f.defaultCurrency} onChange={set("defaultCurrency")}>
              {[["ZAR","South African Rand"],["USD","US Dollar"],["GBP","British Pound"],["EUR","Euro"]].map(([k,n]) => <option key={k} value={k}>{k} — {n}</option>)}
            </SInp>
            <div className="grid grid-cols-2 gap-4">
              <Inp label={`Day Rate (${sym})`}       type="number" value={f.defaultDayRate      || ""} onChange={setN("defaultDayRate")}      placeholder="0.00" min="0" />
              <Inp label="Included Hours / Day"       type="number" value={f.defaultIncludedHours|| ""} onChange={setN("defaultIncludedHours")} placeholder="10"   min="1"
                hint="Hours included in your day rate. Overtime starts after this." />
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800">
              Base hourly rate: <strong>{fmtMoney(f.defaultDayRate && f.defaultIncludedHours ? f.defaultDayRate / f.defaultIncludedHours : 0, f.defaultCurrency)}/hr</strong>
              {f.defaultDayRate > 0 && f.defaultIncludedHours > 0 && ` (${fmtMoney(f.defaultDayRate, f.defaultCurrency)} ÷ ${f.defaultIncludedHours}h)`}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Inp label={`Equipment / day (${sym})`} type="number" value={f.defaultEquipmentRental || ""} onChange={setN("defaultEquipmentRental")} placeholder="0.00" min="0" />
              <Inp label={`Per Diem (${sym})`}        type="number" value={f.defaultPerDiem        || ""} onChange={setN("defaultPerDiem")}        placeholder="0.00" min="0" />
            </div>
            <Inp label="Invoice VAT %"               type="number" value={f.defaultVat           || ""} onChange={setN("defaultVat")}            placeholder="0"    min="0" max="100" />
          </div>
        )}

        {tab === "overtime" && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Overtime Rule Preset</p>
              <p className="text-xs text-gray-400 mb-3">Overtime is calculated automatically: Base rate = Day rate ÷ Included hours.</p>
              <div className="space-y-2">
                {(Object.entries(OT_PRESETS) as [OTRuleId, { name: string; desc: string }][]).map(([id, preset]) => (
                  <label key={id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${f.defaultOvertimeRule === id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="otRule" value={id} checked={f.defaultOvertimeRule === id}
                      onChange={() => setF(p => ({ ...p, defaultOvertimeRule: id }))} className="mt-0.5 text-blue-600" />
                    <div><p className="text-sm font-semibold text-gray-900">{preset.name}</p><p className="text-xs text-gray-500 mt-0.5">{preset.desc}</p></div>
                  </label>
                ))}
              </div>
            </div>

            {isCustom && (
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Custom Overtime Bands</p>
                <div className="grid grid-cols-3 gap-3">
                  <Inp label="Band 1 Length (hrs)" type="number" min="0" value={f.defaultOtBand1Hours || ""} onChange={setN("defaultOtBand1Hours")} placeholder="4" hint="First N OT hours" />
                  <Inp label="Band 1 Multiplier"   type="number" min="0" step="0.1" value={f.defaultOtBand1Mult || ""} onChange={setN("defaultOtBand1Mult")} placeholder="1.5" />
                  <Inp label="Band 2 Multiplier"   type="number" min="0" step="0.1" value={f.defaultOtBand2Mult || ""} onChange={setN("defaultOtBand2Mult")} placeholder="2.0" hint="After band 1" />
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Turnaround</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Inp label="Minimum Turnaround Hours" type="number" min="0" value={f.defaultMinTurnaround || ""} onChange={setN("defaultMinTurnaround")} placeholder="10" />
                <SInp label="When turnaround is short" value={f.defaultTurnaroundMode} onChange={set("defaultTurnaroundMode") as any}>
                  <option value="warning">Show warning only</option>
                  <option value="penalty">Charge penalty automatically</option>
                  <option value="manual">Manual approval required</option>
                </SInp>
              </div>
              {f.defaultTurnaroundMode === "penalty" && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-3">
                  <p className="text-xs text-amber-800">Shortfall hours × base hourly rate × penalty multiplier will be added to the day.</p>
                  <Inp label="Turnaround Penalty Multiplier" type="number" min="0" step="0.1" value={f.defaultTurnaroundPenMult || ""} onChange={setN("defaultTurnaroundPenMult")} placeholder="1.5" />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "timesheet" && (
          <div className="space-y-2">
            <div className="divide-y divide-gray-100">
              <Tog checked={f.mealBreaksDeducted}   onChange={setT("mealBreaksDeducted")}   label="Meal breaks are deducted"       hint="Meal break time is subtracted from on-set hours before calculating paid time" />
              <Tog checked={f.travelTimePaid}       onChange={setT("travelTimePaid")}       label="Travel time is paid"            hint="Travel hours count toward paid hours for overtime calculation" />
              <Tog checked={f.equipmentRentalDaily} onChange={setT("equipmentRentalDaily")} label="Equipment rental applies daily" hint="Your default equipment rental rate is added to every shoot day automatically" />
            </div>
          </div>
        )}

        {tab === "banking" && (
          <div className="space-y-4">
            <AlertBox type="info">These details appear on every invoice you generate.</AlertBox>
            <Inp label="Account Name"        value={f.bankAccountName}   onChange={set("bankAccountName")} />
            <div className="grid grid-cols-2 gap-4">
              <Inp label="Bank Name"          value={f.bankName}          onChange={set("bankName")} />
              <Inp label="Account Number"     value={f.bankAccountNumber} onChange={set("bankAccountNumber")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Inp label="Branch / Sort Code" value={f.bankBranchCode}   onChange={set("bankBranchCode")} />
              <Inp label="SWIFT / BIC"        value={f.bankSwift}        onChange={set("bankSwift")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Inp label="IBAN"              value={f.bankIban}         onChange={set("bankIban")} />
              <Inp label="Payment Reference" value={f.bankReference}    onChange={set("bankReference")} placeholder="e.g. Invoice number" />
            </div>
          </div>
        )}
      </Card>
      <div className="flex justify-end"><Btn onClick={save} size="lg"><Save size={15} /> Save Settings</Btn></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE CALC PANEL
// ═══════════════════════════════════════════════════════════════════════════

function LiveCalcPanel({ entry, profile, turnaround }: { entry: Partial<TimesheetEntry>; profile: Profile; turnaround: number | null }) {
  const cur    = profile.defaultCurrency || "ZAR";
  const c      = calcDay(entry, profile);
  const trMin  = profile.defaultMinTurnaround || 10;
  const trWarn = turnaround !== null && turnaround < trMin;
  const trShort = turnaround !== null ? trMin - turnaround : 0;

  return (
    <div className="rounded-xl border-2 border-blue-200 p-5 sticky top-5" style={{ background: "#F0F7FF" }}>
      <div className="flex items-center gap-2 mb-4"><Zap size={14} className="text-blue-600" /><span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Live Calculation</span></div>

      {/* Hours */}
      <div className="space-y-1 mb-3 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">On-set</span>
          <span className="font-medium tabular-nums flex items-center gap-1.5">{hoursToHM(c.onSetH)}{c.overnight && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Moon size={9}/>overnight</span>}</span>
        </div>
        {c.mealH > 0 && <div className="flex justify-between"><span className="text-gray-400">Meal break</span><span className="tabular-nums text-gray-400">− {hoursToHM(c.mealH)}</span></div>}
        {c.travH > 0 && <div className="flex justify-between"><span className="text-gray-500">Travel</span><span className="tabular-nums text-emerald-600 font-medium">+ {hoursToHM(c.travH)}</span></div>}
        <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-blue-100"><span>Paid hours</span><span className="tabular-nums">{hoursToHM(c.paidH)}</span></div>
      </div>

      {/* Base rate display */}
      <div className="text-xs text-blue-600 mb-2 font-medium">
        Base rate: {fmtMoney(c.baseHourly, cur)}/hr ({fmtMoney(c.dayRate, cur)} ÷ {c.incH}h)
      </div>

      {/* OT breakdown */}
      {c.totalOtH > 0 ? (
        <div className="rounded-lg p-2.5 mb-3 space-y-1" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
          <div className="text-xs font-bold text-amber-800">{hoursToHM(c.totalOtH)} overtime</div>
          {c.b1H > 0 && <div className="text-xs text-amber-700">Band 1: {hoursToHM(c.b1H)} × {fmtMoney(c.baseHourly, cur)} × {c.bands.band1Mult}× = {fmtMoney(c.b1Cost, cur)}</div>}
          {c.b2H > 0 && <div className="text-xs text-amber-700">Band 2: {hoursToHM(c.b2H)} × {fmtMoney(c.baseHourly, cur)} × {c.bands.band2Mult}× = {fmtMoney(c.b2Cost, cur)}</div>}
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-3 italic">No overtime ({hoursToHM(c.incH)} included in day rate)</p>
      )}

      {/* Cost breakdown */}
      <div className="space-y-0.5 border-t border-blue-100 pt-3 mb-3 text-sm">
        <SRow label="Day rate"   value={fmtMoney(c.dayRate,        cur)} />
        {c.totalOtH > 0 && <SRow label="OT cost"    value={fmtMoney(c.totalOtCost, cur)} amber />}
        {c.equip   > 0 && <SRow label="Equipment"   value={fmtMoney(c.equip,       cur)} />}
        {c.perDiem > 0 && <SRow label="Per diem"    value={fmtMoney(c.perDiem,     cur)} />}
        {c.expenses> 0 && <SRow label="Expenses"    value={fmtMoney(c.expenses,    cur)} />}
      </div>

      <div className="border-t-2 border-blue-700 pt-3 flex justify-between items-baseline">
        <span className="font-bold text-gray-900">Day Total</span>
        <span className="text-xl font-bold text-gray-900 tabular-nums">{fmtMoney(c.total, cur)}</span>
      </div>

      {/* Turnaround */}
      {turnaround !== null && (
        <div className={`mt-3 rounded-lg p-2.5 text-xs flex items-start gap-2 ${trWarn ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-green-50 border border-green-200 text-green-700"}`}>
          {trWarn ? <AlertTriangle size={12} className="mt-0.5 flex-shrink-0"/> : <CheckCircle size={12} className="mt-0.5 flex-shrink-0"/>}
          <span>{trWarn ? `Short turnaround: ${hoursToHM(turnaround)} — ${hoursToHM(trShort)} below ${trMin}h minimum` : `Turnaround: ${hoursToHM(turnaround)} ✓`}</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADD DAY FORM  — no manual OT rate, auto-filled from profile
// ═══════════════════════════════════════════════════════════════════════════

function AddDayForm({ timesheet, profile, onAdd, onShowToast }: { timesheet: Timesheet; profile: Profile; onAdd: (e: TimesheetEntry) => void; onShowToast: (msg: string, type?: ToastType) => void }) {
  const prev     = timesheet.entries.length > 0 ? timesheet.entries[timesheet.entries.length - 1] : undefined;
  const [form, setForm] = useState<Omit<TimesheetEntry, "id">>(() => entryDefaults(profile, prev, timesheet.productionName));
  const [showRates, setShowRates] = useState(false);
  const upd    = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }));
  const updNum = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }));
  const updBool= (k: string) => (v: boolean) => setForm(p => ({ ...p, [k]: v }));
  const turnaround = prev ? calcTurnaround(prev.wrapTime, form.callTime) : null;
  const cur = profile.defaultCurrency || "ZAR";
  const sym = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[cur] || "R";
  const isCustom = form.overtimeRule === "custom";
  const trMin = profile.defaultMinTurnaround || 10;
  const trWarn = turnaround !== null && turnaround < trMin;

  const handleDuplicate = () => {
    if (!prev) return;
    setForm(p => ({ ...duplicateEntry(prev, p.date) }));
    onShowToast("Previous day duplicated — edit times as needed", "info");
  };

  const handleAdd = () => {
    if (!form.date)     { onShowToast("Please enter a date", "error"); return; }
    if (!form.callTime) { onShowToast("Please enter a call time", "error"); return; }
    if (!form.wrapTime) { onShowToast("Please enter a wrap time", "error"); return; }
    const entry: TimesheetEntry = { id: uid(), ...form };
    const c = calcDay(entry, profile);
    onAdd(entry);
    const nextDate = nextDayStr(form.date);
    setForm(p => ({ ...entryDefaults(profile, entry, timesheet.productionName), date: nextDate }));
    onShowToast(`Day added — ${fmtDate(entry.date)} | ${fmtMoney(c.total, cur)}${c.totalOtH > 0 ? ` | ${hoursToHM(c.totalOtH)} OT` : ""}`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      <div className="lg:col-span-2 space-y-4">
        {/* Turnaround warning */}
        {prev && trWarn && (
          <AlertBox type="warning">Short turnaround: {hoursToHM(turnaround!)} from previous wrap ({hoursToHM(trMin - turnaround!)} below your {trMin}h minimum)</AlertBox>
        )}

        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Day Details</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Inp label="Date" type="date" value={form.date} onChange={upd("date")} />
            <Inp label="Location" value={form.location} onChange={upd("location")} placeholder="Set / studio / location" />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <TInp label="Call Time (24h)" value={form.callTime} onChange={upd("callTime")} />
            <TInp label="Wrap Time (24h)" value={form.wrapTime} onChange={upd("wrapTime")} />
          </div>
          <div className="w-48">
            <Inp label="Meal Break (minutes)" type="number" min="0" value={form.mealBreakMinutes} onChange={updNum("mealBreakMinutes")}
              hint={form.mealDeducted ? "Deducted from working hours" : "Not deducted (see Timesheet settings)"} />
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Travel <span className="normal-case font-normal text-gray-300 ml-1">(optional)</span></p>
          <div className="grid grid-cols-3 gap-4">
            <TInp label="Travel Start" value={form.travelStartTime} onChange={upd("travelStartTime")} />
            <TInp label="Travel End"   value={form.travelEndTime}   onChange={upd("travelEndTime")} />
            <Inp  label="Distance (km)" type="number" min="0" value={form.travelDistance} onChange={upd("travelDistance")} placeholder="0" />
          </div>
        </Card>

        <TxInp label="Notes" rows={2} value={form.notes} onChange={upd("notes")} placeholder="Shoot notes, special conditions…" />

        {/* Rate override — hidden by default */}
        <div>
          <button onClick={() => setShowRates(!showRates)} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors py-1">
            {showRates ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            {showRates ? "Hide rate overrides" : "Override rates for this day"}
            <span className="text-gray-300 text-xs">({fmtMoney(profile.defaultDayRate, cur)}/day · {OT_PRESETS[profile.defaultOvertimeRule]?.name} from your profile)</span>
          </button>

          {showRates && (
            <Card className="p-4 mt-2 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <Inp label={`Day Rate (${sym})`}   type="number" min="0" value={form.dayRate}       onChange={updNum("dayRate")} />
                <Inp label="Included Hours"         type="number" min="1" value={form.includedHours} onChange={updNum("includedHours")} />
              </div>
              <SInp label="Overtime Rule" value={form.overtimeRule} onChange={upd("overtimeRule") as any}>
                {(Object.entries(OT_PRESETS) as [OTRuleId, {name:string}][]).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </SInp>
              {isCustom && (
                <div className="grid grid-cols-3 gap-3">
                  <Inp label="Band 1 hrs"  type="number" min="0" value={form.otBand1Hours} onChange={updNum("otBand1Hours")} />
                  <Inp label="Band 1 mult" type="number" min="0" step="0.1" value={form.otBand1Mult} onChange={updNum("otBand1Mult")} />
                  <Inp label="Band 2 mult" type="number" min="0" step="0.1" value={form.otBand2Mult} onChange={updNum("otBand2Mult")} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Inp label={`Equipment (${sym})`} type="number" min="0" value={form.equipmentRental} onChange={updNum("equipmentRental")} />
                <Inp label={`Per Diem (${sym})`}  type="number" min="0" value={form.perDiem}         onChange={updNum("perDiem")} />
              </div>
              <Inp label={`Other Expenses (${sym})`} type="number" min="0" value={form.expenses} onChange={updNum("expenses")} placeholder="0.00" />
              <div className="divide-y divide-gray-100">
                <Tog checked={form.mealDeducted} onChange={updBool("mealDeducted")} label="Meal break deducted for this day" />
                <Tog checked={form.travelPaid}   onChange={updBool("travelPaid")}   label="Travel time paid for this day" />
              </div>
            </Card>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={handleAdd}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2">
            <Plus size={16}/> Add This Day
          </button>
          {prev && (
            <Btn variant="secondary" onClick={handleDuplicate} title="Copy rates and location from previous day">
              <Copy size={14}/> Duplicate Previous
            </Btn>
          )}
        </div>
      </div>

      <LiveCalcPanel entry={form} profile={profile} turnaround={turnaround} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY VIEW  — crash-safe defensive rendering
// ═══════════════════════════════════════════════════════════════════════════

function WeeklyView({ timesheet, profile, onDeleteEntry }: { timesheet: Timesheet; profile: Profile; onDeleteEntry: (id: string) => void }) {
  const entries = timesheet?.entries || [];
  const cur     = profile?.defaultCurrency || "ZAR";
  const minTR   = profile?.defaultMinTurnaround || 10;

  if (entries.length === 0)
    return <Card className="py-16 text-center"><p className="text-gray-400 text-sm">No days yet — use the "Add Day" tab to enter your first shoot day.</p></Card>;

  // Pre-compute all calcs safely
  const rows = entries.map((e, i) => {
    let c;
    try { c = calcDay(e, profile); }
    catch { c = { onSetH: 0, overnight: false, mealH: 0, travH: 0, paidH: 0, incH: 10, baseHourly: 0, totalOtH: 0, b1H: 0, b1Cost: 0, b2H: 0, b2Cost: 0, totalOtCost: 0, equip: 0, perDiem: 0, expenses: 0, dayRate: 0, total: 0, ruleId: "sa-film" as OTRuleId, bands: { band1Hours: 4, band1Mult: 1.5, band2Mult: 2.0 } }; }
    const prevEntry = i > 0 ? entries[i - 1] : undefined;
    let tr: number | null = null;
    try { tr = prevEntry ? calcTurnaround(prevEntry.wrapTime || "", e.callTime || "") : null; } catch { tr = null; }
    const trWarn = tr !== null && tr < minTR;
    return { e, c, tr, trWarn };
  });

  // Column totals
  const totPaidH  = rows.reduce((s, r) => s + (r.c.paidH    || 0), 0);
  const totOtH    = rows.reduce((s, r) => s + (r.c.totalOtH  || 0), 0);
  const totOtCost = rows.reduce((s, r) => s + (r.c.totalOtCost || 0), 0);
  const totEquip  = rows.reduce((s, r) => s + (r.c.equip     || 0), 0);
  const totTravH  = rows.reduce((s, r) => s + (r.c.travH     || 0), 0);
  const totExp    = rows.reduce((s, r) => s + (r.c.expenses  || 0), 0);
  const totDay    = rows.reduce((s, r) => s + (r.c.total     || 0), 0);

  const thCls = "px-2 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap text-left";
  const thR   = `${thCls} text-right`;
  const tdCls = "px-2 py-2.5 text-sm";
  const tdR   = `${tdCls} text-right tabular-nums`;

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className={thCls}>Date</th>
              <th className={thCls}>Production</th>
              <th className={thCls}>Location</th>
              <th className={thCls}>Call</th>
              <th className={thCls}>Wrap</th>
              <th className={thR}>On-set</th>
              <th className={thR}>Meal</th>
              <th className={thR}>Travel</th>
              <th className={thR}>Paid Hrs</th>
              <th className={thR}>OT Hrs</th>
              <th className={thR}>OT Cost</th>
              <th className={thR}>Turnaround</th>
              <th className={thR}>Day Total</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, c, tr, trWarn }, i) => (
              <Fragment key={e.id || `row-${i}`}>
                {/* Turnaround warning row */}
                {tr !== null && (
                  <tr className={trWarn ? "bg-amber-50" : "bg-green-50"}>
                    <td colSpan={14} className="px-3 py-1">
                      <span className={`text-xs flex items-center gap-1.5 ${trWarn ? "text-amber-700" : "text-green-700"}`}>
                        {trWarn ? <AlertTriangle size={11}/> : <CheckCircle size={11}/>}
                        {trWarn
                          ? `Short turnaround: ${hoursToHM(tr)} — ${hoursToHM((profile.defaultMinTurnaround || 10) - tr)} below ${profile.defaultMinTurnaround || 10}h minimum`
                          : `Turnaround: ${hoursToHM(tr)} ✓`}
                      </span>
                    </td>
                  </tr>
                )}
                <tr className="hover:bg-gray-50 transition-colors border-b border-gray-50">
                  <td className={`${tdCls} font-medium whitespace-nowrap`}>{fmtDate(e.date || "")}</td>
                  <td className={`${tdCls} text-gray-500 max-w-[100px] truncate`}>{e.productionName || "—"}</td>
                  <td className={`${tdCls} text-gray-500 max-w-[100px] truncate`}>{e.location || "—"}</td>
                  <td className={`${tdCls} font-mono`}>{e.callTime || "—"}</td>
                  <td className={`${tdCls} font-mono`}>{e.wrapTime || "—"}{c.overnight && <Moon size={10} className="inline ml-1 text-purple-500"/>}</td>
                  <td className={tdR}>{hoursToHM(c.onSetH  || 0)}</td>
                  <td className={`${tdR} text-gray-400`}>{c.mealH  > 0 ? hoursToHM(c.mealH)  : "—"}</td>
                  <td className={`${tdR} ${c.travH > 0 ? "text-emerald-600" : "text-gray-300"}`}>{c.travH > 0 ? hoursToHM(c.travH) : "—"}</td>
                  <td className={`${tdR} font-semibold`}>{hoursToHM(c.paidH || 0)}</td>
                  <td className={`${tdR} ${c.totalOtH > 0 ? "text-amber-600 font-semibold" : "text-gray-300"}`}>{c.totalOtH > 0 ? hoursToHM(c.totalOtH) : "—"}</td>
                  <td className={`${tdR} ${c.totalOtCost > 0 ? "text-amber-600" : "text-gray-300"}`}>{c.totalOtCost > 0 ? fmtMoney(c.totalOtCost, cur) : "—"}</td>
                  <td className={`${tdR} text-gray-400`}>{tr !== null ? hoursToHM(tr) : "—"}</td>
                  <td className={`${tdR} font-semibold text-gray-900`}>{fmtMoney(c.total || 0, cur)}</td>
                  <td className={tdCls}>
                    <button onClick={() => { if (confirm("Remove this day?")) onDeleteEntry(e.id); }} className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"><Trash2 size={13}/></button>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-900">
            <tr className="bg-gray-50">
              <td colSpan={5} className="px-2 py-2.5 text-sm font-bold text-gray-700">{entries.length} day{entries.length !== 1 ? "s" : ""} total</td>
              <td className={`${tdR} font-semibold`}></td>
              <td className={`${tdR} text-gray-400`}></td>
              <td className={`${tdR} text-emerald-600 font-semibold`}>{totTravH > 0 ? hoursToHM(totTravH) : "—"}</td>
              <td className={`${tdR} font-bold`}>{hoursToHM(totPaidH)}</td>
              <td className={`${tdR} font-bold text-amber-600`}>{totOtH > 0 ? hoursToHM(totOtH) : "—"}</td>
              <td className={`${tdR} font-bold text-amber-600`}>{totOtCost > 0 ? fmtMoney(totOtCost, cur) : "—"}</td>
              <td className={tdR}></td>
              <td className={`${tdR} font-bold text-gray-900`}>{fmtMoney(totDay, cur)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY VIEW
// ═══════════════════════════════════════════════════════════════════════════

function SummaryView({ timesheet, profile, onStartInvoice }: { timesheet: Timesheet; profile: Profile; onStartInvoice: () => void }) {
  const cur = profile.defaultCurrency || "ZAR";
  const sum = useMemo(() => calcSummary(timesheet.entries || [], profile), [timesheet.entries, profile]);

  if ((timesheet.entries || []).length === 0)
    return <Card className="py-16 text-center"><p className="text-gray-400 text-sm">Add some shoot days first.</p></Card>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Hours</p>
          <div className="space-y-0.5">
            <SRow label="Total days"        value={sum.totalDays} />
            <SRow label="Total paid hours"  value={hoursToHM(sum.totalPaidH)} />
            <SRow label="Normal hours"      value={hoursToHM(sum.totalPaidH - sum.totalOtH)} />
            {sum.totalOtH   > 0 && <div className="flex justify-between text-sm py-0.5"><span className="text-amber-600 font-medium">Overtime hours</span><span className="text-amber-600 font-semibold tabular-nums">{hoursToHM(sum.totalOtH)}</span></div>}
            {sum.totalTravH > 0 && <SRow label="Travel hours" value={hoursToHM(sum.totalTravH)} />}
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Costs</p>
          <div className="space-y-0.5">
            <SRow label="Day rates"        value={fmtMoney(sum.totalDayRates, cur)} />
            {sum.totalOtCost  > 0 && <SRow label="Overtime" value={fmtMoney(sum.totalOtCost,  cur)} amber />}
            {sum.totalEquip   > 0 && <SRow label="Equipment rental" value={fmtMoney(sum.totalEquip,   cur)} />}
            {sum.totalPerDiem > 0 && <SRow label="Per diem"         value={fmtMoney(sum.totalPerDiem, cur)} />}
            {sum.totalExp     > 0 && <SRow label="Expenses"         value={fmtMoney(sum.totalExp,     cur)} />}
            <div className="border-t border-gray-200 pt-2 mt-1"><SRow label="Subtotal" value={fmtMoney(sum.subtotal, cur)} /></div>
            {sum.vatPct > 0 && <SRow label={`VAT (${sum.vatPct}%)`} value={fmtMoney(sum.vatAmt, cur)} />}
            <div className="border-t-2 border-gray-900 pt-2 mt-1 flex justify-between">
              <span className="font-bold text-gray-900 text-base">Total Due</span>
              <span className="font-bold text-gray-900 text-lg tabular-nums">{fmtMoney(sum.grandTotal, cur)}</span>
            </div>
          </div>
        </Card>
      </div>
      {timesheet.status === "invoiced"
        ? <AlertBox type="success">Invoice already created for this timesheet.</AlertBox>
        : <Btn variant="success" size="lg" onClick={onStartInvoice}><Receipt size={16}/> Create Invoice from Timesheet</Btn>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INVOICE REVIEW SCREEN
// ═══════════════════════════════════════════════════════════════════════════

function buildTimesheetLines(sum: ReturnType<typeof calcSummary>, cur: string): InvoiceLine[] {
  const lines: InvoiceLine[] = [];
  if (sum.totalDayRates > 0) lines.push({ id: uid(), description: `Day Rates — ${sum.totalDays} day${sum.totalDays !== 1 ? "s" : ""}`, quantity: sum.totalDays, unitPrice: sum.totalDayRates / Math.max(sum.totalDays, 1), amount: sum.totalDayRates });
  if (sum.totalOtCost  > 0) lines.push({ id: uid(), description: `Overtime — ${hoursToHM(sum.totalOtH)}`, quantity: 1, unitPrice: sum.totalOtCost, amount: sum.totalOtCost });
  if (sum.totalEquip   > 0) lines.push({ id: uid(), description: "Equipment Rental", quantity: 1, unitPrice: sum.totalEquip, amount: sum.totalEquip });
  if (sum.totalPerDiem > 0) lines.push({ id: uid(), description: "Per Diem", quantity: 1, unitPrice: sum.totalPerDiem, amount: sum.totalPerDiem });
  if (sum.totalExp     > 0) lines.push({ id: uid(), description: "Expenses", quantity: 1, unitPrice: sum.totalExp, amount: sum.totalExp });
  return lines;
}

function InvoiceReviewScreen({ timesheet, profile, invoices, onSave, onBack, onShowToast }: {
  timesheet: Timesheet; profile: Profile; invoices: Invoice[];
  onSave: (inv: Invoice) => void; onBack: () => void; onShowToast: (msg: string, type?: ToastType) => void;
}) {
  const cur = timesheet.currency || profile.defaultCurrency || "ZAR";
  const sum = useMemo(() => calcSummary(timesheet.entries || [], profile), [timesheet.entries, profile]);
  const [baseLines] = useState<InvoiceLine[]>(() => buildTimesheetLines(sum, cur));
  const [extras, setExtras] = useState<InvoiceLine[]>([]);
  const [newItem, setNewItem] = useState({ description: "", quantity: "1", unitPrice: "" });
  const [dueDate, setDueDate] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const allLines = [...baseLines, ...extras];
  const subtotal = allLines.reduce((s, l) => s + (l.amount || 0), 0);
  const vatPct   = sum.vatPct;
  const vatAmt   = subtotal * (vatPct / 100);
  const total    = subtotal + vatAmt;

  const addExtra = () => {
    const qty = parseFloat(newItem.quantity) || 1;
    const up  = parseFloat(newItem.unitPrice) || 0;
    if (!newItem.description || !up) { onShowToast("Enter description and price", "error"); return; }
    setExtras(p => [...p, { id: uid(), description: newItem.description, quantity: qty, unitPrice: up, amount: qty * up, isExtra: true }]);
    setNewItem({ description: "", quantity: "1", unitPrice: "" });
  };

  const removeExtra = (id: string) => setExtras(p => p.filter(e => e.id !== id));

  const handleSave = () => {
    const inv: Invoice = {
      id: uid(), invoiceNumber: genINVNum(invoices),
      issueDate: todayStr(), dueDate,
      clientName: timesheet.productionName || "",
      crewName: profile.fullName || "", role: profile.role || "", companyName: profile.companyName || "",
      timesheetNumber: timesheet.timesheetNumber,
      lineItems: allLines,
      subtotal, vat: vatPct, vatAmount: vatAmt, total,
      currency: cur, status: "unpaid",
      banking: { accountName: profile.bankAccountName, bankName: profile.bankName, accountNumber: profile.bankAccountNumber, branchCode: profile.bankBranchCode, swift: profile.bankSwift, iban: profile.bankIban, reference: profile.bankReference },
      paymentNotes: payNotes, fromTimesheetId: timesheet.id, createdAt: new Date().toISOString(),
    };
    onSave(inv);
    onShowToast(`Invoice ${inv.invoiceNumber} created`);
  };

  const openPDF = () => {
    const inv: Invoice = { id: uid(), invoiceNumber: genINVNum(invoices), issueDate: todayStr(), dueDate, clientName: timesheet.productionName || "", crewName: profile.fullName, role: profile.role, companyName: profile.companyName, timesheetNumber: timesheet.timesheetNumber, lineItems: allLines, subtotal, vat: vatPct, vatAmount: vatAmt, total, currency: cur, status: "unpaid", banking: { accountName: profile.bankAccountName, bankName: profile.bankName, accountNumber: profile.bankAccountNumber, branchCode: profile.bankBranchCode, swift: profile.bankSwift, iban: profile.bankIban, reference: profile.bankReference }, paymentNotes: payNotes, fromTimesheetId: timesheet.id, createdAt: new Date().toISOString() };
    printInvoice(inv, profile);
  };

  const sym = { ZAR: "R", USD: "$", GBP: "£", EUR: "€" }[cur] || "R";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronLeft size={20}/></button>
          <div><h1 className="text-xl font-bold text-gray-900">Invoice Review</h1><p className="text-sm text-gray-400 mt-0.5">Review, add extras, then save or export PDF</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="secondary" onClick={openPDF}><FileText size={14}/> Export PDF</Btn>
          <Btn variant="success" onClick={handleSave}><Save size={14}/> Save Invoice</Btn>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* From / To */}
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-6">
              <div><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">From</p><p className="font-semibold">{profile.companyName || profile.fullName || "—"}</p><p className="text-sm text-gray-500">{profile.fullName}</p><p className="text-sm text-gray-500">{profile.role}</p></div>
              <div><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Bill To</p><p className="font-semibold">{timesheet.productionName || "—"}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Inp label="Due Date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </Card>

          {/* Timesheet line items (read-only) */}
          <Card className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Timesheet Items</p>
            <p className="text-xs text-gray-400 mb-4">From {timesheet.timesheetNumber}</p>
            <div className="space-y-0">
              {baseLines.map(l => (
                <div key={l.id} className="grid grid-cols-12 gap-2 py-2.5 border-b border-gray-100">
                  <div className="col-span-7 text-sm text-gray-700">{l.description}</div>
                  <div className="col-span-2 text-sm text-right text-gray-400 tabular-nums">{l.quantity > 1 ? `${l.quantity} ×` : ""}</div>
                  <div className="col-span-3 text-sm text-right font-medium tabular-nums">{fmtMoney(l.amount, cur)}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Extra items */}
          <Card className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Additional Items <span className="normal-case font-normal text-gray-300">(optional — kit prep, parking, accommodation, etc.)</span></p>
            {extras.length > 0 && (
              <div className="mb-4 space-y-0">
                {extras.map(l => (
                  <div key={l.id} className="grid grid-cols-12 gap-2 py-2.5 border-b border-gray-100 items-center">
                    <div className="col-span-6 text-sm text-gray-700">{l.description}</div>
                    <div className="col-span-2 text-sm text-right text-gray-400 tabular-nums">{l.quantity} × {sym}{l.unitPrice.toFixed(2)}</div>
                    <div className="col-span-3 text-sm text-right font-medium tabular-nums">{fmtMoney(l.amount, cur)}</div>
                    <div className="col-span-1 flex justify-end"><button onClick={() => removeExtra(l.id)} className="p-1 text-gray-300 hover:text-red-500 rounded"><Trash2 size={13}/></button></div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-12 gap-2 items-end border-t border-gray-100 pt-4">
              <div className="col-span-5"><Inp placeholder="Description (e.g. Kit Prep Day, Parking)" value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && addExtra()} /></div>
              <div className="col-span-2"><Inp placeholder="Qty" type="number" value={newItem.quantity} onChange={e => setNewItem(p => ({ ...p, quantity: e.target.value }))} /></div>
              <div className="col-span-3"><Inp placeholder={`Unit price (${sym})`} type="number" value={newItem.unitPrice} onChange={e => setNewItem(p => ({ ...p, unitPrice: e.target.value }))} onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && addExtra()} /></div>
              <div className="col-span-2"><Btn variant="primary" className="w-full justify-center" onClick={addExtra}><Plus size={14}/> Add</Btn></div>
            </div>
          </Card>

          <TxInp label="Payment Notes" rows={2} value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="e.g. Payment due within 30 days of invoice date" />
        </div>

        {/* Totals sidebar */}
        <div>
          <Card className="p-5 sticky top-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Invoice Total</p>
            <div className="space-y-0.5">
              {allLines.map(l => <SRow key={l.id} label={l.description.length > 28 ? l.description.slice(0, 28) + "…" : l.description} value={fmtMoney(l.amount, cur)} indent={l.isExtra} />)}
              <div className="border-t border-gray-200 pt-2 mt-1"><SRow label="Subtotal" value={fmtMoney(subtotal, cur)} /></div>
              {vatPct > 0 && <SRow label={`VAT (${vatPct}%)`} value={fmtMoney(vatAmt, cur)} />}
              <div className="border-t-2 border-gray-900 pt-2.5 mt-1 flex justify-between">
                <span className="font-bold text-gray-900">TOTAL DUE</span>
                <span className="font-bold text-lg tabular-nums">{fmtMoney(total, cur)}</span>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <Btn variant="success" className="w-full justify-center" onClick={handleSave}><Save size={14}/> Save Invoice</Btn>
              <Btn variant="secondary" className="w-full justify-center" onClick={openPDF}><FileText size={14}/> Export PDF</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF PRINT
// ═══════════════════════════════════════════════════════════════════════════

function printInvoice(inv: Invoice, profile: Profile) {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const m = (n: unknown) => fmtMoney(n, inv.currency);
  const bd = inv.banking || {};
  const bankRows = ([["Account Name", bd.accountName],["Bank", bd.bankName],["Account No.", bd.accountNumber],["Branch", bd.branchCode],bd.swift&&["SWIFT", bd.swift],bd.iban&&["IBAN", bd.iban],bd.reference&&["Reference", bd.reference]] as [string,string][]).filter(r=>r&&r[1]);
  const lineRows = (inv.lineItems||[]).map(l=>`<tr><td style="padding:9px 0;border-bottom:1px solid #F3F4F6;font-size:13px">${esc(l.description)}</td><td style="padding:9px 0;border-bottom:1px solid #F3F4F6;font-size:13px;text-align:right;color:#6B7280">${l.quantity > 1 ? l.quantity + " ×" : ""}</td><td style="padding:9px 0;border-bottom:1px solid #F3F4F6;font-size:13px;text-align:right;font-weight:500">${m(l.amount)}</td></tr>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNumber)}</title><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;color:#111827;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:800px;margin:0 auto;padding:52px 44px}@media print{.page{padding:32px}}</style></head><body><div class="page">
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px"><div><div style="font-size:28px;font-weight:700;letter-spacing:-.4px">INVOICE</div><div style="color:#6B7280;font-size:13px;margin-top:4px">${esc(inv.invoiceNumber)}</div></div><div style="text-align:right"><div style="font-size:16px;font-weight:700">${esc(inv.companyName||profile.companyName)}</div><div style="font-size:12px;color:#6B7280;margin-top:2px">${esc(inv.crewName)}</div><div style="font-size:12px;color:#6B7280">${esc(inv.role)}</div></div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px"><div><div style="font-size:10px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Bill To</div><div style="font-size:14px;font-weight:500">${esc(inv.clientName||"—")}</div>${inv.timesheetNumber?`<div style="font-size:11px;color:#9CA3AF;margin-top:4px">Timesheet: ${esc(inv.timesheetNumber)}</div>`:""}</div><div style="text-align:right"><div style="font-size:10px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Issue Date</div><div style="font-size:14px;font-weight:500">${esc(fmtDate(inv.issueDate))}</div>${inv.dueDate?`<div style="font-size:10px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-top:10px;margin-bottom:4px">Due Date</div><div style="font-size:14px;font-weight:500">${esc(fmtDate(inv.dueDate))}</div>`:""}</div></div>
<table style="width:100%;border-collapse:collapse"><thead><tr style="border-top:2px solid #111827;border-bottom:1px solid #E5E7EB"><th style="padding:8px 0;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;text-align:left">Description</th><th style="padding:8px 0;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;text-align:right">Qty</th><th style="padding:8px 0;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;text-align:right">Amount</th></tr></thead><tbody>${lineRows}</tbody></table>
<div style="display:flex;justify-content:flex-end;margin-top:18px"><div style="width:240px"><div style="display:flex;justify-content:space-between;font-size:13px;color:#6B7280;padding:4px 0">Subtotal<span>${m(inv.subtotal)}</span></div>${inv.vat>0?`<div style="display:flex;justify-content:space-between;font-size:13px;color:#6B7280;padding:4px 0">VAT (${inv.vat}%)<span>${m(inv.vatAmount)}</span></div>`:""}<div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;padding:10px 0 0;border-top:2px solid #111827;margin-top:6px">TOTAL DUE<span>${m(inv.total)}</span></div></div></div>
${bankRows.length?`<div style="margin-top:28px;padding-top:20px;border-top:1px solid #E5E7EB"><div style="font-size:10px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Banking Details</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${bankRows.map(([k,v])=>`<div><div style="font-size:10px;font-weight:600;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">${esc(k)}</div><div style="font-size:13px;font-weight:500">${esc(v)}</div></div>`).join("")}</div></div>`:""}
${inv.paymentNotes?`<div style="margin-top:20px;padding-top:16px;border-top:1px solid #E5E7EB"><div style="font-size:10px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Payment Notes</div><div style="font-size:13px;color:#374151;line-height:1.6">${esc(inv.paymentNotes)}</div></div>`:""}
</div><script>window.addEventListener('load',function(){setTimeout(function(){window.print()},500)})<\/script></body></html>`;
  const w = window.open("", "_blank", "width=960,height=720");
  if (!w) { alert("Allow pop-ups to export PDF"); return; }
  w.document.write(html); w.document.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMESHEET DETAIL
// ═══════════════════════════════════════════════════════════════════════════

function TimesheetDetail({ timesheet, profile, onUpdate, onBack, onCreateInvoice, onShowToast }: {
  timesheet: Timesheet; profile: Profile; onUpdate: (ts: Timesheet) => void;
  onBack: () => void; onCreateInvoice: (ts: Timesheet) => void; onShowToast: (msg: string, type?: ToastType) => void;
}) {
  const [tab, setTab]     = useState("add");
  const sum               = useMemo(() => calcSummary(timesheet.entries || [], profile), [timesheet.entries, profile]);
  const cur               = profile.defaultCurrency || "ZAR";
  const addEntry          = (e: TimesheetEntry) => onUpdate({ ...timesheet, entries: [...(timesheet.entries || []), e] });
  const deleteEntry       = (id: string) => onUpdate({ ...timesheet, entries: (timesheet.entries || []).filter(e => e.id !== id) });
  const statusColor       = ({ open: "blue", submitted: "purple", invoiced: "green" } as Record<string, string>)[timesheet.status] || "blue";
  const statusLabel       = ({ open: "Open", submitted: "Submitted", invoiced: "Invoiced" } as Record<string, string>)[timesheet.status] || "Open";
  const TABS = [{ id: "add", label: "Add Day" }, { id: "weekly", label: `Weekly (${(timesheet.entries||[]).length})` }, { id: "summary", label: "Summary" }];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronLeft size={20}/></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{timesheet.productionName || "Untitled"}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{timesheet.timesheetNumber} · {(timesheet.entries||[]).length} day{(timesheet.entries||[]).length !== 1 ? "s" : ""} · {fmtMoney(sum.grandTotal, cur)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge color={statusColor}>{statusLabel}</Badge>
          {timesheet.status !== "invoiced" && sum.grandTotal > 0 && <Btn variant="success" size="sm" onClick={() => onCreateInvoice(timesheet)}><Receipt size={13}/> Create Invoice</Btn>}
        </div>
      </div>
      <div className="flex border-b border-gray-200">
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>{t.label}</button>)}
      </div>
      {tab === "add"    && <AddDayForm  timesheet={timesheet} profile={profile} onAdd={addEntry} onShowToast={onShowToast} />}
      {tab === "weekly" && <WeeklyView  timesheet={timesheet} profile={profile} onDeleteEntry={deleteEntry} />}
      {tab === "summary"&& <SummaryView timesheet={timesheet} profile={profile} onStartInvoice={() => onCreateInvoice(timesheet)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMESHEETS PAGE
// ═══════════════════════════════════════════════════════════════════════════

function TimesheetsPage({ timesheets, profile, onSave, invoices, onAddInvoice, onShowToast }: {
  timesheets: Timesheet[]; profile: Profile; onSave: (t: Timesheet[]) => void;
  invoices: Invoice[]; onAddInvoice: (i: Invoice) => void; onShowToast: (msg: string, type?: ToastType) => void;
}) {
  const [view, setView]           = useState<"list" | "detail" | "invoice-review">("list");
  const [selected, setSelected]   = useState<Timesheet | null>(null);
  const [showNew, setShowNew]     = useState(false);
  const [newProd, setNewProd]     = useState("");
  const cur = profile.defaultCurrency || "ZAR";

  const createTS = () => {
    if (!newProd.trim()) return;
    const ts: Timesheet = { id: uid(), timesheetNumber: genTSNum(timesheets), productionName: newProd.trim(), crewName: profile.fullName, role: profile.role, currency: profile.defaultCurrency, vat: profile.defaultVat, status: "open", entries: [], createdAt: new Date().toISOString() };
    onSave([...timesheets, ts]); setSelected(ts); setView("detail"); setShowNew(false); setNewProd("");
  };

  const updateTS = useCallback((ts: Timesheet) => {
    onSave((timesheets || []).map(x => x.id === ts.id ? ts : x));
    setSelected(ts);
  }, [timesheets, onSave]);

  const deleteTS = (id: string) => { if (!confirm("Delete this timesheet?")) return; onSave((timesheets||[]).filter(t => t.id !== id)); if (selected?.id === id) { setView("list"); setSelected(null); } };

  const startInvoice = useCallback((ts: Timesheet) => {
    updateTS(ts);
    setSelected(ts);
    setView("invoice-review");
  }, [updateTS]);

  const saveInvoice = useCallback((inv: Invoice) => {
    onAddInvoice(inv);
    const updated = { ...selected!, status: "invoiced" as const, invoiceId: inv.id };
    updateTS(updated);
    setView("list"); setSelected(null);
  }, [selected, onAddInvoice, updateTS]);

  const currentTS = selected ? ((timesheets||[]).find(t => t.id === selected.id) || selected) : null;

  if (view === "invoice-review" && currentTS)
    return <InvoiceReviewScreen timesheet={currentTS} profile={profile} invoices={invoices} onSave={saveInvoice} onBack={() => setView("detail")} onShowToast={onShowToast} />;

  if (view === "detail" && currentTS)
    return <TimesheetDetail timesheet={currentTS} profile={profile} onUpdate={updateTS} onBack={() => { setView("list"); setSelected(null); }} onCreateInvoice={startInvoice} onShowToast={onShowToast} />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">Timesheets</h1><p className="text-sm text-gray-500 mt-0.5">{(timesheets||[]).length} timesheet{(timesheets||[]).length !== 1 ? "s" : ""}</p></div>
        <Btn onClick={() => setShowNew(true)}><Plus size={14}/> New Timesheet</Btn>
      </div>

      {!profile.defaultDayRate && (
        <AlertBox type="warning">Your day rate is not set. <strong>Go to Settings → Default Rates</strong> to set your day rate and included hours — overtime will be calculated automatically.</AlertBox>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowNew(false); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-bold text-gray-900 mb-1">New Timesheet</h2>
            <p className="text-sm text-gray-400 mb-4">Enter the production name — your rates and OT rules fill in automatically.</p>
            <Inp label="Production / Project Name" value={newProd} onChange={e => setNewProd(e.target.value)} placeholder="e.g. The Crown S6, Nike Commercial…" onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && createTS()} autoFocus />
            <div className="flex gap-2 mt-4">
              <Btn className="flex-1 justify-center" onClick={createTS} disabled={!newProd.trim()}>Create Timesheet →</Btn>
              <Btn variant="secondary" onClick={() => setShowNew(false)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      <Card>
        {(timesheets||[]).length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Clock size={24} className="text-gray-300"/></div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No timesheets yet</h3>
            <p className="text-sm text-gray-400 mb-5 max-w-xs mx-auto">{profile.defaultDayRate > 0 ? `Your rate of ${fmtMoney(profile.defaultDayRate, cur)}/day is ready. Create your first timesheet.` : "Set your rates in Settings, then create a timesheet to start logging shoot days."}</p>
            <Btn onClick={() => setShowNew(true)}><Plus size={14}/> New Timesheet</Btn>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-200">{["Timesheet","Production","Days","Status","Total",""].map((h,i) => <th key={i} className={`px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider ${i >= 4 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {[...(timesheets||[])].sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).map(ts => {
                  const s = calcSummary(ts.entries||[], profile);
                  const col = ({ open:"blue", submitted:"purple", invoiced:"green" } as Record<string,string>)[ts.status]||"blue";
                  const lbl = ({ open:"Open", submitted:"Submitted", invoiced:"Invoiced" } as Record<string,string>)[ts.status]||"Open";
                  return (
                    <tr key={ts.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3.5"><button onClick={() => { setSelected(ts); setView("detail"); }} className="text-sm font-semibold text-blue-600 hover:text-blue-800">{ts.timesheetNumber}</button></td>
                      <td className="px-4 py-3.5 text-sm font-medium text-gray-900">{ts.productionName||"—"}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{(ts.entries||[]).length}</td>
                      <td className="px-4 py-3.5"><Badge color={col}>{lbl}</Badge></td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 text-right tabular-nums">{fmtMoney(s.grandTotal, ts.currency||cur)}</td>
                      <td className="px-4 py-3.5 text-right"><button onClick={() => deleteTS(ts.id)} className="p-1.5 rounded text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13}/></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INVOICES PAGE
// ═══════════════════════════════════════════════════════════════════════════

function InvoicesPage({ invoices, profile }: { invoices: Invoice[]; profile: Profile }) {
  const [sel, setSel] = useState<string | null>(null);
  const inv = sel ? (invoices||[]).find(i => i.id === sel) || null : null;

  if (inv) {
    const bd = inv.banking || {};
    const bankRows = ([["Account Name",bd.accountName],["Bank",bd.bankName],["Account No.",bd.accountNumber],["Branch",bd.branchCode],bd.swift&&["SWIFT",bd.swift],bd.iban&&["IBAN",bd.iban],bd.reference&&["Reference",bd.reference]] as [string,string][]).filter(r=>r&&r[1]);
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <button onClick={() => setSel(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronLeft size={20}/></button>
          <div><h1 className="text-xl font-bold text-gray-900">{inv.invoiceNumber}</h1><p className="text-sm text-gray-400 mt-0.5">For {inv.clientName||"—"}</p></div>
          <div className="ml-auto"><Btn variant="secondary" onClick={() => printInvoice(inv, profile)}><FileText size={14}/> Export PDF</Btn></div>
        </div>
        <Card className="p-8 max-w-2xl">
          <div className="flex justify-between items-start mb-8">
            <div><h2 className="text-3xl font-bold tracking-tight">INVOICE</h2><p className="text-gray-400 mt-1 text-sm">{inv.invoiceNumber}</p>{inv.timesheetNumber&&<p className="text-gray-300 text-xs mt-0.5">Timesheet: {inv.timesheetNumber}</p>}</div>
            <div className="text-right"><p className="font-bold text-base">{inv.companyName||profile.companyName}</p><p className="text-gray-500 text-sm">{inv.crewName}</p><p className="text-gray-500 text-sm">{inv.role}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Bill To</p><p className="font-medium">{inv.clientName||"—"}</p></div>
            <div className="text-right"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Issue Date</p><p className="font-medium">{fmtDate(inv.issueDate)}</p>{inv.dueDate&&<><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1 mt-3">Due Date</p><p className="font-medium">{fmtDate(inv.dueDate)}</p></>}</div>
          </div>
          <div className="border-t-2 border-gray-900 mb-1">
            <div className="grid grid-cols-12 gap-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider"><div className="col-span-8">Description</div><div className="col-span-2 text-right">Qty</div><div className="col-span-2 text-right">Amount</div></div>
          </div>
          {(inv.lineItems||[]).map(item => (
            <div key={item.id} className={`grid grid-cols-12 gap-3 py-2.5 border-b border-gray-100 ${item.isExtra ? "bg-gray-50" : ""}`}>
              <div className="col-span-8 text-sm text-gray-700">{item.description}{item.isExtra&&<span className="ml-2 text-xs text-gray-400">extra</span>}</div>
              <div className="col-span-2 text-sm text-right text-gray-400 tabular-nums">{item.quantity > 1 ? item.quantity : ""}</div>
              <div className="col-span-2 text-sm font-medium text-right tabular-nums">{fmtMoney(item.amount, inv.currency)}</div>
            </div>
          ))}
          <div className="flex justify-end mt-5">
            <div className="w-56 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-500">Subtotal<span className="tabular-nums font-medium text-gray-900">{fmtMoney(inv.subtotal,inv.currency)}</span></div>
              {inv.vat>0&&<div className="flex justify-between text-sm text-gray-500">VAT ({inv.vat}%)<span className="tabular-nums font-medium text-gray-900">{fmtMoney(inv.vatAmount,inv.currency)}</span></div>}
              <div className="flex justify-between font-bold text-gray-900 border-t-2 border-gray-900 pt-2.5 text-base">TOTAL DUE<span className="tabular-nums">{fmtMoney(inv.total,inv.currency)}</span></div>
            </div>
          </div>
          {bankRows.length>0&&<div className="mt-8 pt-6 border-t border-gray-100"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-4">Banking Details</p><div className="grid grid-cols-2 gap-3">{bankRows.map(([k,v])=><div key={k}><p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{k}</p><p className="text-sm font-medium mt-0.5">{v}</p></div>)}</div></div>}
          {inv.paymentNotes&&<div className="mt-6 pt-5 border-t border-gray-100"><p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Payment Notes</p><p className="text-sm text-gray-600 leading-relaxed">{inv.paymentNotes}</p></div>}
        </Card>
      </div>
    );
  }

  const STATUS: Record<string,{label:string;color:string}> = { unpaid:{label:"Unpaid",color:"amber"}, paid:{label:"Paid",color:"green"}, draft:{label:"Draft",color:"gray"} };
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold text-gray-900">Invoices</h1><p className="text-sm text-gray-500 mt-0.5">{(invoices||[]).length} invoice{(invoices||[]).length !== 1 ? "s" : ""}</p></div>
      <Card>
        {(invoices||[]).length === 0 ? (
          <div className="py-16 text-center"><div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Receipt size={24} className="text-gray-300"/></div><h3 className="text-base font-semibold text-gray-900 mb-1">No invoices yet</h3><p className="text-sm text-gray-400 max-w-xs mx-auto">Complete a timesheet and tap <strong>Create Invoice</strong> in the Summary tab.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full"><thead><tr className="border-b border-gray-200">{["Invoice","Client","Date","Status","Total"].map((h,i)=><th key={i} className={`px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider ${i>=4?"text-right":"text-left"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">{[...(invoices||[])].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).map(i=>{const st=STATUS[i.status]||STATUS.draft;return(<tr key={i.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={()=>setSel(i.id)}><td className="px-4 py-3.5 text-sm font-semibold text-blue-600">{i.invoiceNumber}</td><td className="px-4 py-3.5 text-sm font-medium">{i.clientName||"—"}</td><td className="px-4 py-3.5 text-sm text-gray-400">{fmtDate(i.issueDate)}</td><td className="px-4 py-3.5"><Badge color={st.color}>{st.label}</Badge></td><td className="px-4 py-3.5 text-sm font-semibold text-right tabular-nums">{fmtMoney(i.total,i.currency)}</td></tr>);})}</tbody></table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT
// ═══════════════════════════════════════════════════════════════════════════

const NAV = [{ id:"timesheets",label:"Timesheets",icon:Clock },{ id:"invoices",label:"Invoices",icon:Receipt },{ id:"settings",label:"Settings",icon:Settings }];

function Layout({ page, setPage, profile, children }: { page:string; setPage:(p:string)=>void; profile:Profile; children:React.ReactNode }) {
  const initial = (profile.fullName||"?").charAt(0).toUpperCase();
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-52 flex flex-col flex-shrink-0 bg-slate-900">
        <div className="flex items-center gap-2.5 p-5 border-b border-slate-700/60">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0"><Film size={14} className="text-white"/></div>
          <div><p className="text-white font-bold text-[13px] leading-tight">CrewQuote Pro</p><p className="text-slate-500 text-[10px]">Freelancer Timesheet</p></div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setPage(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${page===id?"bg-blue-600 text-white":"text-slate-400 hover:text-white hover:bg-slate-800"}`}>
              <Icon size={16}/>{label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initial}</div>
            <div className="min-w-0"><p className="text-white text-xs font-medium truncate">{profile.fullName||"Your Name"}</p><p className="text-slate-500 text-[10px] truncate">{profile.role||"Set role in Settings"}</p></div>
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-5 lg:p-6">{children}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════════════════

export default function App() {
  const [page,       setPage]       = useState("timesheets");
  const [profile,    setProfile]    = useState<Profile>({ ...DEFAULT_PROFILE });
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [ready,      setReady]      = useState(false);
  const [toasts,     setToasts]     = useState<ToastMsg[]>([]);

  useEffect(() => {
    (async () => {
      const [p, t, i] = await Promise.all([Store.get("cqp-profile"), Store.get("cqp-timesheets"), Store.get("cqp-invoices")]);
      if (p) setProfile({ ...DEFAULT_PROFILE, ...p });
      if (t) setTimesheets(Array.isArray(t) ? t : []);
      if (i) setInvoices(Array.isArray(i) ? i : []);
      setReady(true);
    })();
  }, []);

  const showToast = useCallback((msg: string, type: ToastType = "success") => {
    const id = uid();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const saveProfile    = (p: Profile)     => { setProfile(p);    Store.set("cqp-profile",    p); };
  const saveTimesheets = (t: Timesheet[]) => { setTimesheets(t); Store.set("cqp-timesheets", t); };
  const addInvoice     = (inv: Invoice)   => { const next = [...invoices, inv]; setInvoices(next); Store.set("cqp-invoices", next); };

  if (!ready) return (
    <div className="h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3 animate-pulse"><Film size={20} className="text-white"/></div>
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    </div>
  );

  return (
    <Layout page={page} setPage={setPage} profile={profile}>
      <ToastContainer toasts={toasts} />
      {page === "timesheets" && <TimesheetsPage timesheets={timesheets} profile={profile} onSave={saveTimesheets} invoices={invoices} onAddInvoice={addInvoice} onShowToast={showToast} />}
      {page === "invoices"   && <InvoicesPage   invoices={invoices}     profile={profile} />}
      {page === "settings"   && <SettingsPage   profile={profile}       onSave={saveProfile} />}
    </Layout>
  );
}
