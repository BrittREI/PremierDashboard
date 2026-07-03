import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthGate } from "@/components/AuthGate";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TeamDashboard } from "@/pages/TeamDashboard";
import { CeoDashboard } from "@/pages/CeoDashboard";

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
    <AuthGate>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<DashboardLayout />}>
              <Route index element={<TeamDashboard />} />
              <Route path="ceo" element={<CeoDashboard />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthGate>
  );
}
