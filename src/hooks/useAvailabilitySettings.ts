import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface AvailabilitySettings {
  owner_id: string;
  working_days: number[]; // 0=Sun .. 6=Sat
  day_start_time: string;       // "HH:MM"
  day_end_time: string;         // "HH:MM"
  slot_duration_minutes: number;
  max_future_days: number;
  min_lead_time_hours: number;
  timezone: string;
  // legacy (ignorés par l'UI mais lus depuis la table)
  morning_slot?: string;
  afternoon_slot?: string;
}

export interface Blackout {
  id: string;
  owner_id: string;
  blackout_date: string; // YYYY-MM-DD
  reason: string;
}

const DEFAULT: Omit<AvailabilitySettings, 'owner_id'> = {
  working_days: [1, 2, 3, 4, 5],
  day_start_time: '11:00',
  day_end_time: '15:00',
  slot_duration_minutes: 45,
  max_future_days: 14,
  timezone: 'Europe/Paris',
};

export function useAvailabilitySettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['availability_settings', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AvailabilitySettings> => {
      const { data } = await (supabase as any)
        .from('availability_settings')
        .select('*')
        .eq('owner_id', user!.id)
        .maybeSingle();
      return { owner_id: user!.id, ...DEFAULT, ...(data ?? {}) } as AvailabilitySettings;
    },
  });
}

export function useUpsertAvailabilitySettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<AvailabilitySettings, 'owner_id'>>) => {
      if (!user?.id) throw new Error('not_authed');
      const { data: existing } = await (supabase as any)
        .from('availability_settings')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();
      const merged = { owner_id: user.id, ...DEFAULT, ...(existing ?? {}), ...patch };
      const { error } = await (supabase as any)
        .from('availability_settings')
        .upsert(merged, { onConflict: 'owner_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability_settings', user?.id] });
      qc.invalidateQueries({ queryKey: ['weekly-availability'] });
    },
  });
}

export function useBlackouts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['availability_blackouts', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Blackout[]> => {
      const { data } = await (supabase as any)
        .from('availability_blackouts')
        .select('*')
        .eq('owner_id', user!.id)
        .order('blackout_date', { ascending: true });
      return (data as Blackout[]) ?? [];
    },
  });
}

export function useToggleBlackout() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, existingId }: { date: string; existingId?: string }) => {
      if (!user?.id) throw new Error('not_authed');
      if (existingId) {
        const { error } = await (supabase as any)
          .from('availability_blackouts')
          .delete()
          .eq('id', existingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('availability_blackouts')
          .insert({ owner_id: user.id, blackout_date: date });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability_blackouts', user?.id] });
      qc.invalidateQueries({ queryKey: ['weekly-availability'] });
    },
  });
}
