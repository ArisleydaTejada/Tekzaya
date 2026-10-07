import { initialsOf, roleLabelOf } from "@tekzaya/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { updateMyAvailability } from "../../api/auth";
import { ME_QUERY_KEY, useAuth } from "../../auth/AuthContext";
import { Avatar } from "../Avatar";
import { Link } from "react-router-dom";
import { ChevronDownIcon, MoonIcon, SunIcon, UserIcon } from "../icons";
import { NotificationBell } from "./NotificationBell";
import { useTheme } from "../../theme/ThemeContext";

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { theme, toggle } = useTheme();
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
        <NotificationBell />

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
                  <Link
                    to="/perfil"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                  >
                    <UserIcon className="h-4 w-4 shrink-0 text-[var(--content-ink-dim)]" />
                    Administrar perfil
                  </Link>
                  {/* El tema es una preferencia de quien mira, no una herramienta de
                      la barra: vive con el resto de sus ajustes personales. */}
                  <button
                    onClick={toggle}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                  >
                    {theme === "light" ? (
                      <MoonIcon className="h-4 w-4 shrink-0 text-[var(--content-ink-dim)]" />
                    ) : (
                      <SunIcon className="h-4 w-4 shrink-0 text-[var(--content-ink-dim)]" />
                    )}
                    {theme === "light" ? "Tema oscuro" : "Tema claro"}
                  </button>
                  <div className="my-1 border-t border-[var(--content-border)]" />
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
