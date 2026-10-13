import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAdmin, RequireAuth, RequireSettingsManager, RequireUserManager } from "./auth/RequireAuth";
import { AppShell } from "./components/shell/AppShell";
import AccessLinkPage from "./pages/AccessLinkPage";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TicketsPage from "./pages/TicketsPage";
import CreateTicketPage from "./pages/CreateTicketPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import AdministracionPage from "./pages/AdministracionPage";
import PerfilPage from "./pages/PerfilPage";
import ReportesPage from "./pages/ReportesPage";
import { RealtimeProvider } from "./realtime/RealtimeContext";
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
            {/* Un solo socket para toda la sesión; de él viven la campana y los listados. */}
            <RealtimeProvider>
              <Routes>
                <Route path="/" element={<LoginPage />} />
                {/* Enlaces que reparte el administrador; se abren sin sesión. */}
                <Route path="/invitacion" element={<AccessLinkPage purpose="invite" />} />
                <Route path="/restablecer" element={<AccessLinkPage purpose="reset" />} />
                <Route element={<RequireAuth />}>
                  <Route element={<AppShell />}>
                    <Route path="/tablero" element={<DashboardPage />} />
                    <Route path="/tickets" element={<TicketsPage />} />
                    <Route path="/tickets/nuevo" element={<CreateTicketPage />} />
                    <Route path="/tickets/:number" element={<TicketDetailPage />} />
                    <Route path="/perfil" element={<PerfilPage />} />
                    {/* Usuarios y configuración los llevan el administrador y RRHH;
                        áreas, solo el administrador (spec §4.3). */}
                    <Route element={<RequireUserManager />}>
                      <Route
                        path="/administracion"
                        element={<Navigate to="/administracion/usuarios" replace />}
                      />
                      <Route path="/administracion/usuarios" element={<AdministracionPage />} />
                    </Route>
                    <Route element={<RequireSettingsManager />}>
                      <Route
                        path="/administracion/configuracion"
                        element={<AdministracionPage tab="configuracion" />}
                      />
                    </Route>
                    <Route element={<RequireAdmin />}>
                      <Route path="/administracion/:tab" element={<AdministracionPage />} />
                    </Route>
                    <Route path="/reportes" element={<ReportesPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </RealtimeProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
