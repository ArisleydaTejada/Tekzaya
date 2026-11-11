import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarContent } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  /*
   * Atajos de teclado: "/" busca y "n" abre un ticket nuevo. Se ignoran mientras se
   * escribe en un campo o con una tecla modificadora, para no robarle letras a nadie.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;

      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;

      if (event.key === "/") {
        const field = document.getElementById("buscar-global");
        event.preventDefault();

        if (field) field.focus();
        else navigate("/tickets");
      } else if (event.key === "n") {
        event.preventDefault();
        navigate("/tickets/nuevo");
      }
    };

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="flex min-h-dvh bg-[var(--content-bg)]">
      {/* Con teclado, el primer Tab salta el menú entero y va directo al contenido. */}
      <a
        href="#contenido"
        className="sr-only z-[60] rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Saltar al contenido
      </a>
      {/* La barra de escritorio. Sigue al tema: clara con el claro, oscura con
          el oscuro, al contrario que el resto del cromo "instrumento". */}
      <aside
        className={`relative hidden shrink-0 border-r border-[var(--rail-bezel)] bg-[var(--rail-bg)] transition-[width] duration-200 lg:block ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        {/* El logo abre la barra y el icono del panel la cierra, en su cabecera y no en un tirador flotante. */}
        <div className="sticky top-0 h-dvh">
          <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setDrawerOpen(false)}
              aria-label="Cerrar menú"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed inset-y-0 left-0 z-50 w-64 bg-[var(--rail-bg)] lg:hidden"
            >
              {/* En móvil no hay rail estrecho: el mismo icono cierra el cajón. */}
              <SidebarContent collapsed={false} onToggle={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setDrawerOpen(true)} />
        <main id="contenido" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
