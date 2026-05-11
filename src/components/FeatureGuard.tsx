import { Outlet, Navigate, useLocation } from 'react-router-dom';
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

  if (isLoading) return <Outlet />;
  const match = ROUTE_FEATURES.find((r) => location.pathname.startsWith(r.prefix));
  if (match && !features[match.feature]) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
