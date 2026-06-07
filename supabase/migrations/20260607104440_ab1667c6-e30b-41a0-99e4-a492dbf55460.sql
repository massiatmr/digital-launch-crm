-- Trigger: when a booking is created (or restored) for a lead,
-- automatically upgrade the lead status to 'qualified' if it's still
-- in an early stage. This guarantees the transition regardless of which
-- edge function created the booking (handle-booking, detect-booking-from-conversation, manual…).

CREATE OR REPLACE FUNCTION public.upgrade_lead_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only upgrade if booking is active (not cancelled, not soft-deleted)
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Upgrade only from earlier stages — never downgrade a lead that's already
  -- in proposal/won/lost/ghost.
  UPDATE public.leads
  SET status = 'qualified',
      last_contacted_at = COALESCE(last_contacted_at, now())
  WHERE id = NEW.lead_id
    AND status IN ('new', 'contacted');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upgrade_lead_on_booking_insert ON public.bookings;
CREATE TRIGGER trg_upgrade_lead_on_booking_insert
AFTER INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.upgrade_lead_on_booking();

-- Also handle the case where a booking is updated to attach a lead_id later
-- (handle-booking inserts the booking, then updates lead_id afterwards).
DROP TRIGGER IF EXISTS trg_upgrade_lead_on_booking_update ON public.bookings;
CREATE TRIGGER trg_upgrade_lead_on_booking_update
AFTER UPDATE OF lead_id, status, deleted_at ON public.bookings
FOR EACH ROW
WHEN (NEW.lead_id IS NOT NULL AND (OLD.lead_id IS DISTINCT FROM NEW.lead_id OR OLD.status IS DISTINCT FROM NEW.status))
EXECUTE FUNCTION public.upgrade_lead_on_booking();