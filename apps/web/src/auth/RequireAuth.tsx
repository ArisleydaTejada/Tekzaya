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
