import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Modal } from "../Modal";
import { SidebarContent } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const navigate = useNavigate();

  /*
   * Atajos de teclado (la lista completa sale con "?"). Las letras se ignoran mientras se
   * escribe en un campo o con una tecla modificadora, para no robarle letras a nadie;
   * Ctrl+K funciona en cualquier sitio, como en la mayoría de herramientas.
   */
  useEffect(() => {
    const focusSearch = () => {
      const field = document.getElementById("buscar-global");

      if (field) field.focus();
      else navigate("/tickets");
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearch();

        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;

      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [role=dialog]"))) return;

      if (event.key === "/") {
        event.preventDefault();
        focusSearch();
      } else if (event.key === "n") {
        event.preventDefault();
        navigate("/tickets/nuevo");
      } else if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (event.key === "j" || event.key === "k") {
        // Recorre las filas marcadas con data-nav-row (tickets, activos, órdenes); Enter abre la enfocada.
        const rows = [...document.querySelectorAll<HTMLElement>("[data-nav-row]")].filter((row) => row.offsetParent !== null);

        if (!rows.length) return;
        event.preventDefault();
        const index = rows.findIndex((row) => row === document.activeElement);
        const next = index === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, index + (event.key === "j" ? 1 : -1)));
        rows[next]!.focus();
        rows[next]!.scrollIntoView({ block: "nearest" });
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
        className={`relative hidden shrink-0 border-r border-[var(--rail-bezel)] bg-[var(--rail-bg)] lg:block ${
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
        <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Atajos de teclado">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
            {SHORTCUTS.map(([keys, action]) => (
              <div key={action} className="contents">
                <dt>
                  {keys.map((key) => (
                    <kbd
                      key={key}
                      className="mr-1 rounded border border-[var(--field-border)] bg-[var(--content-bg)] px-1.5 py-0.5 font-display text-xs text-[var(--content-ink)]"
                    >
                      {key}
                    </kbd>
                  ))}
                </dt>
                <dd className="text-[var(--content-ink)]">{action}</dd>
              </div>
            ))}
          </dl>
        </Modal>
        <main id="contenido" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["/"], "Buscar tickets; escribe TK-, ACT-, OT- o REP- y un número para ir directo"],
  [["Ctrl", "K"], "Buscar desde cualquier sitio, también dentro de un campo"],
  [["n"], "Nuevo ticket"],
  [["j"], "Siguiente fila de la lista"],
  [["k"], "Fila anterior"],
  [["Enter"], "Abrir la fila enfocada"],
  [["?"], "Ver esta lista"],
];
