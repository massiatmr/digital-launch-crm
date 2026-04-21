import { useNavigate, useParams } from 'react-router-dom';
import { Bot, Plug, FlaskConical, UserPlus, Building2, User, Bell, ShieldAlert, Trash2, History } from 'lucide-react';
import SettingsAutomationPage from './SettingsAutomationPage';
import SettingsIntegrationsPage from './SettingsIntegrationsPage';
import SettingsTestsPage from './SettingsTestsPage';
import SettingsInvitationsPage from './SettingsInvitationsPage';
import SettingsWorkspacesPage from './SettingsWorkspacesPage';
import SettingsAccountPage from './SettingsAccountPage';
import SettingsNotificationsPage from './SettingsNotificationsPage';
import SettingsTrashPage from './SettingsTrashPage';
import SettingsAuditPage from './SettingsAuditPage';
import { useIsAdmin, useWorkspaceFeatures } from '@/hooks/useWorkspaceFeatures';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Section = {
  key: string;
  label: string;
  icon: any;
  description: string;
  group: 'Personnel' | 'Workspace' | 'Système';
  adminOnly?: boolean;
  feature?: 'whatsapp';
  Component: React.ComponentType;
};

const SECTIONS: Section[] = [
  { key: 'account', label: 'Mon compte', icon: User, description: 'Profil, identité légale, sécurité, sauvegarde', group: 'Personnel', Component: SettingsAccountPage },
  { key: 'notifications', label: 'Notifications', icon: Bell, description: 'Push, emails, appareils', group: 'Personnel', Component: SettingsNotificationsPage },
  { key: 'workspaces', label: 'Espaces de travail', icon: Building2, description: 'Membres, modules, branding', group: 'Workspace', Component: SettingsWorkspacesPage },
  { key: 'automation', label: 'Automatisation', icon: Bot, description: 'Séquences, IA, templates', group: 'Workspace', feature: 'whatsapp', Component: SettingsAutomationPage },
  { key: 'integrations', label: 'Intégrations', icon: Plug, description: 'WhatsApp, Meta, Google Calendar', group: 'Workspace', Component: SettingsIntegrationsPage },
  { key: 'trash', label: 'Corbeille', icon: Trash2, description: 'Restaurer les éléments supprimés (30 jours)', group: 'Workspace', Component: SettingsTrashPage },
  { key: 'audit', label: 'Journal d\'audit', icon: History, description: 'Historique complet des suppressions', group: 'Système', adminOnly: true, Component: SettingsAuditPage },
  { key: 'tests', label: 'Tests système', icon: FlaskConical, description: 'Diagnostic des envois', group: 'Système', adminOnly: true, Component: SettingsTestsPage },
  { key: 'invitations', label: 'Invitations', icon: UserPlus, description: 'Gestion globale des invitations', group: 'Système', adminOnly: true, Component: SettingsInvitationsPage },
];

const GROUP_ORDER: Section['group'][] = ['Personnel', 'Workspace', 'Système'];
const GROUP_ICONS: Record<Section['group'], any> = {
  Personnel: User,
  Workspace: Building2,
  Système: ShieldAlert,
};

export default function SettingsPage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const { data: isAdmin = false } = useIsAdmin();
  const { isEnabled } = useWorkspaceFeatures();

  const visible = SECTIONS.filter((s) => (!s.adminOnly || isAdmin) && (!s.feature || isEnabled(s.feature)));
  const current = visible.find((s) => s.key === tab) || visible[0];
  const Comp = current.Component;
  const Icon = current.icon;

  return (
    <div className="container mx-auto p-3 sm:p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Paramètres</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Gère ton compte, tes espaces et tes intégrations</p>
      </div>

      {/* Mobile: select dropdown */}
      <div className="md:hidden mb-4">
        <Select value={current.key} onValueChange={(v) => navigate(`/settings/${v}`)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_ORDER.map((g) => {
              const items = visible.filter((s) => s.group === g);
              if (items.length === 0) return null;
              return (
                <div key={g}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{g}</div>
                  {items.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      <span className="flex items-center gap-2"><s.icon className="h-3.5 w-3.5" />{s.label}</span>
                    </SelectItem>
                  ))}
                </div>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden md:block">
          <nav className="space-y-5 sticky top-20">
            {GROUP_ORDER.map((g) => {
              const items = visible.filter((s) => s.group === g);
              if (items.length === 0) return null;
              const GIcon = GROUP_ICONS[g];
              return (
                <div key={g}>
                  <div className="flex items-center gap-2 px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <GIcon className="h-3 w-3" />
                    {g}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((s) => {
                      const active = s.key === current.key;
                      const SIcon = s.icon;
                      return (
                        <button
                          key={s.key}
                          onClick={() => navigate(`/settings/${s.key}`)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors text-left',
                            active
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-foreground/80 hover:bg-muted/50'
                          )}
                        >
                          <SIcon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} />
                          <span className="truncate">{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{current.label}</h2>
              <p className="text-xs text-muted-foreground">{current.description}</p>
            </div>
          </div>
          <Comp />
        </main>
      </div>
    </div>
  );
}
