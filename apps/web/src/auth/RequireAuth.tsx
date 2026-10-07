import { canManageUsers } from "@tekzaya/shared";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * Oculta las pantallas privadas mientras no haya sesión. Es comodidad de
 * navegación, no seguridad: cada endpoint vuelve a comprobar los permisos
 * en el servidor (spec §10.4).
 */
export function RequireAuth() {
  const { me, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--content-bg)]">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent"
          aria-label="Cargando"
        />
      </div>
    );
  }

  if (!me) return <Navigate to="/" replace />;

  return <Outlet />;
}

/**
 * Áreas y Configuración son del administrador y de nadie más (spec §4.3). Quien
 * llegue por la URL vuelve al tablero en vez de ver una pantalla que se llenaría
 * de 403; el servidor lo rechaza igualmente.
 */
export function RequireAdmin() {
  const { me, isLoading } = useAuth();

  if (isLoading) return null;
  if (!me) return <Navigate to="/" replace />;
  if (me.role !== "admin") return <Navigate to="/tablero" replace />;

  return <Outlet />;
}

/** Usuarios, en cambio, lo llevan el administrador y el supervisor de RRHH. */
export function RequireUserManager() {
  const { me, isLoading } = useAuth();

  if (isLoading) return null;
  if (!me) return <Navigate to="/" replace />;
  if (!canManageUsers(me)) return <Navigate to="/tablero" replace />;

  return <Outlet />;
}
