import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { OnboardingGuard } from "@/components/OnboardingGuard";
import OnboardingWizardPage from "@/pages/OnboardingWizardPage";
import { AuthProvider } from "@/hooks/useAuth";
import { WorkspaceProvider } from "@/hooks/useWorkspaces";
import Dashboard from "@/pages/Dashboard";
import LeadDetailPage from "@/pages/LeadDetailPage";
import RemindersPage from "@/pages/RemindersPage";
import PipelinePage from "@/pages/PipelinePage";
import ImportPage from "@/pages/ImportPage";
import OffersPage from "@/pages/OffersPage";
import OfferDetailPage from "@/pages/OfferDetailPage";
import BookingsPage from "@/pages/BookingsPage";
import PublicOfferPage from "@/pages/PublicOfferPage";
import PublicSignaturePage from "@/pages/PublicSignaturePage";
import PublicInvoicePage from "@/pages/PublicInvoicePage";
import AuthPage from "@/pages/AuthPage";
import UnsubscribePage from "@/pages/UnsubscribePage";
import ClientsPage from "@/pages/ClientsPage";
import ClientDetailPage from "@/pages/ClientDetailPage";
import OnboardingFormPage from "@/pages/OnboardingFormPage";
import SettingsPage from "@/pages/SettingsPage";
import ConversationsPage from "@/pages/ConversationsPage";
import NotFound from "@/pages/NotFound";
import ScrollRestoration from "@/components/ScrollRestoration";
import { OneSignalInit } from "@/components/OneSignalInit";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <WorkspaceProvider>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <ScrollRestoration />
          <OneSignalInit />
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/offers/:slug/page" element={<PublicOfferPage />} />
            <Route path="/unsubscribe" element={<UnsubscribePage />} />
            <Route path="/sign/:token" element={<PublicSignaturePage />} />
            <Route path="/invoice/:token" element={<PublicInvoicePage />} />
            <Route path="/onboarding/website" element={<OnboardingFormPage />} />
            <Route path="/onboarding/ads" element={<OnboardingFormPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/onboarding" element={<OnboardingWizardPage />} />
              <Route element={<OnboardingGuard />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<PipelinePage />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/leads/:id" element={<LeadDetailPage />} />
                <Route path="/clients" element={<ClientsPage />} />
                <Route path="/clients/:id" element={<ClientDetailPage />} />
                <Route path="/offers" element={<OffersPage />} />
                <Route path="/offers/:id" element={<OfferDetailPage />} />
                <Route path="/bookings" element={<BookingsPage />} />
                <Route path="/conversations" element={<ConversationsPage />} />
                <Route path="/reminders" element={<RemindersPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/:tab" element={<SettingsPage />} />
              </Route>
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </WorkspaceProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
