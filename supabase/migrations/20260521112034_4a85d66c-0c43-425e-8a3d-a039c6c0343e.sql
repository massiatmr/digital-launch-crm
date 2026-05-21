-- Remove overly permissive realtime broadcast/presence policy.
-- The app uses postgres_changes only (which enforces RLS on underlying tables),
-- so subscribing to broadcast/presence channels should be denied by default.
DROP POLICY IF EXISTS "authenticated_can_receive" ON realtime.messages;