import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useCronStatus() {
  return useQuery({
    queryKey: ['followup-cron-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_followup_cron_status' as any);
      if (error) throw error;
      return data as { active: boolean; jobname: string | null; schedule?: string; last_run_at?: string; last_run_status?: string };
    },
    refetchInterval: 30_000,
  });
}

export function useDueTasksCount(ownerId?: string) {
  return useQuery({
    queryKey: ['due-tasks-count', ownerId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('lead_followup_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .lte('scheduled_at', new Date().toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
}

export function useRunFollowupNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      const { data, error } = await supabase.functions.invoke('process-followup-tasks', {
        body: { owner_id: user.id },
      });
      if (error) throw error;
      return data as { processed: number; results: any[] };
    },
    onSuccess: (data) => {
      toast.success(`${data.processed} tâche(s) traitée(s)`);
      qc.invalidateQueries({ queryKey: ['due-tasks-count'] });
      qc.invalidateQueries({ queryKey: ['followup-tasks'] });
      qc.invalidateQueries({ queryKey: ['wa-messages'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur exécution'),
  });
}
