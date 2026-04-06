import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import LeadDetailPage from "@/pages/LeadDetailPage";
import RemindersPage from "@/pages/RemindersPage";
import PipelinePage from "@/pages/PipelinePage";
import ImportPage from "@/pages/ImportPage";
import OffersPage from "@/pages/OffersPage";
import OfferDetailPage from "@/pages/OfferDetailPage";
import BookingsPage from "@/pages/BookingsPage";
import PublicOfferPage from "@/pages/PublicOfferPage";
import AuthPage from "@/pages/AuthPage";
import UnsubscribePage from "@/pages/UnsubscribePage";
import ClientsPage from "@/pages/ClientsPage";
import ClientDetailPage from "@/pages/ClientDetailPage";
import OnboardingFormPage from "@/pages/OnboardingFormPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/offers/:slug/page" element={<PublicOfferPage />} />
          <Route path="/unsubscribe" element={<UnsubscribePage />} />
          <Route path="/onboarding/website" element={<OnboardingFormPage />} />
          <Route path="/onboarding/ads" element={<OnboardingFormPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<PipelinePage />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/clients/:id" element={<ClientDetailPage />} />
              <Route path="/offers" element={<OffersPage />} />
              <Route path="/offers/:id" element={<OfferDetailPage />} />
              <Route path="/bookings" element={<BookingsPage />} />
              <Route path="/reminders" element={<RemindersPage />} />
              <Route path="/import" element={<ImportPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
