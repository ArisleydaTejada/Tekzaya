import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./components/shell/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TicketsPage from "./pages/TicketsPage";
import CreateTicketPage from "./pages/CreateTicketPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import AdministracionPage from "./pages/AdministracionPage";
import ReportesPage from "./pages/ReportesPage";
import { ThemeProvider } from "./theme/ThemeContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppShell />}>
                  <Route path="/tablero" element={<DashboardPage />} />
                  <Route path="/tickets" element={<TicketsPage />} />
                  <Route path="/tickets/nuevo" element={<CreateTicketPage />} />
                  <Route path="/tickets/:number" element={<TicketDetailPage />} />
                  <Route
                    path="/administracion"
                    element={<Navigate to="/administracion/usuarios" replace />}
                  />
                  <Route path="/administracion/:tab" element={<AdministracionPage />} />
                  <Route path="/reportes" element={<ReportesPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
