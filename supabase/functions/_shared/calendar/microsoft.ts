import type { CalendarAccount, CalendarProviderAdapter, BusyInterval } from "./types.ts";

async function refreshAccessToken(account: CalendarAccount): Promise<string> {
  if (account.access_token && account.expires_at && new Date(account.expires_at).getTime() > Date.now() + 60_000) {
    return account.access_token;
  }
  if (!account.refresh_token) throw new Error("microsoft_no_refresh_token");
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("microsoft_oauth_not_configured");
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
      scope: "offline_access Calendars.ReadWrite",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`microsoft_refresh_failed: ${JSON.stringify(j)}`);
  return j.access_token as string;
}

export const microsoftCalendar: CalendarProviderAdapter = {
  async getFreeBusy(account, range) {
    const token = await refreshAccessToken(account);
    const email = (account.credentials as any)?.email || account.calendar_id;
    if (!email) throw new Error("microsoft_missing_email");
    const res = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        schedules: [email],
        startTime: { dateTime: range.timeMin, timeZone: "UTC" },
        endTime: { dateTime: range.timeMax, timeZone: "UTC" },
        availabilityViewInterval: 30,
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`microsoft_freebusy_failed: ${JSON.stringify(j)}`);
    const items = j?.value?.[0]?.scheduleItems ?? [];
    return items
      .filter((i: any) => i.status !== "free")
      .map((i: any) => ({ start: i.start?.dateTime, end: i.end?.dateTime })) as BusyInterval[];
  },

  async createEvent(account, ev) {
    const token = await refreshAccessToken(account);
    const body: Record<string, unknown> = {
      subject: ev.summary,
      body: { contentType: "HTML", content: ev.description || "" },
      start: { dateTime: ev.startISO, timeZone: ev.timeZone || "Europe/Paris" },
      end: { dateTime: ev.endISO, timeZone: ev.timeZone || "Europe/Paris" },
      attendees: (ev.attendees || []).map(a => ({ emailAddress: { address: a.email, name: a.displayName }, type: "required" })),
      location: ev.location ? { displayName: ev.location } : undefined,
      isOnlineMeeting: !!ev.createMeetLink,
      onlineMeetingProvider: ev.createMeetLink ? "teamsForBusiness" : undefined,
    };
    const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`microsoft_create_event_failed: ${JSON.stringify(j)}`);
    return { externalEventId: j.id, htmlLink: j.webLink, meetLink: j.onlineMeeting?.joinUrl, raw: j };
  },

  async updateEvent(account, externalEventId, ev) {
    const token = await refreshAccessToken(account);
    const body: Record<string, unknown> = {};
    if (ev.summary) body.subject = ev.summary;
    if (ev.description) body.body = { contentType: "HTML", content: ev.description };
    if (ev.startISO) body.start = { dateTime: ev.startISO, timeZone: ev.timeZone || "Europe/Paris" };
    if (ev.endISO) body.end = { dateTime: ev.endISO, timeZone: ev.timeZone || "Europe/Paris" };
    if (ev.location) body.location = { displayName: ev.location };
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(externalEventId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`microsoft_update_event_failed: ${JSON.stringify(j)}`);
    return { externalEventId: j.id, htmlLink: j.webLink, meetLink: j.onlineMeeting?.joinUrl, raw: j };
  },

  async deleteEvent(account, externalEventId) {
    const token = await refreshAccessToken(account);
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(externalEventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`microsoft_delete_event_failed: ${res.status}`);
  },
};
