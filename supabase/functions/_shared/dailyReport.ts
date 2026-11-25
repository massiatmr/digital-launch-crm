// Dependency-free daily KPI computation shared by the daily-report-email function and tests.
export type Act = { owner_id: string; lead_id: string; activity_type: string; description: string | null; created_at: string };
export type Booking = { id: string; lead_id: string | null; owner_id: string; booking_date: string; time_slot: string | null; status: string; created_at: string; rep: string };
export type Reminder = { owner_id: string; due_date: string; done: boolean };
export type Stats = {
  callAttempts: number; callsAnswered: number; answerRate: number | null;
  bookingsTaken: number;
  meetingsToday: number; meetingsShow: number; meetingsNoShow: number; meetingsCancelled: number; showRate: number | null;
  confirmationsDue: number; confirmationsOnTime: number;
  remindersDue: number; remindersOnTime: number;
  followupsDue: number; followupsDone: number; followupMessages: number;
  signed: number;
};

const msgKey = (d: string | null) => (d || '').match(/^Message ([A-H]) ·/)?.[1] ?? null;
export const isAnswered = (d: string | null) => /a décroché/i.test(d || '');

/** Paris wall-clock of an ISO date as "YYYY-MM-DD HH:MM". */
export function parisStamp(iso: string, tz = 'Europe/Paris'): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/**
 * KPIs for one rep on `day` (YYYY-MM-DD, Paris). Confirmation B is on time if logged within 60 min of the booking;
 * morning reminder C is on time if logged before the meeting slot; follow-ups are reminders due that day and done.
 */
export function computeStats(day: string, acts: Act[], bookings: Booking[], reminders: Reminder[], signed: number, showByLead: Record<string, string> = {}): Stats {
  const todayActs = acts.filter((a) => parisStamp(a.created_at).startsWith(day));
  const calls = todayActs.filter((a) => a.activity_type === 'call');
  const answered = calls.filter((a) => isAnswered(a.description)).length;
  const msgs = (k: string, lead: string | null) => acts.filter((a) => a.lead_id === lead && msgKey(a.description) === k);

  const taken = bookings.filter((b) => parisStamp(b.created_at).startsWith(day));
  const confOk = taken.filter((b) => msgs('B', b.lead_id).some((a) => {
    const dt = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return dt >= -5 * 60_000 && dt <= 60 * 60_000;
  })).length;

  const meetings = bookings.filter((b) => b.booking_date === day);
  const active = meetings.filter((b) => b.status !== 'cancelled');
  const remOk = active.filter((b) => {
    const slot = `${day} ${(b.time_slot || '23:59').slice(0, 5)}`;
    return msgs('C', b.lead_id).some((a) => { const s = parisStamp(a.created_at); return s.startsWith(day) && s < slot; });
  }).length;
  const show = active.filter((b) => b.status === 'completed' || (b.lead_id && showByLead[b.lead_id] === 'show')).length;
  const noShow = active.filter((b) => b.status !== 'completed' && b.lead_id && showByLead[b.lead_id] === 'noshow').length;

  const due = reminders.filter((r) => r.due_date.slice(0, 10) <= day && parisStamp(r.due_date).startsWith(day));
  const rate = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  return {
    callAttempts: calls.length, callsAnswered: answered, answerRate: rate(answered, calls.length),
    bookingsTaken: taken.length,
    meetingsToday: meetings.length, meetingsShow: show, meetingsNoShow: noShow,
    meetingsCancelled: meetings.length - active.length, showRate: rate(show, show + noShow),
    confirmationsDue: taken.length, confirmationsOnTime: confOk,
    remindersDue: active.length, remindersOnTime: remOk,
    followupsDue: due.length, followupsDone: due.filter((r) => r.done).length,
    followupMessages: todayActs.filter((a) => ['E', 'G', 'H', 'A', 'D', 'F'].includes(msgKey(a.description) || '')).length,
    signed,
  };
}

export function hasActivity(s: Stats): boolean {
  return s.callAttempts + s.bookingsTaken + s.meetingsToday + s.followupsDue + s.followupMessages + s.signed > 0;
}
