// Helpers to display a booking's wall-clock time (stored as date + "HH:MM" in
// the workspace timezone, default Europe/Paris) in another timezone.

export const OWNER_DEFAULT_TZ = 'Europe/Paris';

/**
 * Convert a wall-clock (date "YYYY-MM-DD", time "HH:MM") interpreted in `tz`
 * into the absolute UTC Date instant.
 */
export function wallTimeToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  // Initial guess: treat the wall time as if it were UTC.
  const guess = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guess))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asTz = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  const offset = asTz - guess; // tz minus UTC at that instant
  return new Date(guess - offset);
}

/** Format an absolute Date as "HH:MM" in a given timezone. */
export function formatTimeInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

/** Short label for a timezone (city). e.g. "Europe/Paris" → "Paris". */
export function tzShortLabel(tz: string): string {
  const seg = tz.split('/').pop() || tz;
  return seg.replace(/_/g, ' ');
}

/** The viewer's browser timezone, e.g. "Europe/Paris". */
export function getViewerTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || OWNER_DEFAULT_TZ;
  } catch {
    return OWNER_DEFAULT_TZ;
  }
}

/** Default timezone hint based on currency code (used as a fallback). */
const CURRENCY_TZ: Record<string, string> = {
  EUR: 'Europe/Paris', GBP: 'Europe/London', CHF: 'Europe/Zurich',
  USD: 'America/New_York', CAD: 'America/Toronto', AUD: 'Australia/Sydney',
  MAD: 'Africa/Casablanca', DZD: 'Africa/Algiers', TND: 'Africa/Tunis',
  AED: 'Asia/Dubai', SAR: 'Asia/Riyadh', JPY: 'Asia/Tokyo', CNY: 'Asia/Shanghai',
};
export function tzFromCurrency(code: string | null | undefined): string | null {
  if (!code) return null;
  return CURRENCY_TZ[code.toUpperCase()] || null;
}

/** Pick the best display timezone for an end-user (browser first, currency fallback, owner last). */
export function resolveClientTz(currency?: string | null, ownerTz: string = OWNER_DEFAULT_TZ): string {
  const browser = getViewerTz();
  if (browser && browser !== 'UTC') return browser;
  return tzFromCurrency(currency) || ownerTz;
}

/**
 * Convert a wall-clock owner time slot into the viewer's local time.
 * Returns null when both timezones produce the same wall time.
 */
export function viewerTimeLabel(
  bookingDate: string,
  timeSlot: string,
  ownerTz: string = OWNER_DEFAULT_TZ,
  viewerTz: string = getViewerTz(),
): { time: string; tz: string } | null {
  if (!viewerTz || viewerTz === ownerTz) return null;
  try {
    const utc = wallTimeToUtc(bookingDate, timeSlot, ownerTz);
    const viewerTime = formatTimeInTz(utc, viewerTz);
    if (viewerTime === timeSlot) return null;
    return { time: viewerTime, tz: tzShortLabel(viewerTz) };
  } catch {
    return null;
  }
}

/**
 * Returns the client-side display string for a booking time when the client
 * timezone is known and differs from the owner timezone. Otherwise null.
 */
export function clientTimeLabel(
  bookingDate: string,
  timeSlot: string,
  clientTz: string | null | undefined,
  ownerTz: string = OWNER_DEFAULT_TZ,
): { time: string; tz: string } | null {
  if (!clientTz || clientTz === ownerTz) return null;
  try {
    const utc = wallTimeToUtc(bookingDate, timeSlot, ownerTz);
    return { time: formatTimeInTz(utc, clientTz), tz: tzShortLabel(clientTz) };
  } catch {
    return null;
  }
}
