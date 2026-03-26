import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type DbLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: 'facebook' | 'website' | 'google_sheets' | 'manual' | 'other';
  score: 'hot' | 'warm' | 'cold';
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost' | 'ghost';
  company_name: string | null;
  notes: string | null;
  ai_summary: string | null;
  sales_angle: string | null;
  next_action: string | null;
  next_action_date: string | null;
  last_contacted_at: string | null;
  offer_id: string | null;
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
  return useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DbLead[];
    },
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
        .single();
      if (error) throw error;
      return data as DbLead;
    },
    enabled: !!id,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
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
        })
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
      const { error } = await supabase.from('leads').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads', vars.id] });
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
  return useQuery({
    queryKey: ['reminders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminders')
        .select('*, leads(name)')
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data as DbReminder[];
    },
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

// ========== NATURAL LANGUAGE UPDATE ==========

export type AiProposal = {
  status?: string;
  score?: string;
  next_action?: string;
  next_action_date?: string;
  notes_append?: string;
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
            status: lead.status,
            score: lead.score,
            notes: lead.notes,
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
      if (proposal.status) updates.status = proposal.status;
      if (proposal.score) updates.score = proposal.score;
      if (proposal.next_action) updates.next_action = proposal.next_action;
      if (proposal.notes_append) {
        updates.notes = (lead.notes || '') + '\n' + proposal.notes_append;
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('leads').update(updates).eq('id', lead.id);
      }

      if (proposal.next_action && proposal.next_action_date) {
        await supabase.from('reminders').insert({
          lead_id: lead.id,
          action: proposal.next_action,
          due_date: proposal.next_action_date,
        });
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
