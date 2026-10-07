import { loginInput } from "@tekzaya/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login, loginWithGoogle } from "../api/auth";
import { ApiRequestError } from "../api/client";
import { ME_QUERY_KEY } from "../auth/AuthContext";
import { Field } from "../components/Field";
import { GoogleMark } from "../components/GoogleMark";
import { LeverButton } from "../components/LeverButton";
import { LogoLockup } from "../components/Logo";
import { AlertIcon, CheckIcon, LockIcon, MailIcon } from "../components/icons";

type FormStatus = "idle" | "loading" | "error" | "locked" | "success";

/*
 * La plancha de la izquierda es oscura en los dos temas —ahí el contraste es el
 * diseño—, así que su logotipo va en blanco siempre. El de arriba del formulario
 * se posa sobre la placa clara y va en negro. Es el mismo logotipo; lo que
 * cambia es sobre qué se apoya.
 */
function Wordmark({ size = "md", on, className = "" }: {
  size?: "sm" | "md";
  on: "dark" | "light";
  className?: string;
}) {
  return (
    <LogoLockup
      on={on}
      className={`w-auto object-contain object-left ${size === "md" ? "h-20" : "h-9"} ${className}`}
    />
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [googleMessage, setGoogleMessage] = useState("");
  const [showResetHelp, setShowResetHelp] = useState(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  function handleAuthError(error: unknown): void {
    const isApiError = error instanceof ApiRequestError;
    // El servidor distingue bloqueo de credenciales incorrectas; la interfaz
    // refleja esa diferencia en vez de inventar su propio contador.
    setStatus(isApiError && error.code === "account_locked" ? "locked" : "error");
    setErrorMessage(
      isApiError ? error.message : "No se pudo contactar con el servidor. Inténtalo de nuevo.",
    );
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (me) => {
      setStatus("success");
      queryClient.setQueryData(ME_QUERY_KEY, me);
      navigate("/tablero", { replace: true });
    },
    onError: handleAuthError,
  });

  const googleMutation = useMutation({
    mutationFn: loginWithGoogle,
    onSuccess: (me) => {
      queryClient.setQueryData(ME_QUERY_KEY, me);
      navigate("/tablero", { replace: true });
    },
    onError: (error: unknown) => {
      setGoogleMessage(
        error instanceof ApiRequestError
          ? error.message
          : "No se pudo contactar con el servidor.",
      );
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === "loading") return;

    // El mismo esquema que valida el backend valida aquí (spec §10.1).
    const parsed = loginInput.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setStatus("error");
      setErrorMessage(parsed.error.issues[0]?.message ?? "Revisa los datos");
      return;
    }

    setStatus("loading");
    setErrorMessage("");
    loginMutation.mutate(parsed.data);
  }

  function handleGoogle() {
    // Google Identity Services se integra en F5 junto con su clave; mientras
    // tanto se consulta al servidor, que responde si está configurado o no.
    setGoogleMessage("");
    googleMutation.mutate("pendiente-de-configurar");
  }

  return (
    <div className="min-h-dvh w-full bg-panel lg:flex">
      {/* Left panel — left empty by design, just the brand mark. */}
      <section className="hidden bg-panel px-10 py-12 lg:flex lg:w-1/2 lg:flex-col lg:justify-center xl:px-16">
        <div>
          <Wordmark on="dark" />
          <p className="mt-6 max-w-sm text-base text-panel-ink-dim">Soporte y mantenimiento, en un solo lugar.</p>
        </div>
      </section>

      {/* Mounting seam — the panel and the placard read as two physically joined plates */}
      <div
        className="relative hidden w-2 shrink-0 lg:block"
        style={{
          background: "linear-gradient(180deg, #08070b 0%, #3a3444 12%, #58506a 50%, #3a3444 88%, #08070b 100%)",
          boxShadow: "inset 1px 0 1px rgba(255,255,255,0.06), inset -1px 0 1px rgba(0,0,0,0.7)",
        }}
        aria-hidden="true"
      />

      {/* Placard — the form, always visible */}
      <section className="flex min-h-dvh w-full items-center justify-center bg-placard px-6 py-12 lg:min-h-0 lg:w-1/2">
        <div className="w-full max-w-sm">
          <Wordmark size="sm" on="light" className="mb-8 lg:hidden" />

          <h1 className="font-display text-3xl font-semibold tracking-tight text-placard-ink">Bienvenido de nuevo</h1>
          <p className="mt-1.5 text-sm text-placard-ink-dim">Inicia sesión para continuar.</p>

          <form onSubmit={handleSubmit} noValidate className="mt-7">
            <div className="flex flex-col gap-4">
              <Field
                label="Correo electrónico"
                icon={<MailIcon />}
                type="email"
                autoComplete="username"
                placeholder="tu.nombre@empresa.com"
                value={email}
                disabled={status === "locked"}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Field
                label="Contraseña"
                icon={<LockIcon />}
                revealable
                autoComplete="current-password"
                placeholder="Tu contraseña"
                value={password}
                disabled={status === "locked"}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="mt-2.5 text-right">
              {showResetHelp ? (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-placard-ink-dim">
                  Pide a tu administrador un enlace para restablecerla.{" "}
                  <button
                    type="button"
                    onClick={() => setShowResetHelp(false)}
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Entendido
                  </button>
                </motion.p>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowResetHelp(true)}
                  className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {status === "error" && (
                <motion.p
                  key="error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 flex items-start gap-1.5 overflow-hidden rounded-lg border-2 border-red bg-red/10 px-3 py-2 text-xs font-medium text-red"
                >
                  <AlertIcon className="mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </motion.p>
              )}
              {status === "locked" && (
                <motion.p
                  key="locked"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 flex items-start gap-1.5 overflow-hidden rounded-lg border-2 border-amber bg-amber/10 px-3 py-2 text-xs font-medium text-amber"
                >
                  <AlertIcon className="mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={status === "locked" || status === "loading" || status === "success"}
              whileTap={status === "idle" || status === "error" ? { y: 1 } : undefined}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgba(88,71,157,0.65)] transition-colors hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status === "loading" && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              )}
              {status === "success" && <CheckIcon />}
              {status === "success"
                ? "Sesión iniciada"
                : status === "loading"
                  ? "Verificando…"
                  : status === "locked"
                    ? "Cuenta bloqueada"
                    : "Iniciar sesión"}
            </motion.button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-placard-border" />
            <span className="text-xs uppercase tracking-[0.14em] text-placard-ink-dim">o</span>
            <span className="h-px flex-1 bg-placard-border" />
          </div>

          <LeverButton icon={<GoogleMark />} busy={googleMutation.isPending} onClick={handleGoogle}>
            Continuar con Google
          </LeverButton>
          <AnimatePresence>
            {googleMessage && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2.5 flex items-start gap-1.5 overflow-hidden rounded-lg border-2 border-red bg-red/10 px-3 py-2 text-xs font-medium text-red"
              >
                <AlertIcon className="mt-0.5 shrink-0" />
                <span>{googleMessage}</span>
              </motion.p>
            )}
          </AnimatePresence>

          <p className="mt-8 text-center text-xs text-placard-ink-dim">¿No tienes cuenta? El administrador te invita.</p>
        </div>
      </section>
    </div>
  );
}
