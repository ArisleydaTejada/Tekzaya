import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  ChartIcon,
  GaugeNavIcon,
  LogOutIcon,
  PanelIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
  TicketIcon,
  UserIcon,
  UsersIcon,
  WrenchIcon,
} from "../icons";
import { ACTIVE_TICKET_STATUSES, canManageUsers } from "@tekzaya/shared";
import { useQuery } from "@tanstack/react-query";
import { listTickets, ticketKeys } from "../../api/tickets";
import { useAuth } from "../../auth/AuthContext";

const NAV_ITEMS = [
  { to: "/tablero", label: "Tablero", icon: GaugeNavIcon },
  { to: "/tickets", label: "Tickets", icon: TicketIcon, badge: true },
  { to: "/reportes", label: "Reportes", icon: ChartIcon },
];

/**
 * `adminOnly` separa lo que lleva RRHH de lo que es del administrador: RRHH se
 * encarga de las altas y bajas de personal, pero el catálogo de áreas define
 * cómo se enruta el trabajo y eso no es suyo (spec §4.3).
 */
const ADMIN_ITEMS = [
  { to: "/administracion/usuarios", label: "Usuarios", adminOnly: false },
  { to: "/administracion/areas", label: "Áreas y categorías", adminOnly: true },
];

function Mark() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
      <path d="M6 7h12M12 7v10" stroke="#f5f3f7" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

/**
 * La cabecera de la barra es también su interruptor.
 *
 * Plegada, el logo **es** el botón que la abre: al pasar por encima se convierte
 * en el icono del panel, que es lo que va a pasar al pulsarlo, y no hace falta
 * un tirador suelto en el borde para adivinarlo. Abierta, el logo vuelve a ser
 * logo y el icono se va al otro extremo de la fila, donde cierra.
 */
function SidebarHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        title="Abrir barra lateral"
        aria-label="Abrir barra lateral"
        aria-expanded={false}
        className="group flex h-8 w-8 items-center justify-center rounded-lg bg-panel-surface-2 text-panel-ink-dim ring-1 ring-inset ring-panel-bezel transition-colors hover:text-panel-ink"
      >
        <span className="group-hover:hidden group-focus-visible:hidden">
          <Mark />
        </span>
        <PanelIcon className="hidden h-4 w-4 group-hover:block group-focus-visible:block" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel-surface-2 ring-1 ring-inset ring-panel-bezel">
        <Mark />
      </span>
      <span className="font-display text-lg font-semibold tracking-wide text-panel-ink">TEKZAYA</span>
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          title="Cerrar barra lateral"
          aria-label="Cerrar barra lateral"
          aria-expanded
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-panel-ink-dim transition-colors hover:bg-panel-surface-2 hover:text-panel-ink"
        >
          <PanelIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Tickets asignados a esta persona que siguen sin resolver. Es la misma consulta
 * del listado pidiendo una sola fila: de la respuesta solo interesa el total.
 */
function useMyOpenCount(): number {
  const query = {
    scope: "assigned" as const,
    status: [...ACTIVE_TICKET_STATUSES],
    limit: 1,
  };
  const { data } = useQuery({
    queryKey: [...ticketKeys.list(query), "count"],
    queryFn: () => listTickets(query),
    staleTime: 30_000,
  });
  return data?.total ?? 0;
}

