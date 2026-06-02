/**
 * Phone utilities — supports a per-workspace default country code.
 *
 * @param defaultCountryCode digits only, no '+' (e.g. "33", "213", "1").
 *   When omitted, falls back to "33" (France) for backward compatibility.
 */

function normalize(phone: string, defaultCountryCode: string = '33'): string {
  const cc = (defaultCountryCode || '33').replace(/\D/g, '') || '33';
  let cleaned = (phone || '').replace(/[\s\-.()\u00A0]/g, '');
  if (!cleaned) return '';

  // Already international
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);

  // Local number starting with 0 → prepend default country code
  if (cleaned.startsWith('0')) {
    return '+' + cc + cleaned.slice(1);
  }

  // Bare digits already prefixed with country code (e.g. "213555...")
  if (cleaned.startsWith(cc)) {
    return '+' + cleaned;
  }

  // Otherwise assume it's a local number missing the leading 0
  return '+' + cc + cleaned;
}

/**
 * Format a phone number for WhatsApp link (wa.me).
 */
export function toWhatsAppUrl(phone: string, defaultCountryCode?: string): string {
  const intl = normalize(phone, defaultCountryCode);
  const digits = intl.startsWith('+') ? intl.slice(1) : intl;
  return `https://wa.me/${digits}`;
}

/**
 * Format phone for display, grouped by 2 digits after the country code.
 * Examples:
 *   "0612345678" + cc=33  → "+33 6 12 34 56 78"
 *   "0555123456" + cc=213 → "+213 5 55 12 34 56"
 */
export function formatPhoneDisplay(phone: string, defaultCountryCode?: string): string {
  const intl = normalize(phone, defaultCountryCode);
  if (!intl.startsWith('+')) return phone;
  const cc = (defaultCountryCode || '33').replace(/\D/g, '') || '33';
  // Try to detect the country code length (default cc first, then 1-3)
  const candidates = [cc, intl.slice(1, 4), intl.slice(1, 3), intl.slice(1, 2)];
  let code = cc;
  for (const k of candidates) {
    if (intl.slice(1).startsWith(k)) { code = k; break; }
  }
  const rest = intl.slice(1 + code.length);
  if (!rest) return '+' + code;
  const head = rest.slice(0, 1);
  const tail = rest.slice(1).match(/.{1,2}/g)?.join(' ') ?? '';
  return `+${code} ${head}${tail ? ' ' + tail : ''}`.trim();
}
