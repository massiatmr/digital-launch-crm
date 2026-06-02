// Types partagés pour l'abstraction multi-providers calendrier
export type CalendarProvider = "google" | "microsoft" | "caldav" | "ical";

export interface CalendarAccount {
  id: string;
  workspace_id: string;
  provider: CalendarProvider;
  display_name: string | null;
  is_primary: boolean;
  sync_freebusy: boolean;
  calendar_id: string | null;
  credentials: Record<string, unknown>;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
}

export interface BusyInterval {
  start: string; // ISO
  end: string;   // ISO
}

export interface FreeBusyRange {
  timeMin: string; // ISO
  timeMax: string; // ISO
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  timeZone?: string;
  attendees?: { email: string; displayName?: string }[];
  createMeetLink?: boolean;
  location?: string;
}

export interface CalendarEventResult {
  externalEventId: string;
  htmlLink?: string;
  meetLink?: string;
  raw?: unknown;
}

export interface CalendarProviderAdapter {
  getFreeBusy(account: CalendarAccount, range: FreeBusyRange): Promise<BusyInterval[]>;
  createEvent(account: CalendarAccount, ev: CalendarEventInput): Promise<CalendarEventResult>;
  updateEvent(account: CalendarAccount, externalEventId: string, ev: Partial<CalendarEventInput>): Promise<CalendarEventResult>;
  deleteEvent(account: CalendarAccount, externalEventId: string): Promise<void>;
}
