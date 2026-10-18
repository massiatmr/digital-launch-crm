import { supabase } from '@/integrations/supabase/client';

/** Accept invitations before reading memberships, including on session restoration. */
export async function loadWorkspaceAccess(userId: string) {
  const { error: invitationError } = await supabase.rpc('accept_pending_workspace_invitations');
  if (invitationError) throw invitationError;

  const { data: memberships, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', userId);
  if (membershipError) throw membershipError;
  const ids = (memberships || []).map((membership) => membership.workspace_id);
  if (ids.length === 0) return [];
  const { data: workspaces, error } = await supabase.from('workspaces').select('*').in('id', ids);
  if (error) throw error;
  const roles = new Map((memberships || []).map((membership) => [membership.workspace_id, membership.role]));
  return (workspaces || []).map((workspace) => ({ ...workspace, role: roles.get(workspace.id) }));
}