import type { MeResponse } from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, use, useEffect, type ReactNode } from "react";
import { getSession, logout as logoutRequest } from "../api/auth";
import { onSessionLost, refreshSession } from "../api/client";

interface AuthValue {
  me: MeResponse | null;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export const ME_QUERY_KEY = ["me"] as const;

/**
 * Cada cuánto se renueva la cookie de acceso, que dura 15 minutos. Con margen,
 * para que no caduque nunca mientras la aplicación está abierta: los enlaces de
 * descarga, los adjuntos, las fotos y el tiempo real usan la cookie directamente
 * y no pueden reintentar después de un 401 como hace `apiFetch`.
 */
const RENEW_EVERY_MS = 10 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Sin sesión, el servidor responde `null` y no un 401: es el caso normal en la
  // pantalla de inicio. Un error aquí es un fallo de red y no se reintenta.
  const { data, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: getSession,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const signedIn = Boolean(data);

  // Si la renovación falla, la sesión terminó: se vacía la caché y `RequireAuth`
  // devuelve a la pantalla de inicio de sesión.
  useEffect(
    () =>
      onSessionLost(() => {
        queryClient.clear();
        queryClient.setQueryData(ME_QUERY_KEY, null);
      }),
    [queryClient],
  );

  useEffect(() => {
    if (!signedIn) return;
    let last = Date.now();
    const renew = () => {
      last = Date.now();
      void refreshSession();
    };
    const timer = window.setInterval(renew, RENEW_EVERY_MS);
    // El navegador frena los temporizadores de las pestañas en segundo plano y los
    // detiene con el equipo suspendido: al volver, se renueva si ya tocaba.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= RENEW_EVERY_MS) renew();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn]);

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    // La sesión se da por cerrada al pulsar, sin esperar al servidor: si no, el
    // inicio de sesión vería todavía a la persona y la devolvería al tablero.
    onMutate: () => {
      queryClient.setQueryData(ME_QUERY_KEY, null);
    },
    // Se vacía todo menos la sesión, que ya vale `null`: borrarla haría que la
    // pantalla de inicio volviera a preguntar al servidor sin necesidad.
    onSettled: () => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] });
    },
  });

  return (
    <AuthContext
      value={{
        me: data ?? null,
        isLoading,
        logout: () => logoutMutation.mutate(),
      }}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return value;
}