function NavItem({
  to,
  label,
  icon: Icon,
  badge,
  count,
  collapsed,
}: {
  to: string;
  label: string;
  icon: typeof GaugeNavIcon;
  badge?: boolean;
  count?: number;
  collapsed: boolean;
}) {
  const activeCount = count ?? 0;
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive: active }) =>
        `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          collapsed ? "justify-center" : ""
        } ${active ? "bg-accent/15 text-panel-ink" : "text-panel-ink-dim hover:bg-panel-surface-2 hover:text-panel-ink"}`
      }
    >
      {({ isActive: active }) => (
        <>
          {active && (
            <span
              className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent-bright shadow-[0_0_8px_var(--color-accent-bright)]"
              aria-hidden="true"
            />
          )}
          <Icon className={active ? "text-accent-bright" : ""} />
          {!collapsed && (
            <>
              <span className="flex-1">{label}</span>
              {badge && activeCount > 0 && (
                <span className="rounded-full bg-panel-surface-2 px-1.5 py-0.5 font-display text-[10px] font-semibold tabular text-panel-ink-dim">
                  {activeCount}
                </span>
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  );
}

interface SidebarContentProps {
  collapsed: boolean;
  /** Sin él la cabecera es solo el logo: el cajón móvil no se pliega, se cierra. */
  onToggle?: () => void;
}

export function SidebarContent({ collapsed, onToggle }: SidebarContentProps) {
  const { me, logout } = useAuth();
  const isAdmin = me?.role === "admin";
  const managesUsers = Boolean(me && canManageUsers(me));
  const myOpenCount = useMyOpenCount();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-5">
      <div className={collapsed ? "flex justify-center" : ""}>
        <SidebarHeader collapsed={collapsed} {...(onToggle ? { onToggle } : {})} />
      </div>

      <Link
        to="/tickets/nuevo"
        title={collapsed ? "Nuevo ticket" : undefined}
        className={`flex items-center justify-center gap-1.5 rounded-lg bg-accent py-2 font-semibold text-white shadow-[0_8px_16px_-8px_rgba(108,92,231,0.6)] transition-colors hover:bg-accent-dim ${
          collapsed ? "px-0 text-sm" : "px-3 text-sm"
        }`}
      >
        <PlusIcon className="h-4 w-4 shrink-0" />
        {!collapsed && "Nuevo ticket"}
      </Link>

      {collapsed ? (
        <button
          onClick={() => navigate("/tickets")}
          title="Buscar"
          className="flex h-9 items-center justify-center rounded-lg text-panel-ink-dim hover:bg-panel-surface-2 hover:text-panel-ink"
        >
          <SearchIcon />
        </button>
      ) : (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-panel-ink-dim" />
          <input
            type="search"
            placeholder="Buscar…"
            className="w-full rounded-lg border border-panel-bezel bg-panel-surface-2 py-2 pl-9 pr-8 text-sm text-panel-ink outline-none placeholder:text-panel-ink-dim focus:border-accent"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-panel-bezel px-1 font-display text-[10px] text-panel-ink-dim">
            /
          </kbd>
        </div>
      )}

      <nav className="flex flex-col gap-1">
        {!collapsed && (
          <p className="px-3 pb-1 font-display text-[10px] font-medium uppercase tracking-[0.14em] text-panel-ink-dim/70">
            Principal
          </p>
        )}
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} count={myOpenCount} collapsed={collapsed} />
        ))}

        <div
          className={`group relative flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-panel-ink-dim/50 ${
            collapsed ? "justify-center" : ""
          }`}
          title="Disponible en la Fase 2"
        >
          <WrenchIcon />
          {!collapsed && (
            <>
              <span className="flex-1">Activos y mantenimiento</span>
              <span className="rounded-full border border-panel-bezel px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-panel-ink-dim/70">
                Próximamente
              </span>
            </>
          )}
        </div>
      </nav>

      {managesUsers && (
        <div className="flex flex-col gap-1">
          {!collapsed && (
            <div className="flex items-center gap-2 px-3 py-1 font-display text-[10px] font-medium uppercase tracking-[0.14em] text-panel-ink-dim/70">
              <UsersIcon className="h-3.5 w-3.5" />
              Administración
            </div>
          )}
          {ADMIN_ITEMS.filter((item) => isAdmin || !item.adminOnly).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive: active }) =>
                `rounded-lg px-3 py-1.5 text-sm transition-colors ${collapsed ? "text-center" : "pl-9"} ${
                  active ? "bg-accent/15 font-medium text-panel-ink" : "text-panel-ink-dim hover:bg-panel-surface-2 hover:text-panel-ink"
                }`
              }
            >
              {collapsed ? item.label.slice(0, 1) : item.label}
            </NavLink>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1 border-t border-panel-bezel pt-3">
        <NavLink
          to="/perfil"
          title={collapsed ? "Administrar perfil" : undefined}
          className={({ isActive: active }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              collapsed ? "justify-center" : ""
            } ${active ? "bg-accent/15 text-panel-ink" : "text-panel-ink-dim hover:bg-panel-surface-2 hover:text-panel-ink"}`
          }
        >
          <UserIcon />
          {!collapsed && "Administrar perfil"}
        </NavLink>
        {/* Configuración es administración del sistema: quien no es administrador
            ni siquiera ve la opción, porque pulsarla solo le daría un 403. */}
        {isAdmin && (
          <NavLink
            to="/administracion/configuracion"
            title={collapsed ? "Configuración" : undefined}
            className={({ isActive: active }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                collapsed ? "justify-center" : ""
              } ${active ? "bg-accent/15 text-panel-ink" : "text-panel-ink-dim hover:bg-panel-surface-2 hover:text-panel-ink"}`
            }
          >
            <SlidersIcon />
            {!collapsed && "Configuración"}
          </NavLink>
        )}
        <button
          onClick={() => {
            logout();
            navigate("/", { replace: true });
          }}
          title={collapsed ? "Cerrar sesión" : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-panel-ink-dim transition-colors hover:bg-red/10 hover:text-red ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOutIcon />
          {!collapsed && "Cerrar sesión"}
        </button>
        {!collapsed && (
          <div className="mt-2 rounded-xl border border-panel-bezel bg-panel-surface-2 px-3 py-2.5 text-xs text-panel-ink-dim">
            Datos de ejemplo — vista previa académica.
          </div>
        )}
      </div>
    </div>
  );
}
