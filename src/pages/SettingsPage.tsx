import { useNavigate, useParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Bot, Plug, FlaskConical, UserPlus, Building2 } from 'lucide-react';
import SettingsAutomationPage from './SettingsAutomationPage';
import SettingsIntegrationsPage from './SettingsIntegrationsPage';
import SettingsTestsPage from './SettingsTestsPage';
import SettingsInvitationsPage from './SettingsInvitationsPage';
import SettingsWorkspacesPage from './SettingsWorkspacesPage';
import { PwaInstallGuide } from '@/components/PwaInstallGuide';

const VALID = ['workspaces', 'automation', 'integrations', 'tests', 'invitations'] as const;
type Tab = (typeof VALID)[number];

export default function SettingsPage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const current: Tab = (VALID as readonly string[]).includes(tab ?? '') ? (tab as Tab) : 'workspaces';

  return (
    <div className="container mx-auto p-3 sm:p-6 max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Paramètres</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Gère ton automatisation, tes intégrations et tes tests système</p>
      </div>

      <PwaInstallGuide />

      <Tabs value={current} onValueChange={(v) => navigate(`/settings/${v}`)}>
        <TabsList className="grid w-full grid-cols-5 max-w-3xl h-auto">
          <TabsTrigger value="workspaces" className="gap-1.5 sm:gap-2 px-2 py-2 text-xs sm:text-sm">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Espaces</span>
            <span className="xs:hidden sm:hidden">Esp.</span>
          </TabsTrigger>
          <TabsTrigger value="automation" className="gap-1.5 sm:gap-2 px-2 py-2 text-xs sm:text-sm">
            <Bot className="h-4 w-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Automatisation</span>
            <span className="xs:hidden sm:hidden">Auto</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5 sm:gap-2 px-2 py-2 text-xs sm:text-sm">
            <Plug className="h-4 w-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Intégrations</span>
            <span className="xs:hidden sm:hidden">Intég.</span>
          </TabsTrigger>
          <TabsTrigger value="tests" className="gap-1.5 sm:gap-2 px-2 py-2 text-xs sm:text-sm">
            <FlaskConical className="h-4 w-4 shrink-0" />
            Tests
          </TabsTrigger>
          <TabsTrigger value="invitations" className="gap-1.5 sm:gap-2 px-2 py-2 text-xs sm:text-sm">
            <UserPlus className="h-4 w-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Invitations</span>
            <span className="xs:hidden sm:hidden">Invit.</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workspaces" className="mt-4 sm:mt-6">
          <SettingsWorkspacesPage />
        </TabsContent>
        <TabsContent value="automation" className="mt-4 sm:mt-6">
          <SettingsAutomationPage />
        </TabsContent>
        <TabsContent value="integrations" className="mt-4 sm:mt-6">
          <SettingsIntegrationsPage />
        </TabsContent>
        <TabsContent value="tests" className="mt-4 sm:mt-6">
          <SettingsTestsPage />
        </TabsContent>
        <TabsContent value="invitations" className="mt-4 sm:mt-6">
          <SettingsInvitationsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
