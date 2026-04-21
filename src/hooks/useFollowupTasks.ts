import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useSendWhatsAppMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, message }: { leadId: string; message: string }) => {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: { lead_id: leadId, message },
      });
      if (error) throw error;
      if ((data as any)?.error && !(data as any)?.success) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any, vars) => {
      if (data?.dry_run) toast.success('Message simulé (dry-run actif)');
      else toast.success('Message envoyé');
      qc.invalidateQueries({ queryKey: ['wa-messages', vars.leadId] });
      qc.invalidateQueries({ queryKey: ['conv-state', vars.leadId] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur envoi'),
  });
}

export function useSendWhatsAppAudio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, audioBase64, mimeType }: { leadId: string; audioBase64: string; mimeType: string }) => {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-audio', {
        body: { lead_id: leadId, audio_base64: audioBase64, mime_type: mimeType },
      });
      if (error) throw error;
      if ((data as any)?.error && !(data as any)?.success) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any, vars) => {
      if (data?.dry_run) toast.success('Vocal simulé (dry-run actif)');
      else toast.success('Vocal envoyé');
      qc.invalidateQueries({ queryKey: ['wa-messages', vars.leadId] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur envoi vocal'),
  });
}

export function useWhatsAppRealtime(leadId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!leadId) return;
    const channel = supabase
      .channel(`wa-msgs-${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `lead_id=eq.${leadId}` }, () => {
        qc.invalidateQueries({ queryKey: ['wa-messages', leadId] });
        qc.invalidateQueries({ queryKey: ['conv-state', leadId] });
        qc.invalidateQueries({ queryKey: ['followup-tasks', leadId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [leadId, qc]);
}

export function useFollowupTasks(leadId?: string) {
  const wsId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['followup-tasks', wsId, leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from('lead_followup_tasks')
        .select('*')
        .eq('lead_id', leadId)
        .order('step_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!leadId,
  });
}

export function useWhatsAppMessages(leadId?: string) {
  const wsId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['wa-messages', wsId, leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('sent_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!leadId,
  });
}

export function useConversationState(leadId?: string) {
  const wsId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['conv-state', wsId, leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const { data } = await supabase
        .from('lead_conversation_state').select('*').eq('lead_id', leadId).maybeSingle();
      return data;
    },
    enabled: !!leadId,
  });
}

export function useSendNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, customMessage }: { taskId: string; customMessage?: string }) => {
      const { data, error } = await supabase.functions.invoke('execute-followup-task', {
        body: { task_id: taskId, custom_message: customMessage },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_, vars) => {
      toast.success('Message envoyé');
      qc.invalidateQueries({ queryKey: ['followup-tasks'] });
      qc.invalidateQueries({ queryKey: ['wa-messages'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur envoi'),
  });
}

export function useGenerateMessage() {
  return useMutation({
    mutationFn: async ({ leadId, taskType }: { leadId: string; taskType: string }) => {
      const { data, error } = await supabase.functions.invoke('generate-followup-message', {
        body: { lead_id: leadId, task_type: taskType },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any).message as string;
    },
    onError: (e: any) => toast.error(e.message || 'Erreur génération'),
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await (supabase.from('lead_followup_tasks').update({ status: 'cancelled' } as any)).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Tâche annulée');
      qc.invalidateQueries({ queryKey: ['followup-tasks'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

export function useMarkLeadReplied() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, content }: { leadId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      const { error } = await supabase.from('whatsapp_messages').insert({
        lead_id: leadId,
        owner_id: user.id,
        direction: 'inbound',
        content,
        status: 'manual',
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Réponse enregistrée — relances annulées');
      qc.invalidateQueries({ queryKey: ['followup-tasks'] });
      qc.invalidateQueries({ queryKey: ['wa-messages'] });
      qc.invalidateQueries({ queryKey: ['conv-state'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';

export function useFollowupSettings() {
  const workspaceId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['followup-settings', workspaceId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      // Try workspace-scoped first
      if (workspaceId) {
        const { data } = await supabase
          .from('followup_automation_settings').select('*').eq('workspace_id', workspaceId).maybeSingle();
        if (data) return data;
        const { data: created } = await supabase
          .from('followup_automation_settings')
          .insert({ owner_id: user.id, workspace_id: workspaceId } as any).select('*').maybeSingle();
        return created;
      }
      // Legacy : owner-only
      const { data } = await supabase
        .from('followup_automation_settings').select('*').eq('owner_id', user.id).is('workspace_id', null).maybeSingle();
      if (data) return data;
      const { data: created } = await supabase
        .from('followup_automation_settings')
        .insert({ owner_id: user.id } as any).select('*').maybeSingle();
      return created;
    },
  });
}

export function useUpdateFollowupSettings() {
  const qc = useQueryClient();
  const workspaceId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      let q = supabase.from('followup_automation_settings').update(patch as any);
      if (workspaceId) {
        const { error } = await q.eq('workspace_id', workspaceId);
        if (error) throw error;
      } else {
        const { error } = await q.eq('owner_id', user.id).is('workspace_id', null);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Réglages sauvegardés');
      qc.invalidateQueries({ queryKey: ['followup-settings'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}
