/**
 * Parse a user-typed amount into a canonical decimal string.
 * Handles thousands separators ("1,000" / "1.000,50") and single decimal commas ("24,50").
 * Returns null when the input is not a positive amount.
 */
export function parseAmountInput(raw: string): string | null {
  let s = raw.trim()
  if (!s) return null

  const commas = (s.match(/,/g) ?? []).length
  const dots = (s.match(/\./g) ?? []).length

  if (commas > 0 && dots > 0) {
    // Both present: the rightmost one is the decimal separator, the other is thousands.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (commas === 1 && /,\d{3}$/.test(s) && !/^\d{4,}/.test(s.split(',')[0])) {
    // A single comma followed by exactly three digits reads as a thousands separator
    // ("1,000" means one thousand, not one). Strip it.
    s = s.replace(',', '')
  } else if (commas >= 1) {
    // Decimal comma ("24,50") or repeated thousands separators ("1,000,000")
    s = commas > 1 ? s.replace(/,/g, '') : s.replace(',', '.')
  }

  if (!/^\d+(\.\d+)?$/.test(s) || Number(s) <= 0) return null
  return s
}

/** Local calendar date as YYYY-MM-DD (NOT the UTC day — matters west/east of Greenwich). */
export function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
