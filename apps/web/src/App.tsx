import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import {
  RequireAdmin,
  RequireAuth,
  RequireGuest,
  RequireSettingsManager,
  RequireUserManager,
} from "./auth/RequireAuth";
import { AppShell } from "./components/shell/AppShell";
import AccessLinkPage from "./pages/AccessLinkPage";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TicketsPage from "./pages/TicketsPage";
import CreateTicketPage from "./pages/CreateTicketPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import AdministracionPage from "./pages/AdministracionPage";
import PerfilPage from "./pages/PerfilPage";
import ActivosPage from "./pages/ActivosPage";
import ActivoDetailPage from "./pages/ActivoDetailPage";
import OrdenesPage from "./pages/OrdenesPage";
import OrdenDetailPage from "./pages/OrdenDetailPage";
import RepuestosPage from "./pages/RepuestosPage";
import RepuestoDetailPage from "./pages/RepuestoDetailPage";
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
                <Route element={<RequireGuest />}>
                  <Route path="/" element={<LoginPage />} />
                </Route>
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
                    {/* Módulo 2. Todos entran: cada uno ve los equipos que le tocan. */}
                    <Route path="/activos" element={<ActivosPage />} />
                    <Route path="/activos/:number" element={<ActivoDetailPage />} />
                    {/* Las ve el área que mantiene el equipo; al resto la API le da 404. */}
                    <Route path="/ordenes" element={<OrdenesPage />} />
                    <Route path="/ordenes/:number" element={<OrdenDetailPage />} />
                    <Route path="/repuestos" element={<RepuestosPage />} />
                    <Route path="/repuestos/:number" element={<RepuestoDetailPage />} />
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
