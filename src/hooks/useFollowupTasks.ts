import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useFollowupTasks(leadId?: string) {
  return useQuery({
    queryKey: ['followup-tasks', leadId],
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
  return useQuery({
    queryKey: ['wa-messages', leadId],
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
  return useQuery({
    queryKey: ['conv-state', leadId],
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

export function useFollowupSettings() {
  return useQuery({
    queryKey: ['followup-settings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('followup_automation_settings').select('*').eq('owner_id', user.id).maybeSingle();
      if (data) return data;
      // Create default
      const { data: created } = await supabase
        .from('followup_automation_settings')
        .insert({ owner_id: user.id } as any).select('*').maybeSingle();
      return created;
    },
  });
}

export function useUpdateFollowupSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      const { error } = await (supabase.from('followup_automation_settings').update(patch as any)).eq('owner_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Réglages sauvegardés');
      qc.invalidateQueries({ queryKey: ['followup-settings'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}
