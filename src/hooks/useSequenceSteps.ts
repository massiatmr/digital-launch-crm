import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';

export type SequenceStep = {
  id: string;
  owner_id: string;
  step_order: number;
  task_type: string;
  delay_value: number;
  delay_unit: 'minutes' | 'hours' | 'days';
  template_id: string | null;
  label: string;
  is_enabled: boolean;
};

export function useSequenceSteps() {
  const workspaceId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['sequence-steps', workspaceId],
    queryFn: async () => {
      let query = supabase
        .from('followup_sequence_steps')
        .select('*')
        .order('step_order', { ascending: true });
      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        query = query.eq('owner_id', user.id).is('workspace_id', null);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SequenceStep[];
    },
  });
}

export function useUpsertSequenceStep() {
  const qc = useQueryClient();
  const workspaceId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (step: Partial<SequenceStep> & { id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      if (step.id) {
        const { error } = await (supabase.from('followup_sequence_steps').update(step as any)).eq('id', step.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('followup_sequence_steps').insert({
          ...step,
          owner_id: user.id,
          workspace_id: workspaceId ?? null,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sequence-steps'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur sauvegarde étape'),
  });
}

export function useDeleteSequenceStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('followup_sequence_steps').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Étape supprimée');
      qc.invalidateQueries({ queryKey: ['sequence-steps'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

export function useReorderSequenceSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: { id: string; step_order: number }[]) => {
      for (const s of ordered) {
        const { error } = await (supabase.from('followup_sequence_steps').update({ step_order: s.step_order } as any)).eq('id', s.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sequence-steps'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur réordonnancement'),
  });
}

