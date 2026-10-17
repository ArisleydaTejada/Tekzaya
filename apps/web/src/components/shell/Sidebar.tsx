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
import { ACTIVE_TICKET_STATUSES, canManageSettings, canManageUsers } from "@tekzaya/shared";
import { useQuery } from "@tanstack/react-query";
import { listTickets, ticketKeys } from "../../api/tickets";
import { useAuth } from "../../auth/AuthContext";
import { LogoLockup, LogoMark } from "../Logo";

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

/**
 * La cabecera de la barra es también su interruptor.
 *
 * Plegada, el logo **es** el botón que la abre: al pasar por encima se convierte
 * en el icono del panel, que es lo que va a pasar al pulsarlo, y no hace falta
 * un tirador suelto en el borde para adivinarlo. Abierta, el logo vuelve a ser
 * logo —el completo, con el nombre— y el icono se va al otro extremo de la
 * fila, donde cierra.
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
        className="group flex h-9 w-9 items-center justify-center rounded-lg text-[var(--rail-ink-dim)] transition-colors hover:bg-[var(--rail-surface-2)] hover:text-[var(--rail-ink)]"
      >
        <LogoMark className="h-6 w-6 object-contain group-hover:hidden group-focus-visible:hidden" />
        <PanelIcon className="hidden h-4 w-4 group-hover:block group-focus-visible:block" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-1">
      {/* El logotipo trae su propio nombre dibujado: no se le pone texto al lado. */}
      <LogoLockup className="h-7 w-auto shrink-0 object-contain object-left" />
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          title="Cerrar barra lateral"
          aria-label="Cerrar barra lateral"
          aria-expanded
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--rail-ink-dim)] transition-colors hover:bg-[var(--rail-surface-2)] hover:text-[var(--rail-ink)]"
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
        } ${active ? "bg-accent/15 text-[var(--rail-ink)]" : "text-[var(--rail-ink-dim)] hover:bg-[var(--rail-surface-2)] hover:text-[var(--rail-ink)]"}`
      }
    >
      {({ isActive: active }) => (
        <>
          {active && (
            <span
              className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[var(--accent-contrast)] shadow-[0_0_8px_var(--accent-contrast)]"
              aria-hidden="true"
            />
          )}
          <Icon className={active ? "text-[var(--accent-contrast)]" : ""} />
          {!collapsed && (
            <>
              <span className="flex-1">{label}</span>
              {badge && activeCount > 0 && (
                <span className="rounded-full bg-[var(--rail-surface-2)] px-1.5 py-0.5 font-display text-[10px] font-semibold tabular text-[var(--rail-ink-dim)]">
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
  const managesSettings = Boolean(me && canManageSettings(me));
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
        className={`flex items-center justify-center gap-1.5 rounded-lg bg-accent py-2 font-semibold text-white shadow-[0_8px_16px_-8px_rgba(88,71,157,0.6)] transition-colors hover:bg-accent-dim ${
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
          className="flex h-9 items-center justify-center rounded-lg text-[var(--rail-ink-dim)] hover:bg-[var(--rail-surface-2)] hover:text-[var(--rail-ink)]"
        >
          <SearchIcon />
        </button>
      ) : (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--rail-ink-dim)]" />
          <input
            type="search"
            placeholder="Buscar…"
            className="w-full rounded-lg border border-[var(--rail-bezel)] bg-[var(--rail-surface-2)] py-2 pl-9 pr-8 text-sm text-[var(--rail-ink)] outline-none placeholder:text-[var(--rail-ink-dim)] focus:border-accent"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[var(--rail-bezel)] px-1 font-display text-[10px] text-[var(--rail-ink-dim)]">
            /
          </kbd>
        </div>
      )}

      <nav className="flex flex-col gap-1">
        {!collapsed && (
          <p className="px-3 pb-1 font-display text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--rail-ink-dim)]">
            Principal
          </p>
        )}
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} count={myOpenCount} collapsed={collapsed} />
        ))}

        {/* Módulo 2: todos entran; el empleado ve los equipos que usa su área o tiene a cargo. */}
        <NavItem to="/activos" label="Activos y mantenimiento" icon={WrenchIcon} collapsed={collapsed} />
      </nav>

      {managesUsers && (
        <div className="flex flex-col gap-1">
          {!collapsed && (
            <div className="flex items-center gap-2 px-3 py-1 font-display text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--rail-ink-dim)]">
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
                  active ? "bg-accent/15 font-medium text-[var(--rail-ink)]" : "text-[var(--rail-ink-dim)] hover:bg-[var(--rail-surface-2)] hover:text-[var(--rail-ink)]"
                }`
              }
            >
              {collapsed ? item.label.slice(0, 1) : item.label}
            </NavLink>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1 border-t border-[var(--rail-bezel)] pt-3">
        <NavLink
          to="/perfil"
          title={collapsed ? "Administrar perfil" : undefined}
          className={({ isActive: active }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              collapsed ? "justify-center" : ""
            } ${active ? "bg-accent/15 text-[var(--rail-ink)]" : "text-[var(--rail-ink-dim)] hover:bg-[var(--rail-surface-2)] hover:text-[var(--rail-ink)]"}`
          }
        >
          <UserIcon />
          {!collapsed && "Administrar perfil"}
        </NavLink>
        {/* Configuración la llevan el administrador y RRHH; quien no puede
            entrar ni siquiera ve la opción, porque pulsarla solo le daría un 403. */}
        {managesSettings && (
          <NavLink
            to="/administracion/configuracion"
            title={collapsed ? "Configuración" : undefined}
            className={({ isActive: active }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                collapsed ? "justify-center" : ""
              } ${active ? "bg-accent/15 text-[var(--rail-ink)]" : "text-[var(--rail-ink-dim)] hover:bg-[var(--rail-surface-2)] hover:text-[var(--rail-ink)]"}`
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
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--rail-ink-dim)] transition-colors hover:bg-red/10 hover:text-red ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOutIcon />
          {!collapsed && "Cerrar sesión"}
        </button>
      </div>
    </div>
  );
}
