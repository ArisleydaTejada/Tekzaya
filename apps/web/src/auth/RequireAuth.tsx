import { canManageSettings, canManageUsers } from "@tekzaya/shared";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

/** Comodidad de navegación, no seguridad: cada endpoint vuelve a comprobar permisos (spec §10.4). */
export function RequireAuth() {
  const { me, isLoading } = useAuth();

  if (isLoading) return <SessionCheck />;

  if (!me) return <Navigate to="/" replace />;

  return <Outlet />;
}

/**
 * Con sesión válida se va directo al tablero; se espera a saberlo para no enseñar el formulario
 * un instante. Si la cookie de acceso caducó, `getSession` la renueva antes de decidir.
 */
export function RequireGuest() {
  const { me, isLoading } = useAuth();

  if (isLoading) return <SessionCheck />;

  if (me) return <Navigate to="/tablero" replace />;

  return <Outlet />;
}

function SessionCheck() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--content-bg)]">
      <span
        className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent"
        aria-label="Cargando"
      />
    </div>
  );
}

/**
 * Solo el administrador (spec §4.3). Quien llegue por la URL vuelve al tablero
 * en vez de ver una pantalla llena de 403.
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

/** Configuración: el administrador y RRHH, que ve la pantalla sin la IA ni los límites. */
export function RequireSettingsManager() {
  const { me, isLoading } = useAuth();

  if (isLoading) return null;

  if (!me) return <Navigate to="/" replace />;

  if (!canManageSettings(me)) return <Navigate to="/tablero" replace />;

  return <Outlet />;
}
