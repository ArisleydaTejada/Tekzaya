import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  ActivityIcon,
  BoxIcon,
  BuildingIcon,
  CalendarIcon,
  ChartIcon,
  ClipboardIcon,
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
import {
  ACTIVE_TICKET_STATUSES,
  canManageSettings,
  canManageUsers,
} from "@tekzaya/shared";
import { useQuery } from "@tanstack/react-query";
import { listTickets, ticketKeys } from "../../api/tickets";
import { listWorkOrders, workOrderKeys } from "../../api/workOrders";
import { useAuth } from "../../auth/AuthContext";
import { LogoLockup, LogoMark } from "../Logo";
import { Tooltip } from "../Tooltip";
import { SidebarSearch } from "./SidebarSearch";

const NAV_ITEMS = [
  { to: "/tablero", label: "Tablero", icon: GaugeNavIcon },
  {
    to: "/tickets",
    label: "Tickets",
    icon: TicketIcon,
    badge: true,
    countLabel: (n: number) => `${n} ${n === 1 ? "asignado a ti sin resolver" : "asignados a ti sin resolver"}`,
  },
  { to: "/reportes", label: "Reportes", icon: ChartIcon },
];

/**
 * RRHH lleva altas y bajas, pero las áreas definen cómo se enruta el trabajo
 * y son del administrador (spec §4.3).
 */
const ADMIN_ITEMS = [
  { to: "/administracion/usuarios", label: "Usuarios", icon: UsersIcon, adminOnly: false },
  { to: "/administracion/areas", label: "Áreas y categorías", icon: BuildingIcon, adminOnly: true },
];

/**
 * Configuración la llevan el administrador y RRHH; quien no puede entrar ni
 * siquiera ve la opción, porque pulsarla solo le daría un 403.
 */
const SETTINGS_ITEM = {
  to: "/administracion/configuracion",
  label: "Configuración",
  icon: SlidersIcon,
  adminOnly: false,
};

/**
 * Plegada, el logo es el botón que la abre y al pasar por encima muestra el icono del panel.
 * Abierta, va el logotipo completo y el icono de cerrar pasa al otro extremo.
 */
function SidebarHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  if (collapsed) {
    return (
      <Tooltip label="Abrir barra lateral">
        <button
          type="button"
          onClick={onToggle}
          disabled={!onToggle}
          aria-label="Abrir barra lateral"
          aria-expanded={false}
          className="group flex h-9 w-9 items-center justify-center rounded-lg text-[var(--rail-ink-dim)] transition-colors hover:bg-[var(--rail-surface-2)] hover:text-[var(--rail-ink)]"
        >
          <LogoMark className="h-6 w-6 object-contain group-hover:hidden group-focus-visible:hidden" />
          <PanelIcon className="hidden h-4 w-4 group-hover:block group-focus-visible:block" />
        </button>
      </Tooltip>
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

/**
 * OT abiertas de esta persona (`mine` ya excluye completadas y canceladas).
 * Solo se pide a quien ve las órdenes; al resto la API le daría 404.
 */
function useMyOpenWorkOrderCount(enabled: boolean): number {
  const query = { scope: "mine" as const, limit: 1 };

  const { data } = useQuery({
    queryKey: [...workOrderKeys.list(query), "count"],
    queryFn: () => listWorkOrders(query),
    staleTime: 30_000,
    enabled,
  });

  return data?.total ?? 0;
}

function NavItem({
  to,
  label,
  icon: Icon,
  badge,
  count,
  countLabel = (n: number) => `${n} pendientes`,
  collapsed,
}: {
  to: string;
  label: string;
  icon: typeof GaugeNavIcon;
  badge?: boolean;
  count?: number;
  /** Qué cuenta el número, para el lector de pantalla: solo, se leía "Tickets2". */
  countLabel?: (count: number) => string;
  collapsed: boolean;
}) {
  const activeCount = count ?? 0;

  return (
    <Tooltip label={collapsed ? label : null} className="flex flex-col">
      <NavLink
        to={to}
        // Plegada solo queda el icono: el nombre lo pone la etiqueta.
        aria-label={collapsed ? label : undefined}
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
                  <span
                    title={countLabel(activeCount)}
                    className="rounded-full bg-[var(--rail-surface-2)] px-1.5 py-0.5 font-display text-[10px] font-semibold tabular text-[var(--rail-ink-dim)]"
                  >
                    <span aria-hidden="true">{activeCount}</span>
                    <span className="sr-only">, {countLabel(activeCount)}</span>
                  </span>
                )}
              </>
            )}
          </>
        )}
      </NavLink>
    </Tooltip>
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
  // Las OT son del área que mantiene el equipo (plan A3): quien no mantiene nada
  // no ve la entrada, igual que Configuración.
  const seesWorkOrders = Boolean(me && (isAdmin || me.hasGlobalReadAccess || me.maintainsAssets));
  const myOpenOrders = useMyOpenWorkOrderCount(seesWorkOrders);
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-5">
      <div className={collapsed ? "flex justify-center" : ""}>
        <SidebarHeader collapsed={collapsed} {...(onToggle ? { onToggle } : {})} />
      </div>

      <Tooltip label={collapsed ? "Nuevo ticket" : null} className="flex flex-col">
        <Link
          to="/tickets/nuevo"
          aria-label={collapsed ? "Nuevo ticket" : undefined}
          className={`flex items-center justify-center gap-1.5 rounded-lg bg-accent py-2 font-semibold text-white shadow-[0_8px_16px_-8px_rgba(88,71,157,0.6)] transition-colors hover:bg-accent-dim ${
            collapsed ? "px-0 text-sm" : "px-3 text-sm"
          }`}
        >
          <PlusIcon className="h-4 w-4 shrink-0" />
          {!collapsed && "Nuevo ticket"}
        </Link>
      </Tooltip>

      {collapsed ? (
        <Tooltip label="Buscar" className="flex flex-col">
          <button
            onClick={() => navigate("/tickets")}
            aria-label="Buscar"
            className="flex h-9 items-center justify-center rounded-lg text-[var(--rail-ink-dim)] hover:bg-[var(--rail-surface-2)] hover:text-[var(--rail-ink)]"
          >
            <SearchIcon />
          </button>
        </Tooltip>
      ) : (
        <SidebarSearch seesWorkOrders={seesWorkOrders} />
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
      </nav>

      {/* El módulo 2 entero bajo un solo grupo: antes "Activos y mantenimiento" y
          "Panel de mantenimiento" parecían dos secciones distintas. */}
      <nav className="flex flex-col gap-1" aria-label="Mantenimiento">
        {!collapsed && (
          <p className="px-3 pb-1 font-display text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--rail-ink-dim)]">
            Mantenimiento
          </p>
        )}
        {/* El panel del módulo (plan A6), con el mismo criterio que las órdenes. */}
        {seesWorkOrders && <NavItem to="/mantenimiento" label="Panel" icon={ActivityIcon} collapsed={collapsed} />}
        {/* Todos entran; el empleado ve los equipos que usa su área o tiene a cargo. */}
        <NavItem to="/activos" label="Activos" icon={WrenchIcon} collapsed={collapsed} />
        {seesWorkOrders && (
          <NavItem
            to="/ordenes"
            label="Órdenes de trabajo"
            icon={ClipboardIcon}
            badge
            count={myOpenOrders}
            countLabel={(n) => `${n} ${n === 1 ? "orden abierta a tu cargo" : "órdenes abiertas a tu cargo"}`}
            collapsed={collapsed}
          />
        )}
        {/* El almacén es del área que mantiene equipos, igual que sus órdenes. */}
        {seesWorkOrders && <NavItem to="/repuestos" label="Repuestos" icon={BoxIcon} collapsed={collapsed} />}
        {/* Los planes preventivos también son del área que mantiene equipos (plan A5). */}
        {seesWorkOrders && <NavItem to="/preventivos" label="Preventivos" icon={CalendarIcon} collapsed={collapsed} />}
      </nav>

      {/* Administración vive en un solo sitio: usuarios, áreas y configuración juntos,
          en vez de repartir la configuración en el pie de la barra. */}
      {(managesUsers || managesSettings) && (
        <nav className="flex flex-col gap-1" aria-label="Administración">
          {!collapsed && (
            <p className="px-3 pb-1 font-display text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--rail-ink-dim)]">
              Administración
            </p>
          )}
          {[...(managesUsers ? ADMIN_ITEMS : []), ...(managesSettings ? [SETTINGS_ITEM] : [])].flatMap((item) =>
            isAdmin || !item.adminOnly
              ? [<NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} collapsed={collapsed} />]
              : [],
          )}
        </nav>
      )}

      <div className="mt-auto flex flex-col gap-1 border-t border-[var(--rail-bezel)] pt-3">
        <Tooltip label={collapsed ? "Administrar perfil" : null} className="flex flex-col">
          <NavLink
            to="/perfil"
            aria-label={collapsed ? "Administrar perfil" : undefined}
            className={({ isActive: active }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                collapsed ? "justify-center" : ""
              } ${active ? "bg-accent/15 text-[var(--rail-ink)]" : "text-[var(--rail-ink-dim)] hover:bg-[var(--rail-surface-2)] hover:text-[var(--rail-ink)]"}`
            }
          >
            <UserIcon />
            {!collapsed && "Administrar perfil"}
          </NavLink>
        </Tooltip>
        <Tooltip label={collapsed ? "Cerrar sesión" : null} className="flex flex-col">
          <button
            onClick={() => {
              logout();
              navigate("/", { replace: true });
            }}
            aria-label={collapsed ? "Cerrar sesión" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--rail-ink-dim)] transition-colors hover:bg-red/10 hover:text-red ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LogOutIcon />
            {!collapsed && "Cerrar sesión"}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
