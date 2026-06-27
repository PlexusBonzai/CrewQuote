import { currentYear } from './date'
import type { Quote, Invoice, Timesheet } from '@/types'

/** Generate a unique ID using timestamp + random string */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Generate the next sequential quote number for the current year.
 * Format: Q-2026-0001
 */
export function generateQuoteNumber(existingQuotes: Quote[]): string {
  const year  = currentYear()
  const prefix = `Q-${year}`
  const count  = existingQuotes.filter(q => q.quoteNumber?.startsWith(prefix)).length + 1
  return `${prefix}-${String(count).padStart(4, '0')}`
}

/**
 * Generate the next sequential invoice number for the current year.
 * Format: I-2026-0001
 */
export function generateInvoiceNumber(existingInvoices: Invoice[]): string {
  const year  = currentYear()
  const prefix = `I-${year}`
  const count  = existingInvoices.filter(i => i.invoiceNumber?.startsWith(prefix)).length + 1
  return `${prefix}-${String(count).padStart(4, '0')}`
}

/**
 * Generate the next sequential timesheet number for the current year.
 * Format: T-2026-0001
 */
export function generateTimesheetNumber(existingTimesheets: Timesheet[]): string {
  const year  = currentYear()
  const prefix = `T-${year}`
  const count  = existingTimesheets.filter(t => t.timesheetNumber?.startsWith(prefix)).length + 1
  return `${prefix}-${String(count).padStart(4, '0')}`
}
