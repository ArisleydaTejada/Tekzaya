import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { SidebarContent } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-dvh bg-[var(--content-bg)]">
      {/* La barra de escritorio. Sigue al tema: clara con el claro, oscura con
          el oscuro, al contrario que el resto del cromo "instrumento". */}
      <aside
        className={`relative hidden shrink-0 border-r border-[var(--rail-bezel)] bg-[var(--rail-bg)] transition-[width] duration-200 lg:block ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        {/* Abrir y cerrar la barra vive en su propia cabecera, no en un tirador
            flotando sobre el contenido: el logo la abre y el icono del panel la
            cierra, que es donde la mano ya está mirando. */}
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
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
