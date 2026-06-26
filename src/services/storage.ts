import { STORAGE_KEYS, DEFAULT_SETTINGS } from '@/constants'
import type { Quote, Invoice, Timesheet, CrewProfile, UserSettings } from '@/types'

// ============================================================================
// Storage Service — localStorage-backed persistence
// This service is the single source of truth for all persisted data.
// Designed to be swappable for Supabase in a future version.
// ============================================================================

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.error(`[Storage] Failed to save "${key}":`, err)
  }
}

// ── Quotes ─────────────────────────────────────────────────────────────────

export function loadQuotes(): Quote[] {
  return safeGet<Quote[]>(STORAGE_KEYS.QUOTES, [])
}

export function saveQuotes(quotes: Quote[]): void {
  safeSet(STORAGE_KEYS.QUOTES, quotes)
}

// ── Invoices ───────────────────────────────────────────────────────────────

export function loadInvoices(): Invoice[] {
  return safeGet<Invoice[]>(STORAGE_KEYS.INVOICES, [])
}

export function saveInvoices(invoices: Invoice[]): void {
  safeSet(STORAGE_KEYS.INVOICES, invoices)
}

// ── Timesheets ─────────────────────────────────────────────────────────────

export function loadTimesheets(): Timesheet[] {
  return safeGet<Timesheet[]>(STORAGE_KEYS.TIMESHEETS, [])
}

export function saveTimesheets(timesheets: Timesheet[]): void {
  safeSet(STORAGE_KEYS.TIMESHEETS, timesheets)
}

// ── Profiles ───────────────────────────────────────────────────────────────

export function loadProfiles(): CrewProfile[] {
  return safeGet<CrewProfile[]>(STORAGE_KEYS.PROFILES, [])
}

export function saveProfiles(profiles: CrewProfile[]): void {
  safeSet(STORAGE_KEYS.PROFILES, profiles)
}

// ── Settings ───────────────────────────────────────────────────────────────

export function loadSettings(): UserSettings {
  const saved = safeGet<Partial<UserSettings>>(STORAGE_KEYS.SETTINGS, {})
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    bankingDetails: {
      ...DEFAULT_SETTINGS.bankingDetails,
      ...(saved.bankingDetails ?? {}),
    },
  }
}

export function saveSettings(settings: UserSettings): void {
  safeSet(STORAGE_KEYS.SETTINGS, settings)
}

// ── Load All (for app bootstrap) ───────────────────────────────────────────

export function loadAllData() {
  return {
    quotes:     loadQuotes(),
    invoices:   loadInvoices(),
    timesheets: loadTimesheets(),
    profiles:   loadProfiles(),
    settings:   loadSettings(),
  }
}
