import { AppToaster } from "./components/AppToaster";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import {
  RedirectIfSignedIn,
  RequireAdmin,
  RequireAuth,
  RequireGuest,
  RequireSettingsManager,
  RequireUserManager,
} from "./auth/RequireAuth";
import { lazy, Suspense } from "react";
import AccessLinkPage from "./pages/AccessLinkPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import { RealtimeProvider } from "./realtime/RealtimeContext";
import { ThemeProvider } from "./theme/ThemeContext";

/*
 * La página pública, el login y los enlaces de acceso van en el paquete
 * inicial; la aplicación se baja al entrar en ella. Quien llega a "/" desde un
 * buscador no descarga gráficas, tableros ni el editor de reportes.
 */
const AppShell = lazy(() => import("./components/shell/AppShell").then((module) => ({ default: module.AppShell })));

const DashboardPage = lazy(() => import("./pages/DashboardPage"));

const TicketsPage = lazy(() => import("./pages/TicketsPage"));

const CreateTicketPage = lazy(() => import("./pages/CreateTicketPage"));

const TicketDetailPage = lazy(() => import("./pages/TicketDetailPage"));

const AdministracionPage = lazy(() => import("./pages/AdministracionPage"));

const PerfilPage = lazy(() => import("./pages/PerfilPage"));

const ActivosPage = lazy(() => import("./pages/ActivosPage"));

const ActivoDetailPage = lazy(() => import("./pages/ActivoDetailPage"));

const OrdenesPage = lazy(() => import("./pages/OrdenesPage"));

const OrdenDetailPage = lazy(() => import("./pages/OrdenDetailPage"));

const RepuestosPage = lazy(() => import("./pages/RepuestosPage"));

const RepuestoDetailPage = lazy(() => import("./pages/RepuestoDetailPage"));

const PreventivosPage = lazy(() => import("./pages/PreventivosPage"));

const MantenimientoPage = lazy(() => import("./pages/MantenimientoPage"));

const ReportesPage = lazy(() => import("./pages/ReportesPage"));

/** Mientras baja el armazón de la aplicación, el fondo del tema y nada más: dura un instante. */
function AppLoading() {
  return <div role="status" aria-label="Cargando" className="min-h-dvh bg-[var(--content-bg)]" />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* La regla de CSS no alcanza a las animaciones de `motion`: esto las apaga con "reducir movimiento". */}
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <BrowserRouter>
            <AuthProvider>
              {/* Un solo socket para toda la sesión; de él viven la campana y los listados. */}
              <RealtimeProvider>
                <AppToaster />
                <Suspense fallback={<AppLoading />}>
                <Routes>
                  {/* Con sesión abierta, la página pública y el login llevan al tablero. */}
                  <Route element={<RedirectIfSignedIn />}>
                    <Route path="/" element={<LandingPage />} />
                  </Route>
                  <Route element={<RequireGuest />}>
                    <Route path="/ingresar" element={<LoginPage />} />
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
                      <Route path="/preventivos" element={<PreventivosPage />} />
                      <Route path="/mantenimiento" element={<MantenimientoPage />} />
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
                </Suspense>
              </RealtimeProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
