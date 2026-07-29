import { getCurrentUserId } from "../data/cloudDataProvider";
import type { CrewInvoice, CrewInvoiceLine, CrewPayment } from "../data/crewquoteTypes";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { invoiceSnapshotForCloud } from "../data/mappers/invoiceMapper";
import { markPhase5MigrationCompletedForUser, readLocalDataOwnerId, writePhase5InvoiceMirror } from "../data/localCompatibilityStore";
import { completeImportBatch, failImportBatch, findCompletedImportBatch, startImportBatch } from "./importBatchService";
import { createInvoice, listInvoicesWithLinesAndPayments } from "./invoiceService";

const SOURCE = "localstorage-phase-5-invoices";

export type Phase5MigrationStage = "preparing" | "validating" | "checking-previous" | "resolving-relationships" | "importing-invoices" | "importing-lines" | "importing-payments" | "verifying" | "updating-compatibility" | "complete" | "already-migrated";
export interface Phase5MigrationCounts { invoices: number; invoice_lines: number; payments: number }
export interface Phase5MigrationSummary { invoiceCount: number; lineCount: number; paymentCount: number; protectedCount: number; paidCount: number; outstandingTotal: number }
export interface Phase5MigrationPreflight { invoices: CrewInvoice[]; fingerprint: string; summary: Phase5MigrationSummary }
export interface Phase5MigrationResult { fingerprint: string; alreadyCompleted: boolean; counts: Phase5MigrationCounts }
export type Phase5Progress = (stage: Phase5MigrationStage, counts: Phase5MigrationCounts) => void;

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const decimalEqual = (left: unknown, right: unknown) => Math.abs(n(left) - n(right)) < 0.000001;
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => { out[key] = canonicalize((value as Record<string, unknown>)[key]); return out; }, {});
  return value;
}
const equalJson = (left: unknown, right: unknown) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
async function sha256(value: unknown) { const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value))); const hash = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }

function stableLines(invoiceId: string, lines: CrewInvoiceLine[] = [], collection: string): CrewInvoiceLine[] {
  return lines.map((line, index) => ({ ...line, id: line.id || `${invoiceId}:line:${collection}:${line.sourceEntryId || index}` }));
}

function stablePayments(invoice: CrewInvoice): CrewPayment[] {
  if (invoice.payments?.length) return invoice.payments.map((payment, index) => ({ ...payment, id: payment.id || `${invoice.id}:payment:${payment.reference || index}` }));
  if (n(invoice.paidAmount) <= 0) return [];
  return [{ id: `${invoice.id}:payment:legacy-summary`, paymentDate: invoice.paidDate || invoice.issueDate, amount: n(invoice.paidAmount), method: "", reference: invoice.invoiceNumber || "", notes: "Imported from the saved Invoice payment summary." }];
}

export function preparePhase5Invoices(invoices: CrewInvoice[]): CrewInvoice[] {
  return invoices.map(invoice => ({ ...invoice, lineItems: stableLines(invoice.id, invoice.lineItems, "item"), timesheetBreakdown: stableLines(invoice.id, invoice.timesheetBreakdown, "breakdown"), payments: stablePayments(invoice) }));
}

