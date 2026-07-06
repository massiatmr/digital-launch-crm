import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';

export type SequenceKind = 'qualification' | 'website_booking';

export type SequenceStep = {
  id: string;
  owner_id: string;
  step_order: number;
  task_type: string;
  delay_value: number;
  delay_unit: 'minutes' | 'hours' | 'days';
  template_id: string | null;
  label: string;
  is_enabled: boolean;
  offer_id: string | null;
  sequence_kind: SequenceKind;
};

/**
 * Fetch steps.
 * offerId === undefined → all steps (for indicators).
 * offerId === null → default sequence only.
 * offerId === string → only that offer.
 * kind defaults to 'qualification' to preserve existing behaviour.
 */
export function useSequenceSteps(offerId?: string | null, kind: SequenceKind = 'qualification') {
  const workspaceId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['sequence-steps', workspaceId, kind, offerId === undefined ? 'all' : offerId ?? 'default'],
    queryFn: async () => {
      let query: any = supabase
        .from('followup_sequence_steps')
        .select('*')
        .order('step_order', { ascending: true });
      query = query.eq('sequence_kind', kind);
      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        query = query.eq('owner_id', user.id).is('workspace_id', null);
      }
      if (offerId === null) query = query.is('offer_id', null);
      else if (typeof offerId === 'string') query = query.eq('offer_id', offerId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SequenceStep[];
    },
  });
}

export function useUpsertSequenceStep() {
  const qc = useQueryClient();
  const workspaceId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (step: Partial<SequenceStep> & { id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      if (step.id) {
        const { error } = await (supabase.from('followup_sequence_steps').update(step as any)).eq('id', step.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('followup_sequence_steps').insert({
          ...step,
          owner_id: user.id,
          workspace_id: workspaceId ?? null,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sequence-steps'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur sauvegarde étape'),
  });
}

export function useDeleteSequenceStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('followup_sequence_steps').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Étape supprimée');
      qc.invalidateQueries({ queryKey: ['sequence-steps'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

export function useReorderSequenceSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: { id: string; step_order: number }[]) => {
      for (const s of ordered) {
        const { error } = await (supabase.from('followup_sequence_steps').update({ step_order: s.step_order } as any)).eq('id', s.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sequence-steps'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur réordonnancement'),
  });
}

/** Duplicate every step from sourceOfferId (or null = default) into destOfferId. */
export function useDuplicateSequence() {
  const qc = useQueryClient();
  const workspaceId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async ({ sourceOfferId, destOfferId, kind = 'qualification' }: { sourceOfferId: string | null; destOfferId: string; kind?: SequenceKind }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      let q: any = supabase.from('followup_sequence_steps').select('*').order('step_order', { ascending: true });
      q = q.eq('sequence_kind', kind);
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      else q = q.eq('owner_id', user.id).is('workspace_id', null);
      q = sourceOfferId === null ? q.is('offer_id', null) : q.eq('offer_id', sourceOfferId);
      const { data: src, error } = await q;
      if (error) throw error;
      if (!src || src.length === 0) throw new Error('Aucune étape à dupliquer');
      const rows = src.map((s: any) => ({
        owner_id: user.id,
        workspace_id: workspaceId ?? null,
        offer_id: destOfferId,
        sequence_kind: kind,
        step_order: s.step_order,
        task_type: s.task_type,
        delay_value: s.delay_value,
        delay_unit: s.delay_unit,
        template_id: s.template_id,
        label: s.label,
        is_enabled: s.is_enabled,
      }));
      const { error: insErr } = await supabase.from('followup_sequence_steps').insert(rows as any);
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success('Séquence dupliquée');
      qc.invalidateQueries({ queryKey: ['sequence-steps'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur duplication'),
  });
}

/** Delete all steps for a given offer (revert to default). */
export function useDeleteOfferSequence() {
  const qc = useQueryClient();
  const workspaceId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async ({ offerId, kind = 'qualification' }: { offerId: string; kind?: SequenceKind }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');
      let q: any = supabase.from('followup_sequence_steps').delete().eq('offer_id', offerId);
      q = q.eq('sequence_kind', kind);
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      else q = q.eq('owner_id', user.id).is('workspace_id', null);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Séquence dédiée supprimée — retour à la séquence par défaut');
      qc.invalidateQueries({ queryKey: ['sequence-steps'] });
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });
}

/** Returns map of offerId -> count of enabled steps (excludes default null) for a given kind. */
export function useOfferSequenceCounts(kind: SequenceKind = 'qualification') {
  const workspaceId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ['sequence-offer-counts', workspaceId, kind],
    queryFn: async () => {
      let q = supabase.from('followup_sequence_steps').select('offer_id').eq('sequence_kind' as any, kind).not('offer_id', 'is', null);
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return {} as Record<string, number>;
        q = q.eq('owner_id', user.id).is('workspace_id', null);
      }
      const { data, error } = await q;
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { if (r.offer_id) map[r.offer_id] = (map[r.offer_id] ?? 0) + 1; });
      return map;
    },
  });
}
