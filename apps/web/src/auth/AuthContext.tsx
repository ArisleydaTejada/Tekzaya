import type { MeResponse } from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, use, type ReactNode } from "react";
import { getMe, logout as logoutRequest } from "../api/auth";

interface AuthValue {
  me: MeResponse | null;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export const ME_QUERY_KEY = ["me"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Un 401 aquí no es un fallo: significa que no hay sesión. Por eso no se
  // reintenta ni se trata como error de red.
  const { data, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: getMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      queryClient.clear();
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
