import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useMyPermissions, permForPath } from '@/hooks/useMemberPermissions';
import { useWorkspaceFeatures, type FeatureKey } from '@/hooks/useWorkspaceFeatures';

const ROUTE_FEATURES: { prefix: string; feature: FeatureKey }[] = [
  { prefix: '/conversations', feature: 'conversations' },
  { prefix: '/offers', feature: 'offers' },
  { prefix: '/bookings', feature: 'bookings' },
  { prefix: '/clients', feature: 'clients' },
  { prefix: '/settings/automation', feature: 'whatsapp' },
  { prefix: '/ai-monitor', feature: 'whatsapp' },
];

export function FeatureGuard() {
  const { features, isLoading } = useWorkspaceFeatures();
  const location = useLocation();

  const { can, isLoading: permLoading } = useMyPermissions();
  if (isLoading || permLoading) return <Outlet />;
  if (!can(permForPath(location.pathname))) return <Navigate to="/" replace />;
  const match = ROUTE_FEATURES.find((r) => location.pathname.startsWith(r.prefix));
  if (match && !features[match.feature]) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
