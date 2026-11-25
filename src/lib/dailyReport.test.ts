import { describe, it, expect } from 'vitest';
import { computeStats } from '../../supabase/functions/_shared/dailyReport';

const day = '2026-11-25';
const act = (description: string, created_at: string, lead_id = 'L1', activity_type = 'call') => ({ owner_id: 'u', lead_id, activity_type, description, created_at });

describe('daily report', () => {
  it('answer rate = answered calls / call attempts', () => {
    const s = computeStats(day, [act('Appel passé — a décroché', '2026-11-25T09:00:00Z'), act('Appel passé — pas de réponse', '2026-11-25T10:00:00Z'), act('Appel passé — pas de réponse', '2026-11-25T11:00:00Z'), act('Appel passé — pas de réponse', '2026-11-25T11:30:00Z')], [], [], 0);
    expect(s.callAttempts).toBe(4);
    expect(s.callsAnswered).toBe(1);
    expect(s.answerRate).toBe(25);
  });
  it('show rate counts honored meetings vs no-shows', () => {
    const b = (id: string, status: string) => ({ id, lead_id: id, owner_id: 'u', rep: 'u', booking_date: day, time_slot: '14:00', status, created_at: '2026-11-20T10:00:00Z' });
    const s = computeStats(day, [], [b('a', 'completed'), b('b', 'confirmed'), b('c', 'cancelled')], [], 0, { b: 'noshow' });
    expect(s.meetingsShow).toBe(1);
    expect(s.meetingsNoShow).toBe(1);
    expect(s.meetingsCancelled).toBe(1);
    expect(s.showRate).toBe(50);
  });
  it('morning reminder is on time only if sent before the slot', () => {
    const b = { id: 'x', lead_id: 'L1', owner_id: 'u', rep: 'u', booking_date: day, time_slot: '14:00', status: 'confirmed', created_at: '2026-11-20T10:00:00Z' };
    const late = computeStats(day, [act('Message C · Rappel du matin envoyé', '2026-11-25T14:30:00Z', 'L1', 'whatsapp')], [b], [], 0);
    const ok = computeStats(day, [act('Message C · Rappel du matin envoyé', '2026-11-25T08:00:00Z', 'L1', 'whatsapp')], [b], [], 0);
    expect(late.remindersOnTime).toBe(0);
    expect(ok.remindersOnTime).toBe(1);
  });
});
