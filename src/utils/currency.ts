import { CURRENCIES } from '@/constants'
import type { Currency } from '@/types'

/**
 * Format a number as currency with proper locale and symbol.
 * e.g. formatCurrency(3250, 'ZAR') → 'R 3,250.00'
 */
export function formatCurrency(amount: number | string, currency: Currency = 'USD'): string {
  const config = CURRENCIES[currency] ?? CURRENCIES.USD
  const value = parseFloat(String(amount)) || 0
  const formatted = new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  return `${config.symbol} ${formatted}`
}

/**
 * Format a number with 2 decimal places and comma separators.
 * Used inside PDF templates where Intl may not apply.
 */
export function formatNumber(n: number | string): string {
  return parseFloat(String(n || 0))
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Get the currency symbol for a given currency code. */
export function getCurrencySymbol(currency: Currency): string {
  return CURRENCIES[currency]?.symbol ?? '$'
}
