import { initialsOf, roleLabelOf } from "@tekzaya/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { updateMyAvailability } from "../../api/auth";
import { ME_QUERY_KEY, useAuth } from "../../auth/AuthContext";
import { Avatar } from "../Avatar";
import { BellIcon, ChevronDownIcon, MoonIcon, SunIcon } from "../icons";
import { useTheme } from "../../theme/ThemeContext";

const NOTIFICATIONS = [
  { id: "n1", text: "Te asignaron TK-000480 · Laptop no enciende", when: "hace 12 min", tone: "red" as const },
  { id: "n2", text: "Posible incidente: 3 tickets sobre el wifi en Ventas", when: "hace 20 min", tone: "amber" as const },
  { id: "n3", text: "TK-000452 sigue en riesgo de vencer el SLA", when: "hace 1 h", tone: "amber" as const },
];

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { theme, toggle } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { me, logout } = useAuth();
  const queryClient = useQueryClient();

  const availabilityMutation = useMutation({
    mutationFn: updateMyAvailability,
    onSuccess: (updated) => queryClient.setQueryData(ME_QUERY_KEY, updated),
  });

  if (!me) return null;

  const isAvailable = me.availability.state === "available";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[var(--content-border)] bg-[var(--content-bg)] px-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--content-ink-dim)] hover:bg-[var(--content-surface)] lg:hidden"
        aria-label="Abrir menú"
      >
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--content-ink-dim)] hover:bg-[var(--content-surface)]"
          aria-label={theme === "light" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--content-ink-dim)] hover:bg-[var(--content-surface)]"
            aria-label="Notificaciones"
          >
            <BellIcon />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red" aria-hidden="true" />
          </button>
          <AnimatePresence>
            {notifOpen && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" onClick={() => setNotifOpen(false)} aria-label="Cerrar notificaciones" />
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-[var(--content-border)] bg-[var(--content-surface)] p-2 shadow-[var(--content-shadow)]"
                >
                  <p className="px-2 py-1.5 font-display text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--content-ink-dim)]">
                    Notificaciones
                  </p>
                  {NOTIFICATIONS.map((n) => (
                    <div key={n.id} className="flex items-start gap-2 rounded-lg px-2 py-2 text-sm hover:bg-[var(--content-bg)]">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.tone === "red" ? "bg-red" : "bg-amber"}`} />
                      <div>
                        <p className="text-[var(--content-ink)]">{n.text}</p>
                        <p className="text-xs text-[var(--content-ink-dim)]">{n.when}</p>
                      </div>
                    </div>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-[var(--content-surface)]"
          >
            <Avatar name={me.name} initials={initialsOf(me.name)} available={isAvailable} />
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-sm font-medium text-[var(--content-ink)]">{me.name}</span>
              <span className="block text-xs text-[var(--content-ink-dim)]">
                {me.areaName} · {roleLabelOf(me)}
              </span>
            </span>
            <ChevronDownIcon className="hidden text-[var(--content-ink-dim)] md:block" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-[var(--content-border)] bg-[var(--content-surface)] p-1.5 shadow-[var(--content-shadow)]"
                >
                  <p className="px-3 py-1.5 text-xs text-[var(--content-ink-dim)]">{me.email}</p>
                  <button
                    onClick={() => {
                      availabilityMutation.mutate({ state: isAvailable ? "away" : "available" });
                      setMenuOpen(false);
                    }}
                    disabled={availabilityMutation.isPending}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--content-ink)] hover:bg-[var(--content-bg)] disabled:opacity-60"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${isAvailable ? "bg-green" : "bg-amber"}`}
                      aria-hidden="true"
                    />
                    {isAvailable ? "Marcarme como ausente" : "Marcarme como disponible"}
                  </button>
                  <button
                    onClick={logout}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red hover:bg-red/10"
                  >
                    Cerrar sesión
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
