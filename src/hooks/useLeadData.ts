import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from './useAuth';
import { useCurrentWorkspaceId } from './useWorkspaces';

export type DbLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: 'facebook' | 'website' | 'google_sheets' | 'manual' | 'other' | 'organic_social' | 'recommendation' | 'google_my_business';
  score: 'hot' | 'warm' | 'cold';
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost' | 'ghost';
  show_status: 'pending' | 'show' | 'noshow';
  company_name: string | null;
  notes: string | null;
  ai_summary: string | null;
  sales_angle: string | null;
  next_action: string | null;
  next_action_date: string | null;
  last_contacted_at: string | null;
  offer_id: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type DbActivity = {
  id: string;
  lead_id: string;
  activity_type: 'call' | 'whatsapp' | 'email' | 'note' | 'relance' | 'meeting';
  description: string;
  lead_response: string | null;
  created_at: string;
};

export type DbMessage = {
  id: string;
  lead_id: string;
  type: 'whatsapp' | 'email' | 'sms';
  content: string;
  created_at: string;
};

export type DbScript = {
  id: string;
  lead_id: string;
  script: string;
  objections: { objection: string; response: string }[];
  created_at: string;
};

export type DbReminder = {
  id: string;
  lead_id: string;
  action: string;
  due_date: string;
  done: boolean;
  created_at: string;
  leads?: { name: string } | null;
};

// ========== LEADS ==========