function assertPrepared(invoices: CrewInvoice[]) {
  const invoiceIds = new Set<string>(); const invoiceNumbers = new Set<string>(); const lineIds = new Set<string>(); const paymentIds = new Set<string>();
  for (const invoice of invoices) {
    if (!invoice.id || invoiceIds.has(invoice.id)) throw new Error("CrewQuote cannot migrate duplicate or missing Invoice IDs."); invoiceIds.add(invoice.id);
    if (!invoice.invoiceNumber || !invoice.issueDate || !invoice.dueDate) throw new Error(`Invoice ${invoice.id} is missing a required saved number or date.`);
    if (invoiceNumbers.has(invoice.invoiceNumber)) throw new Error(`Invoice number ${invoice.invoiceNumber} appears more than once. The deployed per-user Invoice-number constraint requires a unique saved number before migration.`); invoiceNumbers.add(invoice.invoiceNumber);
    if (Number.isNaN(Date.parse(`${invoice.issueDate}T00:00:00Z`)) || Number.isNaN(Date.parse(`${invoice.dueDate}T00:00:00Z`)) || invoice.dueDate < invoice.issueDate) throw new Error(`Invoice ${invoice.invoiceNumber} has an invalid saved issue or due date.`);
    if (!["ZAR", "USD", "GBP", "EUR"].includes(invoice.currency)) throw new Error(`Invoice ${invoice.invoiceNumber} uses an unsupported saved currency.`);
    if (!["draft", "sent", "paid", "partial", "overdue", "cancelled"].includes(invoice.status) || !["summary", "detailed", "summary_timesheet"].includes(invoice.detailMode || "detailed")) throw new Error(`Invoice ${invoice.invoiceNumber} has an unsupported saved status or detail mode.`);
    if ([invoice.subtotal, invoice.vat, invoice.vatAmount, invoice.total, invoice.paidAmount || 0, invoice.balanceDue ?? 0].some(value => n(value) < 0)) throw new Error(`Invoice ${invoice.invoiceNumber} has a negative saved financial value.`);
    if (n(invoice.paidAmount) > n(invoice.total) + 0.000001) throw new Error(`Invoice ${invoice.invoiceNumber} has a saved paid amount greater than its total.`);
    for (const line of [...(invoice.lineItems || []), ...(invoice.timesheetBreakdown || [])]) {
      if (!line.id || lineIds.has(line.id)) throw new Error(`Invoice ${invoice.invoiceNumber} has a duplicate or missing line ID.`); lineIds.add(line.id);
      if (n(line.quantity) < 0 || n(line.unitPrice) < 0 || n(line.amount) < 0) throw new Error(`Invoice ${invoice.invoiceNumber} has a negative saved line value.`);
    }
    for (const payment of invoice.payments || []) { if (!payment.id || paymentIds.has(payment.id) || !payment.paymentDate || n(payment.amount) <= 0) throw new Error(`Invoice ${invoice.invoiceNumber} has an invalid Payment record.`); paymentIds.add(payment.id); }
    const paymentTotal = (invoice.payments || []).reduce((sum, payment) => sum + n(payment.amount), 0);
    if (!decimalEqual(paymentTotal, invoice.paidAmount || 0)) throw new Error(`Invoice ${invoice.invoiceNumber} has Payment records that do not match its saved paid amount.`);
  }
}

export function summarizePhase5Source(invoices: CrewInvoice[]): Phase5MigrationSummary {
  return { invoiceCount: invoices.length, lineCount: invoices.reduce((sum, invoice) => sum + invoice.lineItems.length + (invoice.timesheetBreakdown?.length || 0), 0), paymentCount: invoices.reduce((sum, invoice) => sum + (invoice.payments?.length || 0), 0), protectedCount: invoices.filter(invoice => invoice.status !== "draft").length, paidCount: invoices.filter(invoice => invoice.status === "paid").length, outstandingTotal: invoices.reduce((sum, invoice) => sum + Math.max(n(invoice.balanceDue ?? n(invoice.total) - n(invoice.paidAmount)), 0), 0) };
}

export async function createPhase5MigrationFingerprint(invoices: CrewInvoice[]) {
  return sha256(invoices.map(invoice => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, issueDate: invoice.issueDate, dueDate: invoice.dueDate, status: invoice.status, detailMode: invoice.detailMode, sourceTimesheetLegacyId: invoice.fromTimesheetId, snapshot: invoiceSnapshotForCloud(invoice), lines: [...invoice.lineItems, ...(invoice.timesheetBreakdown || [])], subtotal: invoice.subtotal, vat: invoice.vat, vatAmount: invoice.vatAmount, total: invoice.total, paidAmount: invoice.paidAmount, balanceDue: invoice.balanceDue, payments: invoice.payments })).sort((a, b) => a.id.localeCompare(b.id)));
}

export async function preflightPhase5InvoiceMigration(input: { ownerUserId: string; authenticatedUserId: string; localInvoices: CrewInvoice[] }): Promise<CloudResult<Phase5MigrationPreflight>> {
  try {
    const user = await getCurrentUserId();
    if (user.error || !user.data || user.data !== input.authenticatedUserId || user.data !== input.ownerUserId || readLocalDataOwnerId() !== user.data) return cloudFail("This browser's Invoice recovery data belongs to a different account. Sign in with the owning account before migrating Invoices.");
    if (!input.localInvoices.length) return cloudFail("There are no browser-local Invoices available for Phase 5 migration.");
    const invoices = preparePhase5Invoices(input.localInvoices); assertPrepared(invoices);
    return cloudOk({ invoices, fingerprint: await createPhase5MigrationFingerprint(invoices), summary: summarizePhase5Source(invoices) });
  } catch (error) { return cloudFail(error); }
}

