import { createContext, useContext, useEffect, useMemo, useState, ReactNode, createElement } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { applyBrandToElement } from '@/lib/brandColor';

export interface Workspace {
  id: string;
  company_name: string;
  legal_name: string | null;
  siret: string | null;
  vat_number: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  signature_url: string | null;
  slug: string | null;
  brand_color: string | null;
  email_sender_name: string | null;
  email_signature: string | null;
  default_country_code: string | null;
  onboarding_completed: boolean;
  created_by: string | null;
  role?: 'owner' | 'member';
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentWorkspaceId: string | null;
  switchWorkspace: (id: string) => void;
  isLoading: boolean;
  refetch: () => void;
}

const STORAGE_KEY = 'current_workspace_id';

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaces: [],
  currentWorkspace: null,
  currentWorkspaceId: null,
  switchWorkspace: () => {},
  isLoading: true,
  refetch: () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });

  const { data: workspaces = [], isLoading, refetch } = useQuery({
    queryKey: ['workspaces', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Workspace[]> => {
      const { data: memberships, error: mErr } = await supabase
        .from('workspace_members' as any)
        .select('workspace_id, role')
        .eq('user_id', user!.id);
      if (mErr) throw mErr;
      const ids = (memberships || []).map((m: any) => m.workspace_id);
      if (ids.length === 0) return [];
      const { data: ws, error } = await supabase
        .from('workspaces' as any)
        .select('*')
        .in('id', ids);
      if (error) throw error;
      const roleMap = new Map((memberships as any[]).map((m) => [m.workspace_id, m.role]));
      return (ws as any[]).map((w) => ({ ...w, role: roleMap.get(w.id) }));
    },
  });

  // Auto-select first workspace if none selected or invalid
  useEffect(() => {
    // Keep the persisted workspace during the auth/query bootstrap. Otherwise a
    // page refresh briefly sees `workspaces=[]`, clears state, then falls back to
    // Digital Launch even when the user was working in another workspace.
    if (!user?.id || isLoading) return;

    if (workspaces.length === 0) {
      if (currentId !== null) setCurrentId(null);
      return;
    }
    const valid = workspaces.some((w) => w.id === currentId);
    if (!valid) {
      // Priorité au workspace "Digital Launch" s'il existe
      const preferred = workspaces.find((w) =>
        (w.company_name || '').toLowerCase().includes('digital launch')
      );
      const next = (preferred || workspaces[0]).id;
      setCurrentId(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    }
  }, [workspaces, currentId, user?.id, isLoading]);

  const switchWorkspace = (id: string) => {
    setCurrentId(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
    // Remove caches scoped to a specific workspace to avoid flashing previous data
    const scopedKeys = [
      'leads', 'reminders', 'scripts', 'messages', 'activities',
      'followup-tasks', 'wa-messages', 'conv-state', 'wa-inbox',
      'due-tasks-count', 'followup-settings', 'sequence-steps',
      'clients', 'offers', 'bookings', 'weekly-availability', 'meta-pages',
      'meta-campaigns',
    ];
    scopedKeys.forEach((k) => qc.removeQueries({ queryKey: [k] }));
    // Invalidate all queries so data refetches with new workspace context
    qc.invalidateQueries();
  };

  const currentWorkspace = useMemo(
    () => workspaces.find((w) => w.id === currentId) || null,
    [workspaces, currentId]
  );

  // Apply the workspace brand color globally so the entire CRM follows it.
  useEffect(() => {
    applyBrandToElement(currentWorkspace?.brand_color || null);
  }, [currentWorkspace?.brand_color]);

  const value: WorkspaceContextValue = {
    workspaces,
    currentWorkspace,
    currentWorkspaceId: currentId,
    switchWorkspace,
    isLoading,
    refetch,
  };

  return createElement(WorkspaceContext.Provider, { value }, children);
}

export function useWorkspaces() {
  return useContext(WorkspaceContext);
}

export function useCurrentWorkspaceId(): string | null {
  return useContext(WorkspaceContext).currentWorkspaceId;
}

/** Default country code (digits only, no '+') for the current workspace. Falls back to "33". */
export function useDefaultCountryCode(): string {
  const ws = useContext(WorkspaceContext).currentWorkspace;
  const cc = (ws?.default_country_code || '33').replace(/\D/g, '');
  return cc || '33';
}
