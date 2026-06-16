import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCurrentWorkspaceId } from './useWorkspaces';

export interface AvailabilitySettings {
  owner_id: string;
  workspace_id?: string | null;
  working_days: number[]; // 0=Sun .. 6=Sat
  day_start_time: string;
  day_end_time: string;
  slot_duration_minutes: number;
  max_future_days: number;
  min_lead_time_hours: number;
  timezone: string;
  morning_slot?: string;
  afternoon_slot?: string;
  day_hours?: Record<string, { start: string; end: string }>;
}

export interface Blackout {
  id: string;
  owner_id: string;
  workspace_id?: string | null;
  blackout_date: string;
  reason: string;
}

const DEFAULT: Omit<AvailabilitySettings, 'owner_id'> = {
  working_days: [1, 2, 3, 4, 5],
  day_start_time: '11:00',
  day_end_time: '15:00',
  slot_duration_minutes: 45,
  max_future_days: 14,
  min_lead_time_hours: 2,
  timezone: 'Europe/Paris',
};

export function useAvailabilitySettings() {
  const { user } = useAuth();
  const workspaceId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['availability_settings', workspaceId ?? user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AvailabilitySettings> => {
      let query = (supabase as any).from('availability_settings').select('*');
      if (workspaceId) query = query.eq('workspace_id', workspaceId);
      else query = query.eq('owner_id', user!.id).is('workspace_id', null);
      const { data } = await query.maybeSingle();
      return { owner_id: user!.id, workspace_id: workspaceId, ...DEFAULT, ...(data ?? {}) } as AvailabilitySettings;
    },
  });
}

export function useUpsertAvailabilitySettings() {
  const { user } = useAuth();
  const workspaceId = useCurrentWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<AvailabilitySettings, 'owner_id'>>) => {
      if (!user?.id) throw new Error('not_authed');
      let q = (supabase as any).from('availability_settings').select('*');
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      else q = q.eq('owner_id', user.id).is('workspace_id', null);
      const { data: existing } = await q.maybeSingle();

      const merged: any = {
        ...DEFAULT,
        ...(existing ?? {}),
        ...patch,
        owner_id: existing?.owner_id || user.id,
        workspace_id: workspaceId ?? null,
      };

      if (existing?.owner_id) {
        let upd = (supabase as any)
          .from('availability_settings')
          .update(merged)
          .eq('owner_id', existing.owner_id);
        upd = workspaceId
          ? upd.eq('workspace_id', workspaceId)
          : upd.is('workspace_id', null);
        const { error } = await upd;
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('availability_settings')
          .insert(merged);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability_settings'] });
      qc.invalidateQueries({ queryKey: ['weekly-availability'] });
    },
  });
}

export function useBlackouts() {
  const { user } = useAuth();
  const workspaceId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['availability_blackouts', workspaceId ?? user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Blackout[]> => {
      let q = (supabase as any).from('availability_blackouts').select('*');
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      else q = q.eq('owner_id', user!.id).is('workspace_id', null);
      const { data } = await q.order('blackout_date', { ascending: true });
      return (data as Blackout[]) ?? [];
    },
  });
}

export function useToggleBlackout() {
  const { user } = useAuth();
  const workspaceId = useCurrentWorkspaceId();
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
          .insert({ owner_id: user.id, workspace_id: workspaceId ?? null, blackout_date: date });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability_blackouts'] });
      qc.invalidateQueries({ queryKey: ['weekly-availability'] });
    },
  });
}
