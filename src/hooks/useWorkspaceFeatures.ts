import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspaceId } from './useWorkspaces';

export type FeatureKey = 'bookings' | 'whatsapp' | 'facebook' | 'offers' | 'conversations';

const ALL_FEATURES: FeatureKey[] = ['bookings', 'whatsapp', 'facebook', 'offers', 'conversations'];

export function useWorkspaceFeatures(workspaceId?: string | null) {
  const currentId = useCurrentWorkspaceId();
  const wsId = workspaceId ?? currentId;

  const query = useQuery({
    queryKey: ['workspace-features', wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<Record<FeatureKey, boolean>> => {
      const { data, error } = await (supabase.from('workspace_features' as any) as any)
        .select('feature_key, enabled')
        .eq('workspace_id', wsId);
      if (error) throw error;
      const map: Record<FeatureKey, boolean> = {
        bookings: true, whatsapp: true, facebook: true, offers: true, conversations: true,
      };
      for (const row of (data || []) as any[]) {
        if (ALL_FEATURES.includes(row.feature_key)) {
          map[row.feature_key as FeatureKey] = row.enabled;
        }
      }
      return map;
    },
  });

  const features = query.data ?? {
    bookings: true, whatsapp: true, facebook: true, offers: true, conversations: true,
  };

  return { features, isLoading: query.isLoading, isEnabled: (k: FeatureKey) => features[k] };
}

export function useIsAdmin() {
  return useQuery({
    queryKey: ['is-admin'],
    queryFn: async (): Promise<boolean> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data, error } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (error) return false;
      return !!data;
    },
  });
}
