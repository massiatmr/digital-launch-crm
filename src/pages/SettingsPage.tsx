import { useNavigate, useParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Bot, Plug, FlaskConical } from 'lucide-react';
import SettingsAutomationPage from './SettingsAutomationPage';
import SettingsIntegrationsPage from './SettingsIntegrationsPage';
import SettingsTestsPage from './SettingsTestsPage';
import { PwaInstallGuide } from '@/components/PwaInstallGuide';

const VALID = ['automation', 'integrations', 'tests'] as const;
type Tab = (typeof VALID)[number];

export default function SettingsPage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const current: Tab = (VALID as readonly string[]).includes(tab ?? '') ? (tab as Tab) : 'automation';

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Gère ton automatisation, tes intégrations et tes tests système</p>
      </div>

      <PwaInstallGuide />

      <Tabs value={current} onValueChange={(v) => navigate(`/settings/${v}`)}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="automation" className="gap-2">
            <Bot className="h-4 w-4" /> Automatisation
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Plug className="h-4 w-4" /> Intégrations
          </TabsTrigger>
          <TabsTrigger value="tests" className="gap-2">
            <FlaskConical className="h-4 w-4" /> Tests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="automation" className="mt-6">
          <SettingsAutomationPage />
        </TabsContent>
        <TabsContent value="integrations" className="mt-6">
          <SettingsIntegrationsPage />
        </TabsContent>
        <TabsContent value="tests" className="mt-6">
          <SettingsTestsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
