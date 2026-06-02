import type { CalendarAccount, CalendarEventInput, CalendarEventResult, CalendarProviderAdapter, BusyInterval, FreeBusyRange } from "./types.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function refreshAccessToken(account: CalendarAccount): Promise<string> {
  if (account.access_token && account.expires_at && new Date(account.expires_at).getTime() > Date.now() + 60_000) {
    return account.access_token;
  }
  if (!account.refresh_token) throw new Error("google_no_refresh_token");
  const clientId = Deno.env.get("Google_Client_id")!;
  const clientSecret = Deno.env.get("Client_secret")!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`google_refresh_failed: ${JSON.stringify(j)}`);
  await admin().from("calendar_accounts").update({
    access_token: j.access_token,
    expires_at: new Date(Date.now() + Number(j.expires_in || 3500) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  } as any).eq("id", account.id);
  return j.access_token as string;
}

export const googleCalendar: CalendarProviderAdapter = {
  async getFreeBusy(account, range) {
    const token = await refreshAccessToken(account);
    const calId = account.calendar_id || "primary";
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: range.timeMin, timeMax: range.timeMax, items: [{ id: calId }] }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`google_freebusy_failed: ${JSON.stringify(j)}`);
    const busy = j?.calendars?.[calId]?.busy ?? [];
    return (busy as { start: string; end: string }[]).map(b => ({ start: b.start, end: b.end })) as BusyInterval[];
  },

  async createEvent(account, ev) {
    const token = await refreshAccessToken(account);
    const calId = account.calendar_id || "primary";
    const body: Record<string, unknown> = {
      summary: ev.summary,
      description: ev.description,
      location: ev.location,
      start: { dateTime: ev.startISO, timeZone: ev.timeZone || "Europe/Paris" },
      end: { dateTime: ev.endISO, timeZone: ev.timeZone || "Europe/Paris" },
      attendees: ev.attendees,
    };
    if (ev.createMeetLink) {
      body.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
    }
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?conferenceDataVersion=1&sendUpdates=all`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`google_create_event_failed: ${JSON.stringify(j)}`);
    return {
      externalEventId: j.id,
      htmlLink: j.htmlLink,
      meetLink: j.hangoutLink,
      raw: j,
    };
  },

  async updateEvent(account, externalEventId, ev) {
    const token = await refreshAccessToken(account);
    const calId = account.calendar_id || "primary";
    const body: Record<string, unknown> = {};
    if (ev.summary) body.summary = ev.summary;
    if (ev.description) body.description = ev.description;
    if (ev.location) body.location = ev.location;
    if (ev.startISO) body.start = { dateTime: ev.startISO, timeZone: ev.timeZone || "Europe/Paris" };
    if (ev.endISO) body.end = { dateTime: ev.endISO, timeZone: ev.timeZone || "Europe/Paris" };
    if (ev.attendees) body.attendees = ev.attendees;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(externalEventId)}?sendUpdates=all`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`google_update_event_failed: ${JSON.stringify(j)}`);
    return { externalEventId: j.id, htmlLink: j.htmlLink, meetLink: j.hangoutLink, raw: j };
  },

  async deleteEvent(account, externalEventId) {
    const token = await refreshAccessToken(account);
    const calId = account.calendar_id || "primary";
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(externalEventId)}?sendUpdates=all`;
    const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok && res.status !== 410 && res.status !== 404) {
      throw new Error(`google_delete_event_failed: ${res.status}`);
    }
  },
};

export type { FreeBusyRange, CalendarEventInput, CalendarEventResult };
