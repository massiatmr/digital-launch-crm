import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspaceId } from './useWorkspaces';
import { toast } from 'sonner';
import { sanitizeOfferPageContent } from '@/lib/offerContent';

export type OfferChatMessage = {
  id: string;
  offer_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  snapshot: any | null;
  created_at: string;
};

export function useOfferChat(offerId: string | undefined) {
  return useQuery({
    queryKey: ['offer_ai_chats', offerId],
    queryFn: async () => {
      if (!offerId) return [];
      const { data, error } = await supabase
        .from('offer_ai_chats')
        .select('*')
        .eq('offer_id', offerId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as OfferChatMessage[];
    },
    enabled: !!offerId,
  });
}

export function useSendOfferChatMessage(offerId: string | undefined) {
  const qc = useQueryClient();
  const wsId = useCurrentWorkspaceId();

  return useMutation({
    mutationFn: async (params: {
      instruction: string;
      offer: { name: string; description: string | null; niche: string | null };
      page: { id: string; headline: string; subheadline: string; cta_text: string; sections: any[]; testimonials: any[] };
      history: { role: string; content: string }[];
      previousSnapshot: any;
    }) => {
      if (!offerId) throw new Error('No offer id');

      // 1) Log user message
      await supabase.from('offer_ai_chats').insert({
        offer_id: offerId,
        role: 'user',
        content: params.instruction,
        ...(wsId ? { workspace_id: wsId } : {}),
      } as any);

      // 2) Call AI
      const cleanPage = sanitizeOfferPageContent(params.page);
      const { data, error } = await supabase.functions.invoke('edit-offer-ai', {
        body: {
          instruction: params.instruction,
          offer: params.offer,
          page: cleanPage,
          history: params.history,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // 3) Apply changes
      const { offer: newOffer, page: rawPage, summary } = data;
      const newPage = sanitizeOfferPageContent(rawPage || {});

      const offerUpdates: any = {};
      if (newOffer.name && newOffer.name !== params.offer.name) {
        offerUpdates.name = newOffer.name;
        offerUpdates.slug = newOffer.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      }
      if (newOffer.description !== undefined) offerUpdates.description = newOffer.description;
      if (newOffer.niche !== undefined) offerUpdates.niche = newOffer.niche;

      if (Object.keys(offerUpdates).length > 0) {
        await supabase.from('offers').update(offerUpdates as any).eq('id', offerId);
      }

      await supabase.from('offer_pages').update({
        headline: newPage.headline,
        subheadline: newPage.subheadline,
        cta_text: newPage.cta_text,
        sections: newPage.sections,
        testimonials: newPage.testimonials,
      } as any).eq('id', params.page.id);

      // 4) Log assistant message + snapshot for undo
      await supabase.from('offer_ai_chats').insert({
        offer_id: offerId,
        role: 'assistant',
        content: summary || 'Modifications appliquées',
        snapshot: params.previousSnapshot,
        ...(wsId ? { workspace_id: wsId } : {}),
      } as any);

      return { summary, newOffer, newPage };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offer_ai_chats', offerId] });
      qc.invalidateQueries({ queryKey: ['offers', offerId] });
      qc.invalidateQueries({ queryKey: ['offer_pages', offerId] });
      qc.invalidateQueries({ queryKey: ['offers'] });
    },
    onError: (e: any) => {
      toast.error(e.message || 'Erreur IA');
    },
  });
}

export function useUndoOfferChange(offerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { snapshot: any; pageId: string }) => {
      if (!offerId || !params.snapshot) throw new Error('Rien à annuler');
      const { offer, page } = params.snapshot;
      if (offer) {
        const updates: any = { ...offer };
        if (offer.name) {
          updates.slug = offer.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        }
        await supabase.from('offers').update(updates as any).eq('id', offerId);
      }
      if (page) {
        await supabase.from('offer_pages').update(page as any).eq('id', params.pageId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers', offerId] });
      qc.invalidateQueries({ queryKey: ['offer_pages', offerId] });
      qc.invalidateQueries({ queryKey: ['offers'] });
      toast.success('Modification annulée');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
