import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import LeadsPage from "@/pages/LeadsPage";
import LeadDetailPage from "@/pages/LeadDetailPage";
import AddLeadPage from "@/pages/AddLeadPage";
import MessagesPage from "@/pages/MessagesPage";
import ScriptsPage from "@/pages/ScriptsPage";
import RemindersPage from "@/pages/RemindersPage";
import PipelinePage from "@/pages/PipelinePage";
import ImportPage from "@/pages/ImportPage";
import AuthPage from "@/pages/AuthPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<PipelinePage />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/new" element={<AddLeadPage />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/scripts" element={<ScriptsPage />} />
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
