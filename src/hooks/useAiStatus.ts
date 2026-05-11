import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AiStatusValue =
  | 'active'
  | 'paused'
  | 'snoozed'
  | 'resolved'
  | 'idle_no_task'
  | 'blocked'
  | 'unknown';

export type AiStatusResponse = {
  status: AiStatusValue;
  reason: string | null;
  settings_found: boolean;
  settings_scope: 'workspace' | 'owner' | null;
  is_enabled: boolean;
  trigger_sources: string[] | null;
  lead_source: string;
  steps_count: number;
  pending_tasks: number;
  paused_at: string | null;
  snoozed_until: string | null;
  resolved_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  next_task: { id: string; task_type: string; scheduled_at: string; status: string } | null;
};

export function useAiStatus(leadId?: string) {
  return useQuery({
    queryKey: ['ai-status', leadId],
    enabled: !!leadId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_lead_ai_status', { p_lead_id: leadId });
      if (error) throw error;
      return data as AiStatusResponse;
    },
  });
}

export function useAiMonitor(limit = 100, workspaceId?: string | null) {
  return useQuery({
    queryKey: ['ai-monitor', limit, workspaceId ?? null],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('list_ai_monitor', { p_limit: limit, p_workspace_id: workspaceId ?? null });
      if (error) throw error;
      return (data ?? []) as Array<{
        lead_id: string;
        name: string;
        phone: string | null;
        source: string;
        status: string;
        created_at: string;
        automation_paused_at: string | null;
        snoozed_until: string | null;
        resolved_at: string | null;
        pending_tasks: number;
        next_scheduled_at: string | null;
        last_inbound_at: string | null;
        last_outbound_at: string | null;
      }>;
    },
  });
}

export function aiStatusLabel(s?: AiStatusResponse | null) {
  if (!s) return { label: '…', tone: 'muted' as const };
  switch (s.status) {
    case 'active': return { label: 'IA active', tone: 'success' as const };
    case 'paused': return { label: 'En pause', tone: 'warning' as const };
    case 'snoozed': return { label: 'En sourdine', tone: 'warning' as const };
    case 'resolved': return { label: 'Résolue', tone: 'muted' as const };
    case 'idle_no_task': return { label: 'IA en attente', tone: 'warning' as const };
    case 'blocked': return { label: 'IA bloquée', tone: 'danger' as const };
    default: return { label: 'Inconnu', tone: 'muted' as const };
  }
}

export function aiReasonLabel(reason?: string | null): string {
  if (!reason) return '';
  if (reason.startsWith('snoozed_until_')) return 'En sourdine jusqu\'à ' + reason.replace('snoozed_until_', '');
  const map: Record<string, string> = {
    no_settings: 'Aucun réglage IA configuré pour ce workspace/utilisateur',
    automation_disabled: 'Automation désactivée dans les réglages',
    source_not_in_triggers: 'Source du lead non incluse dans les déclencheurs IA',
    no_sequence_steps: 'Aucune étape de séquence configurée',
    conversation_resolved: 'Conversation marquée comme résolue',
    manually_paused: 'Mise en pause manuellement',
    lead_replied_no_pending_task: 'Le lead a répondu, aucune tâche IA en file — relance manuelle nécessaire',
    no_pending_task: 'Aucune tâche IA programmée',
  };
  return map[reason] ?? reason;
}
