import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspaceId } from './useWorkspaces';
import { resolveSop, type SopConfig } from '@/lib/sop';

export function useSopConfig(workspaceId?: string | null) {
  const current = useCurrentWorkspaceId();
  const ws = workspaceId ?? current;
  return useQuery({
    queryKey: ['sop-config', ws],
    enabled: !!ws,
    staleTime: 60_000,
    queryFn: async (): Promise<SopConfig> => {
      const { data } = await supabase.from('workspaces').select('sop_config').eq('id', ws!).maybeSingle();
      return resolveSop((data as any)?.sop_config);
    },
  });
}

export function useSaveSopConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, config }: { workspaceId: string; config: SopConfig }) => {
      const { error } = await supabase.from('workspaces').update({ sop_config: config } as any).eq('id', workspaceId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['sop-config', v.workspaceId] }),
  });
}
