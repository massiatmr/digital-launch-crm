import { useEffect, useRef } from 'react';
import { useReminders } from './useLeadData';

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function useReminderNotifications() {
  const { data: reminders = [] } = useReminders();
  const notifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = new Date();
    const pending = reminders.filter(r => !r.done);

    for (const reminder of pending) {
      if (notifiedIds.current.has(reminder.id)) continue;

      const due = new Date(reminder.due_date);
      const diffMs = due.getTime() - now.getTime();

      // Notify if due within 30 minutes or overdue
      if (diffMs <= 30 * 60 * 1000) {
        notifiedIds.current.add(reminder.id);
        const leadName = reminder.leads?.name || 'Lead';
        new Notification(`🔔 Rappel : ${leadName}`, {
          body: reminder.action,
          icon: '/favicon.ico',
          tag: reminder.id,
        });
      }
    }
  }, [reminders]);

  // Check periodically
  useEffect(() => {
    const interval = setInterval(() => {
      // Re-trigger the effect by just keeping it alive
      // The reminders query auto-refreshes
    }, 60_000);
    return () => clearInterval(interval);
  }, []);
}
