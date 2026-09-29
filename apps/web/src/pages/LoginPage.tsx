import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { Field } from "../components/Field";
import { GoogleMark } from "../components/GoogleMark";
import { LeverButton } from "../components/LeverButton";
import { AlertIcon, CheckIcon, LockIcon, MailIcon } from "../components/icons";

const DEMO_EMAIL = "aris@tekzaya.com";
const DEMO_PASSWORD = "Tekzaya123";
const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;

type FormStatus = "idle" | "loading" | "error" | "locked" | "success";
type GoogleStatus = "idle" | "loading" | "disabled";

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Wordmark({
  size = "md",
  tone = "panel",
  className = "",
}: {
  size?: "sm" | "md";
  tone?: "panel" | "placard";
  className?: string;
}) {
  const box = size === "md" ? "h-20 w-20 rounded-2xl" : "h-8 w-8 rounded-lg";
  const glyph = size === "md" ? 42 : 16;
  const text = size === "md" ? "text-6xl" : "text-xl";
  const textTone = tone === "panel" ? "text-panel-ink" : "text-placard-ink";
  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      <span className={`flex shrink-0 items-center justify-center ${box} bg-panel-surface-2 ring-1 ring-inset ring-panel-bezel`}>
        <svg viewBox="0 0 24 24" width={glyph} height={glyph} aria-hidden="true">
          <path d="M6 7h12M12 7v10" stroke="#f5f3f7" strokeWidth={2.4} strokeLinecap="round" />
        </svg>
      </span>
      <span className={`font-display ${text} font-semibold tracking-wide ${textTone}`}>TEKZAYA</span>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [attempts, setAttempts] = useState(0);
  const [lockSeconds, setLockSeconds] = useState(LOCK_SECONDS);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>("idle");
  const [showResetHelp, setShowResetHelp] = useState(false);

  useEffect(() => {
    if (status !== "locked") return;
    if (lockSeconds <= 0) {
      setStatus("idle");
      setAttempts(0);
      setLockSeconds(LOCK_SECONDS);
      return;
    }
    const id = window.setTimeout(() => setLockSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [status, lockSeconds]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "locked" || status === "loading") return;
    setStatus("loading");
    window.setTimeout(() => {
      const validMatch = email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
      if (validMatch) {
        setStatus("success");
        return;
      }
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      if (nextAttempts >= MAX_ATTEMPTS) {
        setLockSeconds(LOCK_SECONDS);
        setStatus("locked");
      } else {
        setStatus("error");
      }
    }, 700);
  }

  function handleGoogle() {
    if (googleStatus === "loading") return;
    setGoogleStatus("loading");
    window.setTimeout(() => setGoogleStatus("disabled"), 700);
  }

  const remainingAttempts = MAX_ATTEMPTS - attempts;

  return (
    <div className="min-h-dvh w-full bg-panel lg:flex">
      {/* Left panel — left empty by design, just the brand mark. */}
      <section className="hidden bg-panel px-10 py-12 lg:flex lg:w-1/2 lg:flex-col lg:justify-center xl:px-16">
        <div>
          <Wordmark />
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
          <Wordmark size="sm" tone="placard" className="mb-8 lg:hidden" />

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
                  <span>
                    Correo o contraseña incorrectos.{" "}
                    {remainingAttempts <= 2 && remainingAttempts > 0 && (
                      <>
                        Te quedan {remainingAttempts} {remainingAttempts === 1 ? "intento" : "intentos"}.
                      </>
                    )}
                  </span>
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
                  Demasiados intentos. Inténtalo de nuevo en{" "}
                  <span className="tabular font-medium">{formatClock(lockSeconds)}</span> minutos.
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={status === "locked" || status === "loading" || status === "success"}
              whileTap={status === "idle" || status === "error" ? { y: 1 } : undefined}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgba(108,92,231,0.65)] transition-colors hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-70"
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
                    ? `Bloqueado · ${formatClock(lockSeconds)}`
                    : "Iniciar sesión"}
            </motion.button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-placard-border" />
            <span className="text-xs uppercase tracking-[0.14em] text-placard-ink-dim">o</span>
            <span className="h-px flex-1 bg-placard-border" />
          </div>

          <LeverButton icon={<GoogleMark />} busy={googleStatus === "loading"} onClick={handleGoogle}>
            Continuar con Google
          </LeverButton>
          <AnimatePresence>
            {googleStatus === "disabled" && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2.5 flex items-start gap-1.5 overflow-hidden rounded-lg border-2 border-red bg-red/10 px-3 py-2 text-xs font-medium text-red"
              >
                <AlertIcon className="mt-0.5 shrink-0" />
                Tu cuenta no está habilitada. Contacta al administrador.
              </motion.p>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {status === "success" && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-center gap-1.5 rounded-lg border-2 border-green bg-green/10 px-3 py-2 text-xs font-medium text-green"
              >
                <CheckIcon /> Bienvenida, Ana. Tu tablero se abrirá aquí.
              </motion.p>
            )}
          </AnimatePresence>

          <p className="mt-8 text-center text-xs text-placard-ink-dim">¿No tienes cuenta? El administrador te invita.</p>
        </div>
      </section>
    </div>
  );
}
