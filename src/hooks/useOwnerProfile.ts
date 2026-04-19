import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface OwnerProfile {
  id: string;
  user_id: string;
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
  onboarding_completed: boolean;
}

export function useOwnerProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['owner_profile', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<OwnerProfile | null> => {
      const { data, error } = await supabase
        .from('owner_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as OwnerProfile | null;
    },
  });
}

export function useUpdateOwnerProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<OwnerProfile>) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { data, error } = await (supabase
        .from('owner_profiles') as any)
        .update(patch)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner_profile', user?.id] }),
  });
}