function comparableInvoice(invoice: CrewInvoice) {
  return {
    ...invoice,
    sellerLogoDataUrl: "",
    sellerSnapshot: invoice.sellerSnapshot ? { ...invoice.sellerSnapshot, businessLogoDataUrl: "" } : undefined,
    timesheetBreakdown: invoice.timesheetBreakdown || [],
    paidAmount: invoice.paidAmount || 0,
    balanceDue: invoice.balanceDue ?? Math.max(n(invoice.total) - n(invoice.paidAmount), 0),
    payments: [...(invoice.payments || [])].sort((left, right) => `${left.paymentDate}:${left.id}`.localeCompare(`${right.paymentDate}:${right.id}`)),
    createdAt: invoice.createdAt ? new Date(invoice.createdAt).toISOString() : "",
  };
}

async function verify(invoices: CrewInvoice[]) {
  const cloud = await listInvoicesWithLinesAndPayments(invoices); if (cloud.error || !cloud.data) throw new Error(cloud.error || "CrewQuote could not read the imported Invoices.");
  const expected = new Map(invoices.map(invoice => [invoice.id, invoice])); const actual = new Map(cloud.data.filter(invoice => expected.has(invoice.id)).map(invoice => [invoice.id, invoice]));
  if (actual.size !== expected.size) throw new Error("Invoice migration verification found a header-count mismatch.");
  for (const [id, source] of expected) {
    const saved = actual.get(id); if (!saved) throw new Error(`Invoice migration verification could not find ${source.invoiceNumber}.`);
    if (!decimalEqual(saved.subtotal, source.subtotal) || !decimalEqual(saved.vat, source.vat) || !decimalEqual(saved.vatAmount, source.vatAmount) || !decimalEqual(saved.total, source.total) || !decimalEqual(saved.paidAmount, source.paidAmount) || !decimalEqual(saved.balanceDue, source.balanceDue ?? Math.max(n(source.total) - n(source.paidAmount), 0))) throw new Error(`Invoice migration verification found a financial mismatch for ${source.invoiceNumber}.`);
    if (!equalJson(comparableInvoice(saved), comparableInvoice(source))) throw new Error(`Invoice migration verification found a saved snapshot, line, Payment, status, date, or relationship mismatch for ${source.invoiceNumber}.`);
  }
  return cloud.data;
}

export async function migratePreparedInvoices(invoices: CrewInvoice[], appVersion: string, dataVersion: number, onProgress?: Phase5Progress): Promise<CloudResult<Phase5MigrationResult>> {
  const counts: Phase5MigrationCounts = { invoices: 0, invoice_lines: 0, payments: 0 }; let batchId = "";
  try {
    onProgress?.("validating", counts); const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    if (readLocalDataOwnerId() !== user.data) return cloudFail("This browser's Invoice recovery data belongs to a different account."); assertPrepared(invoices);
    const fingerprint = await createPhase5MigrationFingerprint(invoices); onProgress?.("checking-previous", counts);
    const completed = await findCompletedImportBatch(fingerprint, SOURCE); if (completed.error) return cloudFail(completed.error);
    if (completed.data) { onProgress?.("verifying", counts); const cloud = await verify(invoices); writePhase5InvoiceMirror(user.data, cloud); markPhase5MigrationCompletedForUser(user.data, fingerprint); onProgress?.("already-migrated", counts); return cloudOk({ fingerprint, alreadyCompleted: true, counts }); }
    const started = await startImportBatch(fingerprint, appVersion, dataVersion, SOURCE); if (started.error || !started.data) return cloudFail(started.error || "CrewQuote could not start the Invoice import."); batchId = started.data;
    onProgress?.("resolving-relationships", counts);
    for (const invoice of invoices) {
      onProgress?.("importing-invoices", counts); const saved = await createInvoice(invoice); if (saved.error) throw new Error(saved.error);
      counts.invoices++; counts.invoice_lines += invoice.lineItems.length + (invoice.timesheetBreakdown?.length || 0); onProgress?.("importing-lines", counts);
      counts.payments += invoice.payments?.length || 0; onProgress?.("importing-payments", counts);
    }
    onProgress?.("verifying", counts); const cloud = await verify(invoices); onProgress?.("updating-compatibility", counts); writePhase5InvoiceMirror(user.data, cloud);
    const done = await completeImportBatch(batchId, { ...counts }); if (done.error) throw new Error(done.error); markPhase5MigrationCompletedForUser(user.data, fingerprint); onProgress?.("complete", counts);
    return cloudOk({ fingerprint, alreadyCompleted: false, counts });
  } catch (error) { if (batchId) await failImportBatch(batchId, { ...counts }); return cloudFail(error); }
}
