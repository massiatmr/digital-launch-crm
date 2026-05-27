import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';
import { toast } from 'sonner';

export type FollowupScriptPhase =
  | 'missed_appointment'
  | 'no_response_3d'
  | 'no_response_10d'
  | 'final_attempt'
  | 'post_offer'
  | 'custom';

export interface FollowupScript {
  id: string;
  owner_id: string;
  workspace_id: string | null;
  phase: FollowupScriptPhase;
  title: string;
  content: string;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const PHASE_LABELS: Record<FollowupScriptPhase, string> = {
  missed_appointment: 'RDV manqué',
  no_response_3d: 'Sans réponse 3-4 j',
  no_response_10d: 'Sans réponse 10 j',
  final_attempt: 'Dernière tentative',
  post_offer: 'Après proposition',
  custom: 'Personnalisé',
};

export const PHASE_ORDER: FollowupScriptPhase[] = [
  'missed_appointment',
  'no_response_3d',
  'no_response_10d',
  'final_attempt',
  'post_offer',
  'custom',
];

export function useFollowupScripts() {
  const workspaceId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['followup-scripts', workspaceId ?? 'legacy'],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;

      // Seed defaults only if none exist FOR THIS WORKSPACE (or legacy owner-only)
      let existingQ = supabase.from('followup_scripts').select('id').limit(1);
      if (workspaceId) {
        existingQ = existingQ.eq('workspace_id', workspaceId);
      } else if (userId) {
        existingQ = existingQ.eq('owner_id', userId).is('workspace_id', null);
      }
      const { data: existing } = await existingQ;

      if ((!existing || existing.length === 0) && userId) {
        await supabase.rpc('seed_default_followup_scripts' as any, {
          p_owner: userId,
          p_workspace: workspaceId,
        });
      }

      let q = supabase
        .from('followup_scripts')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (workspaceId) {
        q = q.eq('workspace_id', workspaceId);
      } else if (userId) {
        q = q.eq('owner_id', userId).is('workspace_id', null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as FollowupScript[];
    },
  });
}

export function useUpsertFollowupScript() {
  const qc = useQueryClient();
  const workspaceId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (payload: Partial<FollowupScript> & { id?: string }) => {
      if (payload.id) {
        const { data, error } = await supabase
          .from('followup_scripts')
          .update({
            phase: payload.phase,
            title: payload.title,
            content: payload.content,
            sort_order: payload.sort_order,
            is_enabled: payload.is_enabled,
          } as any)
          .eq('id', payload.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from('followup_scripts')
          .insert({
            owner_id: userRes.user?.id,
            workspace_id: workspaceId,
            phase: payload.phase || 'custom',
            title: payload.title || 'Nouveau script',
            content: payload.content || '',
            sort_order: payload.sort_order ?? 99,
            is_enabled: payload.is_enabled ?? true,
          } as any)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followup-scripts'] });
      toast.success('Script enregistré');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteFollowupScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('followup_scripts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followup-scripts'] });
      toast.success('Script supprimé');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
