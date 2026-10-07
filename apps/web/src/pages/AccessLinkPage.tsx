import { newPassword } from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { acceptInvite, readAccessLink, resetPassword } from "../api/admin";
import { ME_QUERY_KEY } from "../auth/AuthContext";
import { LogoLockup } from "../components/Logo";
import { AlertIcon, CheckIcon } from "../components/icons";

/**
 * La pantalla a la que lleva el enlace que reparte el administrador. Sirve para
 * las dos cosas —estrenar la cuenta y cambiar una contraseña olvidada— porque el
 * formulario es el mismo y solo cambia lo que se cuenta alrededor (spec §7.7).
 */
export default function AccessLinkPage({ purpose }: { purpose: "invite" | "reset" }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [touched, setTouched] = useState(false);

  const preview = useQuery({
    queryKey: ["access-link", token, purpose],
    queryFn: () => readAccessLink(token, purpose),
    enabled: token.length > 0,
    retry: false,
  });

  const submit = useMutation({
    mutationFn: () =>
      purpose === "invite"
        ? acceptInvite({ token, password })
        : resetPassword({ token, password }),
    onSuccess: (me) => {
      // La respuesta ya trae la sesión iniciada: se entra directo al tablero.
      queryClient.setQueryData(ME_QUERY_KEY, me);
      navigate("/tablero", { replace: true });
    },
  });

  const check = newPassword.safeParse(password);
  const mismatch = repeat.length > 0 && password !== repeat;
  const ready = check.success && !mismatch && repeat.length > 0;

  const title = purpose === "invite" ? "Bienvenido a Tekzaya" : "Elige una contraseña nueva";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--content-bg)] px-4 py-10">
      <div className="w-full max-w-sm">
        {/* El fondo aquí sí sigue al tema, así que el logotipo también. */}
        <LogoLockup className="mx-auto mb-6 h-9 w-auto object-contain" />

        {!token || preview.isError ? (
          <div className="rounded-2xl border border-[var(--content-border)] bg-[var(--content-surface)] p-6 text-center">
            <p className="mb-2 flex items-center justify-center gap-1.5 text-sm font-medium text-red">
              <AlertIcon /> Este enlace ya no es válido
            </p>
            <p className="text-xs text-[var(--content-ink-dim)]">
              Los enlaces caducan y solo se pueden usar una vez. Pídele otro a tu administrador.
            </p>
            <Link
              to="/"
              className="mt-4 inline-block rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)]"
            >
              Ir al inicio de sesión
            </Link>
          </div>
        ) : preview.isLoading ? (
          <div className="flex justify-center py-10">
            <span
              className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent"
              aria-label="Comprobando el enlace"
            />
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setTouched(true);
              if (ready) submit.mutate();
            }}
            className="rounded-2xl border border-[var(--content-border)] bg-[var(--content-surface)] p-6"
          >
            <h1 className="font-display text-xl font-semibold text-[var(--content-ink)]">{title}</h1>
            <p className="mt-1 text-sm text-[var(--content-ink-dim)]">
              {preview.data!.name} · {preview.data!.email}
              <span className="block">Área: {preview.data!.areaName}</span>
            </p>

            <label
              htmlFor="password"
              className="mb-1.5 mt-5 block text-xs font-medium text-[var(--content-ink-dim)]"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => setTouched(true)}
              className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            {touched && !check.success && (
              <p className="mt-1.5 text-xs text-red">{check.error.issues[0]!.message}</p>
            )}

            <label
              htmlFor="repeat"
              className="mb-1.5 mt-4 block text-xs font-medium text-[var(--content-ink-dim)]"
            >
              Repite la contraseña
            </label>
            <input
              id="repeat"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
              className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            {mismatch && <p className="mt-1.5 text-xs text-red">Las dos no coinciden.</p>}

            <p className="mt-3 flex items-start gap-1.5 text-xs text-[var(--content-ink-dim)]">
              <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Al menos 10 caracteres, combinando letras y números. Nadie más la conoce: ni siquiera
              tu administrador.
            </p>

            <AnimatePresence>
              {submit.isError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  role="alert"
                  className="mt-4 overflow-hidden rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-xs font-medium text-red"
                >
                  {submit.error.message}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={submit.isPending}
              className="mt-5 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-dim disabled:opacity-60"
            >
              {submit.isPending
                ? "Guardando…"
                : purpose === "invite"
                  ? "Crear mi contraseña y entrar"
                  : "Guardar y entrar"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
