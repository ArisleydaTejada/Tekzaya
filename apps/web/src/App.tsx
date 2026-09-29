import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TicketsPage from "./pages/TicketsPage";
import CreateTicketPage from "./pages/CreateTicketPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import AdministracionPage from "./pages/AdministracionPage";
import ReportesPage from "./pages/ReportesPage";
import { ThemeProvider } from "./theme/ThemeContext";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route path="/tablero" element={<DashboardPage />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/tickets/nuevo" element={<CreateTicketPage />} />
            <Route path="/tickets/:number" element={<TicketDetailPage />} />
            <Route path="/administracion" element={<Navigate to="/administracion/usuarios" replace />} />
            <Route path="/administracion/:tab" element={<AdministracionPage />} />
            <Route path="/reportes" element={<ReportesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
