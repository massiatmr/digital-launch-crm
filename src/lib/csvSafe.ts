// Neutralizes spreadsheet formula injection in exported CSV cells.
// Plain phone numbers like "+33 6 12 34 56 78" or "-12.5" are left untouched.
export function csvSafeText(v: unknown): string {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=@\t\r]/.test(s) || /^[+-](?![\d\s().]*$)/.test(s)) return `'${s}`;
  return s;
}
