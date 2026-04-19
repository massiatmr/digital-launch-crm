import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type WorkspaceMember = {
  user_id: string;
  email: string;
  role: 'owner' | 'member';
  created_at: string;
};

export function useWorkspaceMembers(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ['workspace-members', workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<WorkspaceMember[]> => {
      const { data, error } = await supabase.rpc('list_workspace_members' as any, { _workspace_id: workspaceId });
      if (error) throw error;
      return (data || []) as WorkspaceMember[];
    },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, userId }: { workspaceId: string; userId: string }) => {
      const { error } = await supabase.rpc('remove_workspace_member' as any, {
        _workspace_id: workspaceId, _user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['workspace-members', vars.workspaceId] }),
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, userId, role }: { workspaceId: string; userId: string; role: 'owner' | 'member' }) => {
      const { error } = await supabase.rpc('update_workspace_member_role' as any, {
        _workspace_id: workspaceId, _user_id: userId, _role: role,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['workspace-members', vars.workspaceId] }),
  });
}
