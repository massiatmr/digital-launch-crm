import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspaces } from './useWorkspaces';
import { useIsAdmin } from './useWorkspaceFeatures';

export type PermissionKey =
  | 'dashboard' | 'conversations' | 'campaigns' | 'clients' | 'tasks'
  | 'offers' | 'bookings' | 'ai_monitor' | 'automation' | 'scripts' | 'trash' | 'import';

export const PERMISSIONS: { key: PermissionKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'tasks', label: 'Tâches' },
  { key: 'bookings', label: 'Rendez-vous' },
  { key: 'clients', label: 'Clients' },
  { key: 'offers', label: 'Offres' },
  { key: 'campaigns', label: 'Campagnes' },
  { key: 'ai_monitor', label: 'Monitoring IA' },
  { key: 'automation', label: 'Automatisation & IA' },
  { key: 'scripts', label: 'Scripts de relance' },
  { key: 'trash', label: 'Corbeille' },
  { key: 'import', label: 'Import de leads' },
];

/** Default access for a member (non-owner) with no custom settings. */
export const DEFAULT_MEMBER_PERMISSIONS: Record<PermissionKey, boolean> = {
  dashboard: true, conversations: true, tasks: true, bookings: true, scripts: true,
  clients: false, offers: false, campaigns: false, ai_monitor: false, automation: false, trash: false, import: false,
};

export function resolvePermissions(raw: any): Record<PermissionKey, boolean> {
  return { ...DEFAULT_MEMBER_PERMISSIONS, ...(raw && typeof raw === 'object' ? raw : {}) };
}

/** Route prefix -> permission. Pipeline and account settings are always allowed. */
export const ROUTE_PERMISSIONS: { prefix: string; perm: PermissionKey }[] = [
  { prefix: '/dashboard', perm: 'dashboard' },
  { prefix: '/conversations', perm: 'conversations' },
  { prefix: '/campaigns', perm: 'campaigns' },
  { prefix: '/clients', perm: 'clients' },
  { prefix: '/reminders', perm: 'tasks' },
  { prefix: '/offers', perm: 'offers' },
  { prefix: '/bookings', perm: 'bookings' },
  { prefix: '/ai-monitor', perm: 'ai_monitor' },
  { prefix: '/import', perm: 'import' },
  { prefix: '/settings/automation', perm: 'automation' },
  { prefix: '/settings/ai-behavior', perm: 'automation' },
  { prefix: '/settings/scripts', perm: 'scripts' },
  { prefix: '/settings/trash', perm: 'trash' },
];

export function permForPath(path: string): PermissionKey | undefined {
  return ROUTE_PERMISSIONS.find((r) => path === r.prefix || path.startsWith(r.prefix + '/') || (r.prefix !== '/' && path.startsWith(r.prefix)))?.perm;
}

/** Current user's permissions in the current workspace. Owners and admins can do everything. */
export function useMyPermissions() {
  const { user } = useAuth();
  const { currentWorkspace, currentWorkspaceId } = useWorkspaces();
  const { data: isAdmin = false, isLoading: adminLoading } = useIsAdmin();
  const isOwner = currentWorkspace?.role === 'owner' || isAdmin;
  const q = useQuery({
    queryKey: ['my-permissions', currentWorkspaceId, user?.id],
    enabled: !!user && !!currentWorkspaceId && !isOwner,
    queryFn: async () => {
      const { data } = await (supabase.from('workspace_members' as any) as any)
        .select('permissions').eq('workspace_id', currentWorkspaceId).eq('user_id', user!.id).maybeSingle();
      return resolvePermissions(data?.permissions);
    },
  });
  const perms = q.data ?? DEFAULT_MEMBER_PERMISSIONS;
  const can = (k?: PermissionKey) => !k || isOwner || !!perms[k];
  return { can, isOwner, isLoading: adminLoading || (!isOwner && q.isLoading) };
}

export function useMemberPermissions(workspaceId: string, userId: string) {
  return useQuery({
    queryKey: ['member-permissions', workspaceId, userId],
    queryFn: async () => {
      const { data } = await (supabase.from('workspace_members' as any) as any)
        .select('permissions').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
      return resolvePermissions(data?.permissions);
    },
  });
}

export function useSetMemberPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, userId, permissions }: { workspaceId: string; userId: string; permissions: Record<PermissionKey, boolean> }) => {
      const { error } = await (supabase.from('workspace_members' as any) as any)
        .update({ permissions } as any).eq('workspace_id', workspaceId).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['member-permissions', v.workspaceId, v.userId] });
      qc.invalidateQueries({ queryKey: ['my-permissions'] });
    },
  });
}
