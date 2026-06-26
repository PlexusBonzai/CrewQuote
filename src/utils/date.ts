/**
 * Format a date string (YYYY-MM-DD) as a human-readable date.
 * e.g. '2026-06-15' → '15 Jun 2026'
 */
export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(dateStr + 'T12:00:00'))
  } catch {
    return dateStr
  }
}

/**
 * Format a date string for use in PDF documents.
 * e.g. '2026-06-15' → '15 June 2026'
 */
export function formatDateLong(dateStr: string | undefined | null): string {
  if (!dateStr) return ''
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(dateStr + 'T12:00:00'))
  } catch {
    return dateStr
  }
}

/** Return today's date as YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().split('T')[0]
}

/** Return the current year as a number */
export function currentYear(): number {
  return new Date().getFullYear()
}
