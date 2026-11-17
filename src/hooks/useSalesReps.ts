import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SalesRep = { user_id: string; email: string; role: 'owner' | 'member'; receives_leads: boolean };

export function repLabel(email?: string | null) {
  if (!email) return '—';
  const n = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}
export function repInitials(email?: string | null) {
  const parts = repLabel(email).split(' ').filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export function useSalesReps(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ['sales-reps', workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<SalesRep[]> => {
      const { data, error } = await supabase.rpc('list_workspace_sales_reps' as any, { _workspace_id: workspaceId });
      if (error) throw error;
      return (data || []) as SalesRep[];
    },
  });
}

export function useAssignmentMode(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ['lead-assignment-mode', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase.from('workspaces').select('lead_assignment_mode').eq('id', workspaceId!).maybeSingle();
      if (error) throw error;
      return ((data as any)?.lead_assignment_mode || 'manual') as 'manual' | 'round_robin';
    },
  });
}

export function useSetAssignmentMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, mode }: { workspaceId: string; mode: 'manual' | 'round_robin' }) => {
      const { error } = await supabase.rpc('set_lead_assignment_mode' as any, { _workspace_id: workspaceId, _mode: mode });
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['lead-assignment-mode', v.workspaceId] }),
  });
}

export function useSetReceivesLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, userId, value }: { workspaceId: string; userId: string; value: boolean }) => {
      const { error } = await supabase.rpc('set_member_receives_leads' as any, { _workspace_id: workspaceId, _user_id: userId, _value: value });
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['sales-reps', v.workspaceId] }),
  });
}

export function useAssignLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, userId }: { leadId: string; userId: string | null }) => {
      const { error } = await supabase.from('leads').update({ assigned_to: userId } as any).eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}
