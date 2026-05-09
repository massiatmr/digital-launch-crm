import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';

export type ConvLabel = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  workspace_id: string | null;
  owner_id: string;
};

const DEFAULT_LABELS = [
  { name: 'Chaud', color: '#EF4444', sort_order: 1 },
  { name: 'Tiède', color: '#F59E0B', sort_order: 2 },
  { name: 'Froid', color: '#3B82F6', sort_order: 3 },
  { name: 'Objection', color: '#EAB308', sort_order: 4 },
  { name: 'VIP', color: '#7C3AED', sort_order: 5 },
];

export function useConvLabels() {
  const wsId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['conv-labels', wsId],
    enabled: !!wsId,
    queryFn: async () => {
      let { data } = await supabase
        .from('conversation_labels')
        .select('*')
        .order('sort_order', { ascending: true });
      // Seed defaults if empty
      if (!data || data.length === 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('conversation_labels').insert(
            DEFAULT_LABELS.map((l) => ({ ...l, owner_id: user.id, workspace_id: wsId ?? null }))
          );
          const refetch = await supabase.from('conversation_labels').select('*').order('sort_order', { ascending: true });
          data = refetch.data;
        }
      }
      return (data ?? []) as ConvLabel[];
    },
  });
}

export function useAllLabelAssignments() {
  const wsId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['conv-label-assignments-all', wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data } = await supabase
        .from('conversation_label_assignments')
        .select('lead_id, label_id');
      return (data ?? []) as { lead_id: string; label_id: string }[];
    },
  });
}

export function useLeadLabels(leadId?: string) {
  return useQuery({
    queryKey: ['conv-label-assignments', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data } = await supabase
        .from('conversation_label_assignments')
        .select('label_id')
        .eq('lead_id', leadId!);
      return (data ?? []).map((d: any) => d.label_id) as string[];
    },
  });
}

export function useToggleLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, labelId, on }: { leadId: string; labelId: string; on: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      if (on) {
        const { data: lead } = await supabase.from('leads').select('workspace_id, owner_id').eq('id', leadId).maybeSingle();
        const { error } = await supabase.from('conversation_label_assignments').insert({
          lead_id: leadId,
          label_id: labelId,
          owner_id: (lead as any)?.owner_id ?? user.id,
          workspace_id: (lead as any)?.workspace_id ?? null,
        } as any);
        if (error && !`${error.message}`.includes('duplicate')) throw error;
      } else {
        const { error } = await supabase.from('conversation_label_assignments').delete()
          .eq('lead_id', leadId).eq('label_id', labelId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conv-label-assignments'] });
      qc.invalidateQueries({ queryKey: ['conv-label-assignments-all'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

export function useCreateLabel() {
  const qc = useQueryClient();
  const wsId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      const { error } = await supabase.from('conversation_labels').insert({
        name, color, owner_id: user.id, workspace_id: wsId ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Label créé');
      qc.invalidateQueries({ queryKey: ['conv-labels'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('conversation_labels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Label supprimé');
      qc.invalidateQueries({ queryKey: ['conv-labels'] });
      qc.invalidateQueries({ queryKey: ['conv-label-assignments-all'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}
