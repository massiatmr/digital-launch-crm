import type { CalendarAccount, CalendarProviderAdapter, BusyInterval } from "./types.ts";

// Provider lecture seule : on parse un flux .ics public.
// Aucune écriture possible (createEvent/updateEvent/deleteEvent renvoient une erreur explicite).

function parseIcsDate(raw: string): string | null {
  // Formats supportés : 20260602T143000Z, 20260602T143000, 20260602
  if (/^\d{8}T\d{6}Z$/.test(raw)) {
    return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T${raw.slice(9,11)}:${raw.slice(11,13)}:${raw.slice(13,15)}Z`;
  }
  if (/^\d{8}T\d{6}$/.test(raw)) {
    return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T${raw.slice(9,11)}:${raw.slice(11,13)}:${raw.slice(13,15)}Z`;
  }
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T00:00:00Z`;
  }
  return null;
}

export const icalCalendar: CalendarProviderAdapter = {
  async getFreeBusy(account, range) {
    const creds = account.credentials as any;
    const url = creds?.url || account.calendar_id;
    if (!url) throw new Error("ical_missing_url");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ical_fetch_failed: ${res.status}`);
    const text = await res.text();
    const busy: BusyInterval[] = [];
    const blocks = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
    const min = new Date(range.timeMin).getTime();
    const max = new Date(range.timeMax).getTime();
    for (const block of blocks) {
      const dtStart = block.match(/DTSTART[^:]*:([0-9TZ]+)/)?.[1];
      const dtEnd = block.match(/DTEND[^:]*:([0-9TZ]+)/)?.[1];
      if (!dtStart || !dtEnd) continue;
      const s = parseIcsDate(dtStart);
      const e = parseIcsDate(dtEnd);
      if (!s || !e) continue;
      const st = new Date(s).getTime();
      const et = new Date(e).getTime();
      if (et < min || st > max) continue;
      busy.push({ start: s, end: e });
    }
    return busy;
  },

  createEvent() { throw new Error("ical_is_read_only"); },
  updateEvent() { throw new Error("ical_is_read_only"); },
  deleteEvent() { return Promise.resolve(); },
};
