import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { ChevronDownIcon } from "../icons";
import { SidebarContent } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-dvh bg-[var(--content-bg)]">
      {/* Desktop sidebar — the cockpit frame, fixed dark in both themes */}
      <aside
        className={`relative hidden shrink-0 border-r border-panel-bezel bg-panel transition-[width] duration-200 lg:block ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        <div className="sticky top-0 h-dvh">
          <SidebarContent collapsed={collapsed} />
        </div>

        {/* Collapse handle — straddles the panel's edge so it stays put whether the rail is open or closed */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="absolute -right-3 top-8 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-panel-bezel bg-panel-surface-2 text-panel-ink-dim shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-colors hover:text-panel-ink"
          aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
        >
          <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${collapsed ? "-rotate-90" : "rotate-90"}`} />
        </button>
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
              className="fixed inset-y-0 left-0 z-50 w-64 bg-panel lg:hidden"
            >
              <SidebarContent collapsed={false} />
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
