export type OTRuleId = "sa-film" | "sa-bcea" | "custom";
export type TurnaroundMode = "warning" | "penalty" | "manual";
export type InvoiceDetailMode = "summary" | "detailed" | "summary_timesheet";

export interface RateMemory {
  productionName: string;
  dayRate: number;
  includedHours: number;
  overtimeRule: OTRuleId;
  otBand1Hours: number;
  otBand1Mult: number;
  otBand2Mult: number;
  equipmentRental: number;
  perDiem: number;
  vat: number;
  minTurnaround: number;
  turnaroundMode: TurnaroundMode;
  turnaroundPenMult: number;
  travelPaid: boolean;
  mealDeducted: boolean;
  updatedAt: string;
}

export interface CrewClient {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  billingAddress: string;
  vatNumber: string;
  poRequired: boolean;
  vendorNumber: string;
  accountsEmail: string;
  paymentTerms: string;
  preferredInvoiceDetailMode: InvoiceDetailMode;
  defaultPaymentTerms: string;
  rateMemory?: RateMemory;
  notes: string;
}

export interface CrewProfile {
  fullName: string;
  role: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  vatNumber: string;
  businessLogoDataUrl: string;
  vatRegistered: boolean;
  invoiceLabel: string;
  paymentTerms: string;
  invoiceNumberHistory: string[];
  defaultCurrency: string;
  defaultDayRate: number;
  defaultIncludedHours: number;
  defaultEquipmentRental: number;
  defaultPerDiem: number;
  defaultVat: number;
  defaultOvertimeRule: OTRuleId;
  defaultOtBand1Hours: number;
  defaultOtBand1Mult: number;
  defaultOtBand2Mult: number;
  defaultMinTurnaround: number;
  defaultTurnaroundMode: TurnaroundMode;
  defaultTurnaroundPenMult: number;
  mealBreaksDeducted: boolean;
  travelTimePaid: boolean;
  equipmentRentalDaily: boolean;
  bankAccountName: string;
  bankName: string;
  bankAccountNumber: string;
  bankBranchCode: string;
  bankSwift: string;
  bankIban: string;
  bankReference: string;
}

export interface Phase3AppDataLike {
  dataVersion: number;
  profile: CrewProfile;
  clients: CrewClient[];
  timesheets: unknown[];
  invoices: unknown[];
  onboardingDismissed: boolean;
}

export interface UserPreferencesModel {
  onboardingDismissed: boolean;
  uiPreferences: Record<string, unknown>;
}

export interface ImportCounts {
  business_settings: number;
  user_preferences: number;
  clients: number;
  rate_presets: number;
}

export interface CrewTimesheetEntry {
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
  expenseDescription: string;
  dayRateUsed?: number;
  includedHoursUsed?: number;
  overtimeRuleUsed?: OTRuleId;
  otBand1HoursUsed?: number;
  otBand1MultUsed?: number;
  otBand2MultUsed?: number;
  equipmentRentalUsed?: number;
  perDiemUsed?: number;
  vatRateUsed?: number;
  travelPaidUsed?: boolean;
  mealDeductedUsed?: boolean;
  turnaroundRuleUsed?: TurnaroundMode;
  turnaroundMinimumHoursUsed?: number;
  turnaroundPenaltyMultUsed?: number;
  calcOnSetHours?: number;
  calcMealHours?: number;
  calcTravelHours?: number;
  calcPaidHours?: number;
  calcOvertimeHours?: number;
  calcOvertimeCost?: number;
  calcDayTotal?: number;
  calcSnapshot?: unknown;
  isSunday: boolean;
  isPublicHoliday: boolean;
}

export interface CrewTimesheet {
  id: string;
  timesheetNumber: string;
  productionName: string;
  clientId?: string;
  clientName?: string;
  clientIncomplete?: boolean;
  crewName: string;
  role: string;
  startDate?: string;
  notes?: string;
  currency: string;
  vat: number;
  status: "open" | "submitted" | "invoiced";
  entries: CrewTimesheetEntry[];
  paymentTerms?: string;
  defaultDayRate?: number;
  defaultIncludedHours?: number;
  defaultEquipmentRental?: number;
  defaultPerDiem?: number;
  defaultOvertimeRule?: OTRuleId;
  defaultOtBand1Hours?: number;
  defaultOtBand1Mult?: number;
  defaultOtBand2Mult?: number;
  defaultMinTurnaround?: number;
  defaultTurnaroundMode?: TurnaroundMode;
  defaultTurnaroundPenMult?: number;
  mealBreaksDeducted?: boolean;
  travelTimePaid?: boolean;
  equipmentRentalDaily?: boolean;
  summarySnapshot?: unknown;
  invoiceId?: string;
  createdAt: string;
}

export type CrewInvoiceStatus = "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled";

export interface CrewInvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  isExtra?: boolean;
  taxable?: boolean;
  category?: "day-rate" | "overtime" | "equipment" | "travel" | "expenses" | "turnaround" | "additional";
  sourceEntryId?: string;
}

export interface CrewInvoiceSellerSnapshot {
  fullName: string;
  role: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  vatRegistered: boolean;
  vatNumber: string;
  invoiceLabel: string;
  businessLogoDataUrl: string;
}

export interface CrewPayment {
  id: string;
  paymentDate: string;
  amount: number;
  method: string;
  reference: string;
  notes: string;
}

export interface CrewInvoice {
  id: string;
  invoiceNumber: string;
  poNumber?: string;
  issueDate: string;
  dueDate: string;
  clientId?: string;
  clientName: string;
  client?: CrewClient;
  crewName: string;
  role: string;
  companyName: string;
  sellerLogoDataUrl?: string;
  sellerSnapshot?: CrewInvoiceSellerSnapshot;
  productionName?: string;
  timesheetNumber: string;
  timesheetDates?: string;
  detailMode?: InvoiceDetailMode;
  lineItems: CrewInvoiceLine[];
  timesheetBreakdown?: CrewInvoiceLine[];
  subtotal: number;
  vat: number;
  vatAmount: number;
  total: number;
  paidAmount?: number;
  paidDate?: string;
  balanceDue?: number;
  currency: string;
  status: CrewInvoiceStatus;
  banking: Record<string, string>;
  paymentTerms?: string;
  paymentNotes: string;
  notes?: string;
  fromTimesheetId: string;
  payments?: CrewPayment[];
  createdAt: string;
}
