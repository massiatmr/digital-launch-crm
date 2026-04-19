import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCurrentWorkspaceId } from './useWorkspaces';

export type ClientStatus = 'nouveau' | 'signe' | 'onboarding_envoye' | 'onboarding_complete' | 'en_preparation' | 'en_cours' | 'actif';

export type DbClient = {
  id: string;
  owner_id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  status: ClientStatus;
  offer_id: string | null;
  technical_accesses: any[];
  objectives: any[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DbOnboardingResponse = {
  id: string;
  client_id: string;
  form_type: 'website' | 'ads';
  responses: Record<string, any>;
  completed: boolean;
  token: string;
  created_at: string;
  updated_at: string;
};

export type DbClientResource = {
  id: string;
  client_id: string;
  owner_id: string;
  name: string;
  resource_type: string;
  url: string | null;
  storage_path: string | null;
  category: string;
  created_at: string;
};

export type DbClientActivity = {
  id: string;
  client_id: string;
  owner_id: string;
  action: string;
  description: string | null;
  created_at: string;
};

const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  nouveau: 'Nouveau',
  signe: 'Signé',
  onboarding_envoye: 'Onboarding envoyé',
  onboarding_complete: 'Onboarding complété',
  en_preparation: 'En préparation',
  en_cours: 'En cours',
  actif: 'Actif',
};

export const getStatusLabel = (s: ClientStatus) => CLIENT_STATUS_LABELS[s] || s;

export function useClients() {
  const wsId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['clients', wsId],
    enabled: !!wsId,
    queryFn: async () => {
      let q: any = supabase.from('clients').select('*, offers(name)');
      if (wsId) q = q.eq('workspace_id', wsId);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return data as (DbClient & { offers: { name: string } | null })[];
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ['clients', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*, offers(name, slug)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as DbClient & { offers: { name: string; slug: string } | null };
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const wsId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (client: Partial<DbClient>) => {
      const payload: any = { ...client, ...(wsId ? { workspace_id: wsId } : {}) };
      const { data, error } = await supabase.from('clients').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client créé');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DbClient> & { id: string }) => {
      const { error } = await supabase.from('clients').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['clients', v.id] });
      toast.success('Client mis à jour');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateClientSilent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DbClient> & { id: string }) => {
      const { error } = await supabase.from('clients').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['clients', v.id] });
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clients')
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Déplacé vers la corbeille');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// Onboarding
export function useClientOnboarding(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-onboarding', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_onboarding_responses')
        .select('*')
        .eq('client_id', clientId!);
      if (error) throw error;
      return data as DbOnboardingResponse[];
    },
  });
}

export function useCreateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ client_id, form_type }: { client_id: string; form_type: 'website' | 'ads' }) => {
      const { data, error } = await supabase
        .from('client_onboarding_responses')
        .insert({ client_id, form_type } as any)
        .select()
        .single();
      if (error) throw error;
      return data as DbOnboardingResponse;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['client-onboarding', v.client_id] });
      toast.success('Formulaire d\'onboarding créé');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// Public onboarding (anon) — uses secure RPC functions
export function useOnboardingByToken(token: string | null) {
  return useQuery({
    queryKey: ['onboarding-token', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_onboarding_by_token', { p_token: token! });
      if (error) throw error;
      return data as unknown as DbOnboardingResponse & { clients: { name: string; company_name: string | null } };
    },
  });
}

export function useSaveOnboardingResponses() {
  return useMutation({
    mutationFn: async ({ token, responses, completed }: { token: string; responses: Record<string, any>; completed?: boolean }) => {
      const { error } = await supabase.rpc('save_onboarding_by_token', {
        p_token: token,
        p_responses: responses as any,
        p_completed: completed ?? false,
      });
      if (error) throw error;
    },
  });
}

// Resources
export function useClientResources(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-resources', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_resources')
        .select('*')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DbClientResource[];
    },
  });
}

export function useAddClientResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (resource: Partial<DbClientResource>) => {
      const { error } = await supabase.from('client_resources').insert(resource as any);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['client-resources', v.client_id] });
      toast.success('Ressource ajoutée');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteClientResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, client_id }: { id: string; client_id: string }) => {
      const { error } = await supabase.from('client_resources').delete().eq('id', id);
      if (error) throw error;
      return { client_id };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['client-resources', d.client_id] });
      toast.success('Ressource supprimée');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// Activities
export function useClientActivities(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-activities', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_activities')
        .select('*')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DbClientActivity[];
    },
  });
}

export function useAddClientActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (activity: { client_id: string; action: string; description?: string }) => {
      const { error } = await supabase.from('client_activities').insert(activity as any);
      if (error) throw error;
      return { client_id: activity.client_id };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['client-activities', d.client_id] });
    },
  });
}