export function useLeads() {
  const { user, loading } = useAuth();
  const wsId = useCurrentWorkspaceId();

  return useQuery({
    queryKey: ['leads', wsId],
    queryFn: async () => {
      let q: any = supabase.from('leads').select('*').is('deleted_at', null);
      if (wsId) q = q.eq('workspace_id', wsId);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return data as DbLead[];
    },
    enabled: !loading && !!user && !!wsId,
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: async () => {
      if (!id) throw new Error('No id');
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return data as DbLead | null;
    },
    enabled: !!id,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  const wsId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (lead: { name: string; email: string; phone: string; message: string; source: string; company_name?: string }) => {
      // First insert the lead
      const { data, error } = await supabase
        .from('leads')
        .insert({ 
          name: lead.name, 
          email: lead.email, 
          phone: lead.phone, 
          message: lead.message, 
          source: lead.source as any,
          company_name: lead.company_name || '',
          ...(wsId ? { workspace_id: wsId } : {}),
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Then call AI to analyze
      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke('ai-lead-analysis', {
          body: { type: 'analyze', lead: { ...lead, source: lead.source } },
        });

        if (!aiError && aiData && !aiData.error) {
          // Update lead with AI analysis
          const updates: any = {
            score: aiData.score,
            ai_summary: aiData.ai_summary,
            sales_angle: aiData.sales_angle,
            next_action: aiData.next_action,
          };
          
          await supabase.from('leads').update(updates).eq('id', data.id);

          // Save generated WhatsApp message
          if (aiData.whatsapp_message) {
            await supabase.from('generated_messages').insert({
              lead_id: data.id,
              type: 'whatsapp',
              content: aiData.whatsapp_message,
            });
          }

          // Save sales script
          if (aiData.script) {
            await supabase.from('sales_scripts').insert({
              lead_id: data.id,
              script: aiData.script,
              objections: aiData.objections || [],
            });
          }

          // Create reminder for next action
          if (aiData.next_action) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 1);
            await supabase.from('reminders').insert({
              lead_id: data.id,
              action: aiData.next_action,
              due_date: dueDate.toISOString(),
            });
          }
        }
      } catch (e) {
        console.error('AI analysis failed:', e);
        // Lead is still created, just without AI analysis
      }

      // Fire push + email notification (non-blocking)
      try {
        await supabase.functions.invoke('notify-new-lead', {
          body: { lead_id: data.id },
        });
      } catch (e) {
        console.error('notify-new-lead failed:', e);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['scripts'] });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from('leads').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads', vars.id] });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { id: string; hard?: boolean }) => {
      const id = typeof input === 'string' ? input : input.id;
      const hard = typeof input === 'string' ? false : !!input.hard;
      if (hard) {
        // Hard delete : purge en cascade des enfants puis du lead
        await supabase.from('lead_followup_tasks').delete().eq('lead_id', id);
        await supabase.from('whatsapp_messages').delete().eq('lead_id', id);
        await supabase.from('lead_activities').delete().eq('lead_id', id);
        await supabase.from('lead_qualification').delete().eq('lead_id', id);
        await supabase.from('lead_conversation_state').delete().eq('lead_id', id);
        await supabase.from('generated_messages').delete().eq('lead_id', id);
        await supabase.from('sales_scripts').delete().eq('lead_id', id);
        await supabase.from('reminders').delete().eq('lead_id', id);
        await supabase.from('bookings').update({ lead_id: null } as any).eq('lead_id', id);
        const { error } = await supabase.from('leads').delete().eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('leads')
          .update({ deleted_at: new Date().toISOString() } as any)
          .eq('id', id);
        if (error) throw error;
      }
    },
    onMutate: async (input) => {
      const id = typeof input === 'string' ? input : input.id;
      await queryClient.cancelQueries({ queryKey: ['leads'] });

      const previousLeadsQueries = queryClient.getQueriesData<DbLead[]>({ queryKey: ['leads'] });
      const previousLeadDetail = queryClient.getQueryData<DbLead | null>(['leads', id]);

      previousLeadsQueries.forEach(([key, leads]) => {
        if (Array.isArray(leads)) {
          queryClient.setQueryData(
            key,
            leads.filter((lead) => lead.id !== id)
          );
        }
      });

      queryClient.setQueryData(['leads', id], null);

      return { previousLeadsQueries, previousLeadDetail };
    },
    onSuccess: (_, input) => {
      const hard = typeof input === 'string' ? false : !!input.hard;
      toast.success(hard ? 'Lead supprimé définitivement' : 'Déplacé vers la corbeille');
    },
    onError: (e: any, input, context) => {
      const id = typeof input === 'string' ? input : input.id;
      context?.previousLeadsQueries?.forEach(([key, leads]: any) => {
        queryClient.setQueryData(key, leads);
      });
      queryClient.setQueryData(['leads', id], context?.previousLeadDetail ?? null);
      toast.error(e.message);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

// ========== MESSAGES ==========

export function useLeadMessages(leadId: string | undefined) {
  return useQuery({
    queryKey: ['messages', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from('generated_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DbMessage[];
    },
    enabled: !!leadId,
  });
}

export function useAllMessages() {
  return useQuery({
    queryKey: ['messages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('generated_messages')
        .select('*, leads(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ========== SCRIPTS ==========

export function useLeadScripts(leadId: string | undefined) {
  return useQuery({
    queryKey: ['scripts', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from('sales_scripts')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(s => ({
        ...s,
        objections: (s.objections as any) || [],
      })) as DbScript[];
    },
    enabled: !!leadId,
  });
}

export function useAllScripts() {
  return useQuery({
    queryKey: ['scripts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_scripts')
        .select('*, leads(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(s => ({
        ...s,
        objections: (s.objections as any) || [],
      }));
    },
  });
}

// ========== REMINDERS ==========

export function useReminders() {
  const wsId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['reminders', wsId],
    queryFn: async () => {
      let q: any = supabase.from('reminders').select('*, leads(name)');
      if (wsId) q = q.eq('workspace_id', wsId);
      const { data, error } = await q.order('due_date', { ascending: true });
      if (error) throw error;
      return data as DbReminder[];
    },
    enabled: !!wsId,
  });
}

export function useToggleReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from('reminders').update({ done }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

export function useCreateReminder() {
  const queryClient = useQueryClient();
  const wsId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async ({ lead_id, action, due_date }: { lead_id: string; action: string; due_date: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      const payload: any = { lead_id, action, due_date, owner_id: user.id };
      if (wsId) payload.workspace_id = wsId;
      const { error } = await supabase.from('reminders').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rappel créé');
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur création'),
  });
}

export function useUpdateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, due_date }: { id: string; action?: string; due_date?: string }) => {
      const updates: Record<string, unknown> = {};
      if (action !== undefined) updates.action = action;
      if (due_date !== undefined) updates.due_date = due_date;
      const { error } = await supabase.from('reminders').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

// ========== NATURAL LANGUAGE UPDATE ==========

export type AiProposal = {
  status?: string | null;
  score?: string | null;
  show_status?: string | null;
  lost_reason?: string | null;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  last_contacted_at?: string | null;
  sales_angle?: string | null;
  ai_summary?: string | null;
  notes_append?: string | null;
  updates_summary?: string[];
};

export function useAnalyzeNote() {
  return useMutation({
    mutationFn: async ({ lead, note }: { lead: DbLead; note: string }): Promise<AiProposal> => {
      const { data, error } = await supabase.functions.invoke('ai-lead-analysis', {
        body: {
          type: 'natural_language_update',
          lead: {
            name: lead.name,
            company_name: lead.company_name,
            status: lead.status,
            score: lead.score,
            show_status: lead.show_status,
            notes: lead.notes,
            email: lead.email,
            phone: lead.phone,
            lost_reason: lead.lost_reason,
            new_note: note,
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as AiProposal;
    },
  });
}

export function useApplyProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ lead, proposal }: { lead: DbLead; proposal: AiProposal }) => {
      const updates: any = {};
      
      // Map all non-null fields from proposal to updates
      const directFields = ['status', 'score', 'show_status', 'lost_reason', 'email', 'phone', 'company_name', 'next_action', 'next_action_date', 'last_contacted_at', 'sales_angle', 'ai_summary'] as const;
      for (const field of directFields) {
        if (proposal[field] !== undefined && proposal[field] !== null) {
          updates[field] = proposal[field];
        }
      }
      
      if (proposal.notes_append) {
        updates.notes = (lead.notes || '') + '\n' + proposal.notes_append;
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('leads').update(updates).eq('id', lead.id);
      }

      // Créer un rappel si une action est suggérée (avec fallback de date à demain 9h)
      if (proposal.next_action) {
        let dueDate = proposal.next_action_date;
        if (!dueDate) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          dueDate = tomorrow.toISOString();
        }
        const { error: remErr } = await supabase.from('reminders').insert({
          lead_id: lead.id,
          action: proposal.next_action,
          due_date: dueDate,
        } as any);
        if (remErr) console.error('Reminder insert error:', remErr);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

// ========== LEAD ACTIVITIES ==========

export function useLeadActivities(leadId: string | undefined) {
  return useQuery({
    queryKey: ['activities', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DbActivity[];
    },
    enabled: !!leadId,
  });
}

export function useAddActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, activityType, description, leadResponse }: { leadId: string; activityType: DbActivity['activity_type']; description: string; leadResponse?: string }) => {
      const { error } = await supabase
        .from('lead_activities')
        .insert({
          lead_id: leadId,
          activity_type: activityType,
          description,
          lead_response: leadResponse || null,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

// Legacy hook kept for backward compatibility
export function useNaturalLanguageUpdate() {
  const analyze = useAnalyzeNote();
  const apply = useApplyProposal();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ lead, note }: { lead: DbLead; note: string }) => {
      const proposal = await analyze.mutateAsync({ lead, note });
      await apply.mutateAsync({ lead, proposal });
      return proposal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}
