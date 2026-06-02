import type { CalendarAccount, CalendarProviderAdapter, BusyInterval } from "./types.ts";

// Implémentation minimale CalDAV (iCloud / Nextcloud / autres).
// Lecture seule pour FreeBusy via REPORT calendar-query; écriture événement via PUT iCalendar.

function authHeader(account: CalendarAccount): string {
  const creds = account.credentials as any;
  const user = creds?.email || creds?.username;
  const pass = creds?.app_password || creds?.password;
  if (!user || !pass) throw new Error("caldav_missing_credentials");
  return "Basic " + btoa(`${user}:${pass}`);
}

function calendarUrl(account: CalendarAccount): string {
  const creds = account.credentials as any;
  const base = creds?.server_url || (account.provider === "caldav" ? "https://caldav.icloud.com/" : "");
  const path = account.calendar_id || creds?.calendar_path || "";
  if (!base) throw new Error("caldav_missing_server_url");
  return base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}

function toIcsDate(iso: string): string {
  // 2026-06-02T14:30:00Z -> 20260602T143000Z
  return iso.replace(/[-:]/g, "").replace(/\.\d+/, "");
}

export const caldavCalendar: CalendarProviderAdapter = {
  async getFreeBusy(account, range) {
    const url = calendarUrl(account);
    const body = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${toIcsDate(range.timeMin)}" end="${toIcsDate(range.timeMax)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;
    const res = await fetch(url, {
      method: "REPORT",
      headers: { Authorization: authHeader(account), "Content-Type": "application/xml; charset=utf-8", Depth: "1" },
      body,
    });
    if (!res.ok) throw new Error(`caldav_freebusy_failed: ${res.status}`);
    const text = await res.text();
    const busy: BusyInterval[] = [];
    const eventBlocks = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
    for (const block of eventBlocks) {
      const dtStart = block.match(/DTSTART[^:]*:([0-9TZ]+)/)?.[1];
      const dtEnd = block.match(/DTEND[^:]*:([0-9TZ]+)/)?.[1];
      if (dtStart && dtEnd) {
        const s = `${dtStart.slice(0,4)}-${dtStart.slice(4,6)}-${dtStart.slice(6,8)}T${dtStart.slice(9,11)}:${dtStart.slice(11,13)}:${dtStart.slice(13,15)}Z`;
        const e = `${dtEnd.slice(0,4)}-${dtEnd.slice(4,6)}-${dtEnd.slice(6,8)}T${dtEnd.slice(9,11)}:${dtEnd.slice(11,13)}:${dtEnd.slice(13,15)}Z`;
        busy.push({ start: s, end: e });
      }
    }
    return busy;
  },

  async createEvent(account, ev) {
    const uid = crypto.randomUUID();
    const url = calendarUrl(account).replace(/\/$/, "") + `/${uid}.ics`;
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Lovable//CRM//FR",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
      `DTSTART:${toIcsDate(ev.startISO)}`,
      `DTEND:${toIcsDate(ev.endISO)}`,
      `SUMMARY:${(ev.summary || "").replace(/\n/g, " ")}`,
      ev.description ? `DESCRIPTION:${ev.description.replace(/\n/g, "\\n")}` : "",
      ev.location ? `LOCATION:${ev.location}` : "",
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: authHeader(account), "Content-Type": "text/calendar; charset=utf-8" },
      body: ics,
    });
    if (!res.ok && res.status !== 201 && res.status !== 204) {
      throw new Error(`caldav_create_event_failed: ${res.status}`);
    }
    return { externalEventId: uid, htmlLink: url };
  },

  async updateEvent(account, externalEventId, ev) {
    // Pour simplifier, on recrée l'ICS complet (PUT idempotent)
    return await this.createEvent(account, { summary: ev.summary || "", startISO: ev.startISO!, endISO: ev.endISO!, description: ev.description, location: ev.location });
  },

  async deleteEvent(account, externalEventId) {
    const url = calendarUrl(account).replace(/\/$/, "") + `/${externalEventId}.ics`;
    const res = await fetch(url, { method: "DELETE", headers: { Authorization: authHeader(account) } });
    if (!res.ok && res.status !== 404) throw new Error(`caldav_delete_event_failed: ${res.status}`);
  },
};
