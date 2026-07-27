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
