/**
 * Format a phone number for WhatsApp link (remove spaces, dashes, dots).
 * Ensures French numbers starting with 0 get +33 prefix.
 */
export function toWhatsAppUrl(phone: string): string {
  let cleaned = phone.replace(/[\s\-.()\u00A0]/g, '');
  // French number starting with 0 → +33
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '+33' + cleaned.slice(1);
  }
  // Remove leading + for wa.me format
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  return `https://wa.me/${digits}`;
}

/**
 * Format phone for display: +33 6 12 34 56 78
 */
export function formatPhoneDisplay(phone: string): string {
  let cleaned = phone.replace(/[\s\-.()\u00A0]/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '+33' + cleaned.slice(1);
  }
  if (cleaned.startsWith('+33') && cleaned.length === 12) {
    return `+33 ${cleaned[3]} ${cleaned.slice(4, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8, 10)} ${cleaned.slice(10, 12)}`;
  }
  return phone;
}
