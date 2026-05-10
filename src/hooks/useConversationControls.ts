import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';

// ============== STATE (pause / snooze / resolved) ==============
export type ConvControlState = {
  lead_id: string;
  state: string | null;
  automation_paused_at: string | null;
  snoozed_until: string | null;
  resolved_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
};

export function useConvControls(leadId?: string) {
  const wsId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['conv-controls', wsId, leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_conversation_state')
        .select('*')
        .eq('lead_id', leadId!)
        .maybeSingle();
      return (data ?? null) as ConvControlState | null;
    },
  });
}

export function useAllConvControls() {
  const wsId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['conv-controls-all', wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_conversation_state')
        .select('lead_id, automation_paused_at, snoozed_until, resolved_at');
      return (data ?? []) as ConvControlState[];
    },
  });
}

async function upsertConvState(leadId: string, patch: Partial<ConvControlState>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');
  // Try update first, then insert if missing
  const { data: existing } = await supabase
    .from('lead_conversation_state').select('lead_id').eq('lead_id', leadId).maybeSingle();
  if (existing) {
    const { error } = await (supabase.from('lead_conversation_state').update(patch as any)).eq('lead_id', leadId);
    if (error) throw error;
  } else {
    const { data: lead } = await supabase.from('leads').select('workspace_id, owner_id').eq('id', leadId).maybeSingle();
    const { error } = await supabase.from('lead_conversation_state').insert({
      lead_id: leadId,
      owner_id: (lead as any)?.owner_id ?? user.id,
      workspace_id: (lead as any)?.workspace_id ?? null,
      ...patch,
    } as any);
    if (error) throw error;
  }
}

export function useTogglePauseAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, paused }: { leadId: string; paused: boolean }) => {
      await upsertConvState(leadId, { automation_paused_at: paused ? new Date().toISOString() : null } as any);
      if (paused) {
        // annuler les relances en attente
        await (supabase.from('lead_followup_tasks').update({ status: 'cancelled' } as any))
          .eq('lead_id', leadId)
          .in('status', ['pending', 'scheduled'])
          .neq('task_type', 'manual_call');
      } else {
        // Réactivation : si le lead a déjà répondu et qu'aucune tâche n'est en attente,
        // on programme une qualification immédiate pour que l'IA reprenne la main.
        const { data: existingTask } = await supabase
          .from('lead_followup_tasks')
          .select('id')
          .eq('lead_id', leadId)
          .in('status', ['pending', 'scheduled'])
          .limit(1)
          .maybeSingle();
        if (!existingTask) {
          const { data: lastInbound } = await supabase
            .from('whatsapp_messages')
            .select('sent_at')
            .eq('lead_id', leadId)
            .eq('direction', 'inbound')
            .order('sent_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastInbound) {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: lead } = await supabase
              .from('leads').select('owner_id, workspace_id').eq('id', leadId).maybeSingle();
            await supabase.from('lead_followup_tasks').insert({
              lead_id: leadId,
              owner_id: (lead as any)?.owner_id ?? user?.id,
              workspace_id: (lead as any)?.workspace_id ?? null,
              task_type: 'qualification',
              status: 'scheduled',
              scheduled_at: new Date().toISOString(),
              step_order: 99,
            } as any);
          }
        }
      }
    },
    onSuccess: (_, vars) => {
      toast.success(vars.paused ? '🔒 Automation mise en pause' : '✅ Automation réactivée');
      qc.invalidateQueries({ queryKey: ['conv-controls'] });
      qc.invalidateQueries({ queryKey: ['conv-controls-all'] });
      qc.invalidateQueries({ queryKey: ['followup-tasks'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

export function useSnoozeConv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, until }: { leadId: string; until: string | null }) => {
      await upsertConvState(leadId, { snoozed_until: until } as any);
    },
    onSuccess: (_, vars) => {
      toast.success(vars.until ? '⏰ Conversation en sourdine' : 'Sourdine retirée');
      qc.invalidateQueries({ queryKey: ['conv-controls'] });
      qc.invalidateQueries({ queryKey: ['conv-controls-all'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

export function useResolveConv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, resolved }: { leadId: string; resolved: boolean }) => {
      await upsertConvState(leadId, { resolved_at: resolved ? new Date().toISOString() : null } as any);
    },
    onSuccess: (_, vars) => {
      toast.success(vars.resolved ? '✅ Conversation marquée résolue' : 'Réouverte');
      qc.invalidateQueries({ queryKey: ['conv-controls'] });
      qc.invalidateQueries({ queryKey: ['conv-controls-all'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

// ============== NEXT FOLLOWUP TASK ==============
export function useNextFollowup(leadId?: string) {
  return useQuery({
    queryKey: ['next-followup', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_followup_tasks')
        .select('*')
        .eq('lead_id', leadId!)
        .in('status', ['pending', 'scheduled'])
        .neq('task_type', 'manual_call')
        .order('scheduled_at', { ascending: true })
        .limit(5);
      return data ?? [];
    },
  });
}

export function useCancelFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await (supabase.from('lead_followup_tasks').update({ status: 'cancelled' } as any)).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Relance annulée');
      qc.invalidateQueries({ queryKey: ['next-followup'] });
      qc.invalidateQueries({ queryKey: ['followup-tasks'] });
      qc.invalidateQueries({ queryKey: ['scheduled-followups'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

export function useRescheduleFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, when }: { taskId: string; when: string }) => {
      const { error } = await (supabase.from('lead_followup_tasks').update({ scheduled_at: when } as any)).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Relance reportée');
      qc.invalidateQueries({ queryKey: ['next-followup'] });
      qc.invalidateQueries({ queryKey: ['followup-tasks'] });
      qc.invalidateQueries({ queryKey: ['scheduled-followups'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

// ============== ALL SCHEDULED (vue globale) ==============
export function useScheduledFollowups() {
  const wsId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['scheduled-followups', wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data: tasks } = await supabase
        .from('lead_followup_tasks')
        .select('*')
        .in('status', ['pending', 'scheduled'])
        .neq('task_type', 'manual_call')
        .order('scheduled_at', { ascending: true })
        .limit(200);
      const ids = Array.from(new Set((tasks ?? []).map((t: any) => t.lead_id)));
      if (ids.length === 0) return [];
      const { data: leads } = await supabase
        .from('leads').select('id, name, phone').in('id', ids).is('deleted_at', null);
      const map = new Map((leads ?? []).map((l: any) => [l.id, l]));
      return (tasks ?? [])
        .filter((t: any) => map.has(t.lead_id))
        .map((t: any) => ({ ...t, lead: map.get(t.lead_id) }));
    },
  });
}
