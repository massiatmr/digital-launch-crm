import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type DbOffer = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string | null;
  niche: string | null;
  features: any[];
  cover_image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DbOfferPage = {
  id: string;
  offer_id: string;
  headline: string;
  subheadline: string;
  body_content: any[];
  cta_text: string;
  cta_color: string;
  testimonials: any[];
  sections: any[];
  created_at: string;
  updated_at: string;
};

export type DbBooking = {
  id: string;
  owner_id: string;
  lead_id: string | null;
  offer_id: string;
  name: string;
  email: string;
  phone: string | null;
  booking_date: string;
  time_slot: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  google_event_id: string | null;
  meet_link: string | null;
  notes: string | null;
  created_at: string;
  offers?: { name: string } | null;
};

export type DbBookingEmail = {
  id: string;
  booking_id: string;
  type: 'confirmation' | '24h_before' | '12h_before' | '1h_before';
  scheduled_at: string;
  sent_at: string | null;
  status: string;
  created_at: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ========== OFFERS ==========

export function useOffers() {
  return useQuery({
    queryKey: ['offers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DbOffer[];
    },
  });
}

export function useOffer(id: string | undefined) {
  return useQuery({
    queryKey: ['offers', id],
    queryFn: async () => {
      if (!id) throw new Error('No id');
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as DbOffer;
    },
    enabled: !!id,
  });
}

export function useOfferBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ['offers', 'slug', slug],
    queryFn: async () => {
      if (!slug) throw new Error('No slug');
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();
      if (error) throw error;
      return data as DbOffer;
    },
    enabled: !!slug,
  });
}

export function useCreateOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offer: { name: string; description?: string; price?: string; niche?: string; features?: any[] }) => {
      const slug = slugify(offer.name);
      const { data, error } = await supabase
        .from('offers')
        .insert({
          name: offer.name,
          slug,
          description: offer.description || '',
          price: offer.price || '',
          niche: offer.niche || '',
          features: offer.features || [],
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Create default offer page
      await supabase.from('offer_pages').insert({
        offer_id: data.id,
        headline: offer.name,
        subheadline: offer.description || '',
      } as any);

      return data as DbOffer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      toast.success('Offre créée');
    },
  });
}

export function useUpdateOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      if (updates.name) {
        updates.slug = slugify(updates.name);
      }
      const { error } = await supabase.from('offers').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offers', vars.id] });
    },
  });
}

export function useDeleteOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('offers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      toast.success('Offre supprimée');
    },
  });
}

// ========== OFFER PAGES ==========

export function useOfferPage(offerId: string | undefined) {
  return useQuery({
    queryKey: ['offer_pages', offerId],
    queryFn: async () => {
      if (!offerId) throw new Error('No offer id');
      const { data, error } = await supabase
        .from('offer_pages')
        .select('*')
        .eq('offer_id', offerId)
        .single();
      if (error) throw error;
      return data as DbOfferPage;
    },
    enabled: !!offerId,
  });
}

export function useUpdateOfferPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from('offer_pages').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer_pages'] });
    },
  });
}

// ========== BOOKINGS ==========

export function useBookings() {
  return useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, offers(name)')
        .order('booking_date', { ascending: true });
      if (error) throw error;
      return data as DbBooking[];
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (booking: { offer_id: string; name: string; email: string; phone?: string; booking_date: string; time_slot: string; notes?: string }) => {
      const { data, error } = await supabase
        .from('bookings')
        .insert(booking as any)
        .select()
        .single();
      if (error) throw error;
      return data as DbBooking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Rendez-vous réservé');
    },
  });
}

export function useUpdateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from('bookings').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

// ========== BOOKING EMAILS ==========

export function useBookingEmails(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['booking_emails', bookingId],
    queryFn: async () => {
      if (!bookingId) return [];
      const { data, error } = await supabase
        .from('booking_emails')
        .select('*')
        .eq('booking_id', bookingId)
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return data as DbBookingEmail[];
    },
    enabled: !!bookingId,
  });
}
