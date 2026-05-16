import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Overview } from "@/pages/Overview";
import { CeoDashboard } from "@/pages/CeoDashboard";
import { CallPerformance } from "@/pages/CallPerformance";
import { KpiReport } from "@/pages/KpiReport";
import { PipelineHealth } from "@/pages/PipelineHealth";
import { TeamPerformance } from "@/pages/TeamPerformance";
import { LeadSources } from "@/pages/LeadSources";
import { DealTracker } from "@/pages/DealTracker";
import { WeeklyReport } from "@/pages/WeeklyReport";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route index element={<Overview />} />
            <Route path="ceo" element={<CeoDashboard />} />
            <Route path="calls" element={<CallPerformance />} />
            <Route path="kpi" element={<KpiReport />} />
            <Route path="pipeline" element={<PipelineHealth />} />
            <Route path="team" element={<TeamPerformance />} />
            <Route path="sources" element={<LeadSources />} />
            <Route path="deals" element={<DealTracker />} />
            <Route path="weekly" element={<WeeklyReport />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
