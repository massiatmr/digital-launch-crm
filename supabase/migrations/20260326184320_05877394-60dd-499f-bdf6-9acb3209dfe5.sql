
-- Enum for booking status
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');

-- Enum for booking email type
CREATE TYPE public.booking_email_type AS ENUM ('confirmation', '24h_before', '12h_before', '1h_before');

-- Offers table
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text DEFAULT '',
  price text DEFAULT '',
  niche text DEFAULT '',
  features jsonb DEFAULT '[]'::jsonb,
  cover_image_url text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(slug)
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select offers" ON public.offers FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert offers" ON public.offers FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update offers" ON public.offers FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete offers" ON public.offers FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Public can view active offers" ON public.offers FOR SELECT TO anon USING (is_active = true);

-- Offer pages table
CREATE TABLE public.offer_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  headline text DEFAULT '',
  subheadline text DEFAULT '',
  body_content jsonb DEFAULT '[]'::jsonb,
  cta_text text DEFAULT 'Réserver un rendez-vous',
  cta_color text DEFAULT '#6366f1',
  testimonials jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offer_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select offer_pages" ON public.offer_pages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.offers WHERE offers.id = offer_pages.offer_id AND offers.owner_id = auth.uid()));
CREATE POLICY "Owner can insert offer_pages" ON public.offer_pages FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.offers WHERE offers.id = offer_pages.offer_id AND offers.owner_id = auth.uid()));
CREATE POLICY "Owner can update offer_pages" ON public.offer_pages FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.offers WHERE offers.id = offer_pages.offer_id AND offers.owner_id = auth.uid()));
CREATE POLICY "Owner can delete offer_pages" ON public.offer_pages FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.offers WHERE offers.id = offer_pages.offer_id AND offers.owner_id = auth.uid()));
CREATE POLICY "Public can view active offer pages" ON public.offer_pages FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM public.offers WHERE offers.id = offer_pages.offer_id AND offers.is_active = true));

-- Bookings table
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text DEFAULT '',
  booking_date date NOT NULL,
  time_slot text NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending',
  google_event_id text DEFAULT '',
  meet_link text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select bookings" ON public.bookings FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can insert bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner can update bookings" ON public.bookings FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete bookings" ON public.bookings FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Anon can insert bookings" ON public.bookings FOR INSERT TO anon WITH CHECK (true);

-- Booking emails table
CREATE TABLE public.booking_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  type booking_email_type NOT NULL,
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select booking_emails" ON public.booking_emails FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.bookings WHERE bookings.id = booking_emails.booking_id AND bookings.owner_id = auth.uid()));
CREATE POLICY "Owner can insert booking_emails" ON public.booking_emails FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.bookings WHERE bookings.id = booking_emails.booking_id AND bookings.owner_id = auth.uid()));
CREATE POLICY "Owner can update booking_emails" ON public.booking_emails FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.bookings WHERE bookings.id = booking_emails.booking_id AND bookings.owner_id = auth.uid()));

-- Add offer_id to leads
ALTER TABLE public.leads ADD COLUMN offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL;

-- Trigger for updated_at on offers
CREATE TRIGGER update_offers_updated_at BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on offer_pages  
CREATE TRIGGER update_offer_pages_updated_at BEFORE UPDATE ON public.offer_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
