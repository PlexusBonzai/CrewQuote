import type { Database, Json } from "../../types/database.types";
import type { CrewProfile } from "../crewquoteTypes";

type BusinessSettingsRow = Database["public"]["Tables"]["business_settings"]["Row"];
type BusinessSettingsInsert = Database["public"]["Tables"]["business_settings"]["Insert"];
type BusinessSettingsCurrency = NonNullable<BusinessSettingsInsert["default_currency"]>;

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function objectJson(value: Json): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function currency(value: string): BusinessSettingsCurrency {
  return value === "USD" || value === "GBP" || value === "EUR" ? value : "ZAR";
}

export function businessSettingsRowToProfile(row: BusinessSettingsRow, base: CrewProfile): CrewProfile {
  const invoicePreferences = objectJson(row.invoice_preferences);

  return {
    ...base,
    fullName: row.full_name || "",
    role: row.role || "",
    companyName: row.trading_name || "",
    email: row.business_email || "",
    phone: row.phone || "",
    address: row.billing_address || "",
    vatRegistered: Boolean(row.vat_registered),
    vatNumber: row.vat_number || "",
    invoiceLabel: row.invoice_label || "Invoice",
    paymentTerms: row.payment_terms || "Payment due within 30 days",
    invoiceNumberHistory: Array.isArray(row.invoice_number_history) ? row.invoice_number_history : [],
    defaultCurrency: row.default_currency,
    defaultDayRate: n(row.default_day_rate),
    defaultIncludedHours: n(row.default_included_hours, 10),
    defaultEquipmentRental: n(row.default_equipment_rental),
    defaultPerDiem: n(row.default_per_diem),
    defaultVat: n(row.default_vat),
    defaultOvertimeRule: row.default_overtime_rule,
    defaultOtBand1Hours: n(row.default_ot_band1_hours, 4),
    defaultOtBand1Mult: n(row.default_ot_band1_mult, 1.5),
    defaultOtBand2Mult: n(row.default_ot_band2_mult, 2),
    defaultMinTurnaround: n(row.default_min_turnaround, 10),
    defaultTurnaroundMode: row.default_turnaround_mode,
    defaultTurnaroundPenMult: n(row.default_turnaround_pen_mult, 1.5),
    mealBreaksDeducted: bool(invoicePreferences.mealBreaksDeducted, base.mealBreaksDeducted),
    travelTimePaid: bool(invoicePreferences.travelTimePaid, base.travelTimePaid),
    equipmentRentalDaily: bool(invoicePreferences.equipmentRentalDaily, base.equipmentRentalDaily),
    bankAccountName: row.bank_account_name || "",
    bankName: row.bank_name || "",
    bankAccountNumber: row.bank_account_number || "",
    bankBranchCode: row.bank_branch_code || "",
    bankSwift: row.bank_swift || "",
    bankIban: row.bank_iban || "",
    bankReference: row.bank_reference || "",
    businessLogoDataUrl: base.businessLogoDataUrl || "",
  };
}

export function profileToBusinessSettingsInsert(profile: CrewProfile, userId: string): BusinessSettingsInsert {
  return {
    user_id: userId,
    full_name: profile.fullName || "",
    trading_name: profile.companyName || "",
    role: profile.role || "",
    business_email: profile.email || "",
    phone: profile.phone || "",
    billing_address: profile.address || "",
    vat_registered: Boolean(profile.vatRegistered),
    vat_number: profile.vatNumber || "",
    invoice_label: profile.invoiceLabel || "Invoice",
    invoice_number_history: Array.isArray(profile.invoiceNumberHistory) ? profile.invoiceNumberHistory : [],
    default_currency: currency(profile.defaultCurrency),
    default_day_rate: n(profile.defaultDayRate),
    default_included_hours: n(profile.defaultIncludedHours, 10),
    default_equipment_rental: n(profile.defaultEquipmentRental),
    default_per_diem: n(profile.defaultPerDiem),
    default_vat: n(profile.defaultVat),
    payment_terms: profile.paymentTerms || "Payment due within 30 days",
    bank_account_name: profile.bankAccountName || "",
    bank_name: profile.bankName || "",
    bank_account_number: profile.bankAccountNumber || "",
    bank_branch_code: profile.bankBranchCode || "",
    bank_swift: profile.bankSwift || "",
    bank_iban: profile.bankIban || "",
    bank_reference: profile.bankReference || "",
    default_overtime_rule: profile.defaultOvertimeRule || "sa-film",
    default_ot_band1_hours: n(profile.defaultOtBand1Hours, 4),
    default_ot_band1_mult: n(profile.defaultOtBand1Mult, 1.5),
    default_ot_band2_mult: n(profile.defaultOtBand2Mult, 2),
    overtime_config: {},
    default_min_turnaround: n(profile.defaultMinTurnaround, 10),
    default_turnaround_mode: profile.defaultTurnaroundMode || "warning",
    default_turnaround_pen_mult: n(profile.defaultTurnaroundPenMult, 1.5),
    turnaround_config: {},
    default_invoice_detail_mode: "detailed",
    invoice_preferences: {
      mealBreaksDeducted: Boolean(profile.mealBreaksDeducted),
      travelTimePaid: Boolean(profile.travelTimePaid),
      equipmentRentalDaily: Boolean(profile.equipmentRentalDaily),
    },
  };
}
