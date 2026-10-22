import {
  PRIORITIES,
  PRIORITY_LABEL,
  canGrantPrivileges,
  canManageSettings,
  roleLabelOf,
  type AccessLink,
  type AdminArea,
  type AdminUser,
  type Area,
  type Settings,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useId, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "../components/Avatar";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { DropdownMenu, type DropdownItem } from "../components/DropdownMenu";
import { CheckIcon, KeyIcon, MailIcon, PencilIcon, PlusIcon, PowerIcon } from "../components/icons";
import {
  addCategory,
  adminKeys,
  createAccessLink,
  createArea,
  inviteUser,
  listAdminAreas,
  listUsers,
  setSupervisors as saveSupervisors,
  updateArea,
  updateCategory,
  updateUser,
} from "../api/admin";
import {
  areaKeys,
  getSettings,
  listAreaMembers,
  listAreas,
  settingsKey,
  updateSettings,
} from "../api/tickets";
import { formatDateTime, formatWhen } from "../lib/format";

const TABS = [
  { id: "usuarios", label: "Usuarios", access: "users" },
  { id: "areas", label: "Áreas y categorías", access: "admin" },
  { id: "configuracion", label: "Configuración", access: "settings" },
] as const;

/**
 * `tab` lo fija la ruta cuando la pestaña tiene su propia guarda (Configuración),
 * porque esa ruta no lleva el parámetro `:tab`.
 */
export default function AdministracionPage({ tab: fixedTab }: { tab?: string }) {
  const { tab: tabParam } = useParams();
  const tab = fixedTab ?? tabParam ?? "usuarios";
  const navigate = useNavigate();
  const { me } = useAuth();

  // RRHH entra a Usuarios y Configuración, así que no ve pestañas que no puede abrir.
  const isAdmin = me?.role === "admin";
  const managesSettings = Boolean(me && canManageSettings(me));
  const tabs = TABS.filter(
    (item) => item.access === "users" || isAdmin || (item.access === "settings" && managesSettings),
  );

  return (
    <div>
      <PageHeader
        title="Administración"
        subtitle={
          isAdmin
            ? "Usuarios, áreas y configuración del sistema."
            : "Altas, bajas, datos del personal y reglas de la jornada."
        }
      />
      <div className="mb-5 flex gap-1 border-b border-[var(--content-border)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`/administracion/${t.id}`)}
            className={`relative px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id ? "text-accent-ink" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "usuarios" && <UsuariosTab />}
      {tab === "areas" && <AreasTab />}
      {tab === "configuracion" && <ConfiguracionTab />}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  invited: "Invitado",
  disabled: "Desactivado",
};

// ── Orden de la tabla de personas ─────────────────────────────

type UserColumn = "name" | "area" | "role" | "openTickets" | "status" | "lastLoginAt";

/**
 * El valor por el que se compara cada columna. El rol y el estado se ordenan por
 * jerarquía y no por su texto: alfabéticamente, "Activo" iría antes que
 * "Invitado" por casualidad, y "Administrador" antes que "Empleado" también.
 */
const USER_SORT_KEY: Record<UserColumn, (user: AdminUser) => string | number> = {
  name: (user) => user.name.toLowerCase(),
  area: (user) => user.areaName.toLowerCase(),
  role: (user) => (user.role === "admin" ? 0 : user.hasGlobalReadAccess ? 1 : user.isAreaSupervisor ? 2 : 3),
  openTickets: (user) => user.openTickets,
  status: (user) => ["active", "invited", "disabled"].indexOf(user.status),
  // Quien nunca entró va al final en ascendente, que es donde se le busca.
  lastLoginAt: (user) => (user.lastLoginAt ? Date.parse(user.lastLoginAt) : Number.MAX_SAFE_INTEGER),
};

function sortUsers(users: AdminUser[], column: UserColumn, dir: "asc" | "desc"): AdminUser[] {
  const key = USER_SORT_KEY[column];
  const sign = dir === "asc" ? 1 : -1;
  return [...users].sort((a, b) => {
    const left = key(a);
    const right = key(b);
    if (left === right) return a.name.localeCompare(b.name);
    return left < right ? -sign : sign;
  });
}

function SortableTh({
  label,
  column,
  sort,
  dir,
  onSort,
}: {
  label: string;
  column: UserColumn;
  sort: UserColumn;
  dir: "asc" | "desc";
  onSort: (column: UserColumn) => void;
}) {
  const active = sort === column;
  return (
    <th
      className="px-3 py-2.5 font-medium"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => onSort(column)}
        className={`flex items-center gap-1 whitespace-nowrap hover:text-[var(--content-ink)] ${
          active ? "text-[var(--content-ink)]" : ""
        }`}
      >
        {label}
        <span aria-hidden="true" className={active ? "" : "opacity-0"}>
          {dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}

/**
 * Reutiliza los tokens de los estados de ticket: activo en verde, invitado en
 * naranja (falta que la persona entre) y desactivado en gris.
 */
const STATUS_TOKEN: Record<string, string> = {
  active: "resolved",
  invited: "in_progress",
  disabled: "closed",
};

function UserStatusBadge({ status }: { status: string }) {
  const key = STATUS_TOKEN[status] ?? "closed";
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{
        background: `var(--st-${key}-bg)`,
        color: `var(--st-${key}-ink)`,
        borderColor: `var(--st-${key}-border)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

type IssuedLink = { kind: "invite" | "recovery"; name: string; link: AccessLink };

/** El enlace existe una sola vez: si se cierra sin copiarlo, hay que generar otro. */
function AccessLinkModal({ issued, onClose }: { issued: IssuedLink | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Modal
      open={Boolean(issued)}
      onClose={close}
      title={issued?.kind === "invite" ? "Enlace de invitación" : "Enlace de recuperación"}
      footer={
        <button
          onClick={close}
          className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
        >
          Cerrar
        </button>
      }
    >
      {issued && (
        <div>
          <p className="mb-2 text-sm text-[var(--content-ink)]">
            {issued.kind === "invite"
              ? `Comparte este enlace con ${issued.name} para que active su cuenta y elija su contraseña.`
              : `Comparte este enlace con ${issued.name} para que elija una contraseña nueva.`}
          </p>
          <p className="mb-3 text-xs text-[var(--content-ink-dim)]">
            No se envía correo y no se puede volver a consultar: si cierras sin copiarlo, genera otro.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={issued.link.url}
              onFocus={(event) => event.target.select()}
              aria-label="Enlace"
              className="min-w-0 flex-1 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2.5 py-2 font-display text-xs text-[var(--content-ink)]"
            />
            <button
              onClick={() => {
                void navigator.clipboard.writeText(issued.link.url).then(() => setCopied(true));
              }}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white"
            >
              {copied && <CheckIcon className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--content-ink-dim)]">
            Caduca el {formatDateTime(issued.link.expiresAt)}
          </p>
        </div>
      )}
    </Modal>
  );
}

function UsuariosTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = { q: search.trim(), status: statusFilter };
  const { data: rows = [], isLoading } = useQuery({
    queryKey: adminKeys.users(query),
    queryFn: () => listUsers(query),
    placeholderData: (previous) => previous,
  });

  /*
   * Aquí sí se ordena en el navegador, al revés que en la lista de tickets: esta
   * consulta trae todas las personas de una vez, así que lo que hay en memoria
   * es la tabla entera y no una página suelta.
   */
  const [sort, setSort] = useState<UserColumn>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const users = useMemo(() => sortUsers(rows, sort, dir), [rows, sort, dir]);

  function sortBy(column: UserColumn) {
    if (sort === column) setDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(column);
      setDir("asc");
    }
  }
  const { data: areas = [] } = useQuery({ queryKey: areaKeys.all, queryFn: listAreas });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });

  const accessLinkMutation = useMutation({
    mutationFn: (user: AdminUser) => createAccessLink(user.id),
    onSuccess: (result, user) => {
      setError(null);
      setIssued({ kind: user.status === "invited" ? "invite" : "recovery", name: user.name, link: result });
    },
    onError: (cause) => setError(cause.message),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "disabled" }) =>
      updateUser(id, { status }),
    onSuccess: async (result) => {
      setError(null);
      setNotice(
        result.releasedTickets > 0
          ? `Se liberaron ${result.releasedTickets} tickets; los que se quedaron sin responsable volvieron a Abierto.`
          : null,
      );
      await refresh();
    },
    onError: (cause) => setError(cause.message),
  });

  function userActions(user: AdminUser): DropdownItem[] {
    const items: DropdownItem[] = [
      { label: "Editar", icon: <PencilIcon className="h-4 w-4" />, onSelect: () => setEditing(user) },
    ];
    if (user.status !== "disabled") {
      items.push({
        label: user.status === "invited" ? "Reenviar invitación" : "Restablecer contraseña",
        icon:
          user.status === "invited" ? <MailIcon className="h-4 w-4" /> : <KeyIcon className="h-4 w-4" />,
        onSelect: () => accessLinkMutation.mutate(user),
      });
    }
    items.push(
      user.status === "disabled"
        ? {
            label: "Reactivar",
            icon: <PowerIcon className="h-4 w-4" />,
            onSelect: () => toggleStatus.mutate({ id: user.id, status: "active" }),
          }
        : {
            label: "Desactivar",
            icon: <PowerIcon className="h-4 w-4" />,
            danger: true,
            onSelect: () => toggleStatus.mutate({ id: user.id, status: "disabled" }),
          },
    );
    return items;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre o correo…"
          className="min-w-[200px] flex-1 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filtrar por estado"
          className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-2 text-sm text-[var(--content-ink)]"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="invited">Invitados</option>
          <option value="disabled">Desactivados</option>
        </select>
        <button
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
        >
          <PlusIcon className="h-3.5 w-3.5" /> Invitar
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          {notice}
        </p>
      )}

      <Plate className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
              <SortableTh label="Nombre" column="name" sort={sort} dir={dir} onSort={sortBy} />
              <SortableTh label="Área" column="area" sort={sort} dir={dir} onSort={sortBy} />
              <SortableTh label="Rol" column="role" sort={sort} dir={dir} onSort={sortBy} />
              <SortableTh label="Abiertos" column="openTickets" sort={sort} dir={dir} onSort={sortBy} />
              <SortableTh label="Estado" column="status" sort={sort} dir={dir} onSort={sortBy} />
              <SortableTh
                label="Último acceso"
                column="lastLoginAt"
                sort={sort}
                dir={dir}
                onSort={sortBy}
              />
              <th className="w-16 px-3 py-2.5 text-right font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-[var(--content-border)] align-middle last:border-0">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                    <div>
                      <p className="text-[var(--content-ink)]">{user.name}</p>
                      <p className="text-xs text-[var(--content-ink-dim)]">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[var(--content-ink-dim)]">{user.areaName}</td>
                <td className="px-3 py-2.5 text-[var(--content-ink-dim)]">{roleLabelOf(user)}</td>
                <td className="px-3 py-2.5 tabular text-[var(--content-ink-dim)]">
                  {user.openTickets}
                </td>
                <td className="px-3 py-2.5">
                  <UserStatusBadge status={user.status} />
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--content-ink-dim)]">
                  {user.lastLoginAt ? formatWhen(user.lastLoginAt) : "Nunca"}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <DropdownMenu label={`Acciones para ${user.name}`} items={userActions(user)} />
                </td>
              </tr>
            ))}
            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-[var(--content-ink-dim)]">
                  Nadie coincide con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Plate>

      <InviteModal
        open={inviteOpen}
        areas={areas}
        onClose={() => setInviteOpen(false)}
        onInvited={async (result) => {
          setIssued({ kind: "invite", name: result.user.name, link: result.link });
          await refresh();
        }}
      />

      <AccessLinkModal issued={issued} onClose={() => setIssued(null)} />

      {editing && (
        <EditUserModal
          user={editing}
          areas={areas}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function InviteModal({
  open,
  areas,
  onClose,
  onInvited,
}: {
  open: boolean;
  areas: Area[];
  onClose: () => void;
  onInvited: (result: { user: AdminUser; link: AccessLink }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [areaId, setAreaId] = useState("");
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [isAreaSupervisor, setIsAreaSupervisor] = useState(false);
  const [hasGlobalReadAccess, setHasGlobalReadAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      inviteUser({ name, email, areaId, role, isAreaSupervisor, hasGlobalReadAccess }),
    onSuccess: async (result) => {
      await onInvited(result);
      setName("");
      setEmail("");
      setAreaId("");
      onClose();
    },
    onError: (cause) => setError(cause.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invitar a alguien"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => invite.mutate()}
            disabled={name.length < 2 || !email.includes("@") || !areaId || invite.isPending}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Generar enlace de invitación
          </button>
        </>
      }
    >
      {error && <p className="mb-2 text-sm text-red">{error}</p>}
      <div className="space-y-3">
        <Field
          label="Nombre completo"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ej. Rosa Delgado"
        />
        <Field
          label="Correo"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="rosa.delgado@empresa.com"
        />
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
            Área
          </label>
          <select
            value={areaId}
            onChange={(event) => setAreaId(event.target.value)}
            className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]"
          >
            <option value="">Selecciona un área</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </div>
        <RolePicker
          role={role}
          isAreaSupervisor={isAreaSupervisor}
          hasGlobalReadAccess={hasGlobalReadAccess}
          onChange={(next) => {
            setRole(next.role);
            setIsAreaSupervisor(next.isAreaSupervisor);
            setHasGlobalReadAccess(next.hasGlobalReadAccess);
          }}
        />
        <p className="text-xs text-[var(--content-ink-dim)]">
          La persona elige su contraseña al abrir el enlace. Tú nunca la conoces.
        </p>
      </div>
    </Modal>
  );
}

function EditUserModal({
  user,
  areas,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  areas: Area[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = useState(user.name);
  const [areaId, setAreaId] = useState(user.areaId);
  const [role, setRole] = useState(user.role);
  const [isAreaSupervisor, setIsAreaSupervisor] = useState(user.isAreaSupervisor);
  const [hasGlobalReadAccess, setHasGlobalReadAccess] = useState(user.hasGlobalReadAccess);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      updateUser(user.id, { name, areaId, role, isAreaSupervisor, hasGlobalReadAccess }),
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
    onError: (cause) => setError(cause.message),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Editar a ${user.name}`}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Guardar
          </button>
        </>
      }
    >
      {error && <p className="mb-2 text-sm text-red">{error}</p>}
      <div className="space-y-3">
        <Field label="Nombre" value={name} onChange={(event) => setName(event.target.value)} />
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
            Área
          </label>
          <select
            value={areaId}
            onChange={(event) => setAreaId(event.target.value)}
            className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]"
          >
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
          {areaId !== user.areaId && (
            <p className="mt-1.5 text-xs text-amber">
              Al cambiar de área dejará de supervisar la anterior.
            </p>
          )}
        </div>
        <RolePicker
          role={role}
          isAreaSupervisor={isAreaSupervisor}
          hasGlobalReadAccess={hasGlobalReadAccess}
          onChange={(next) => {
            setRole(next.role);
            setIsAreaSupervisor(next.isAreaSupervisor);
            setHasGlobalReadAccess(next.hasGlobalReadAccess);
          }}
        />
        <p className="text-xs text-[var(--content-ink-dim)]">
          {user.openTickets > 0
            ? `Tiene ${user.openTickets} tickets abiertos.`
            : "No tiene tickets abiertos."}
        </p>
      </div>
    </Modal>
  );
}

/**
 * El rol efectivo es rol base + banderas (spec §4.2). Se presenta como una sola
 * lista porque "supervisor de RRHH" no es un rol aparte, es un empleado con
 * lectura global, y pedirle al administrador que lo componga a mano es pedirle
 * que se equivoque.
 */
function RolePicker({
  role,
  isAreaSupervisor,
  hasGlobalReadAccess,
  onChange,
}: {
  role: "employee" | "admin";
  isAreaSupervisor: boolean;
  hasGlobalReadAccess: boolean;
  onChange: (next: {
    role: "employee" | "admin";
    isAreaSupervisor: boolean;
    hasGlobalReadAccess: boolean;
  }) => void;
}) {
  const { me } = useAuth();
  // RRHH lleva las altas y bajas, pero no reparte privilegios: si pudiera dar el
  // rol de administrador o la lectura global, podría nombrarse a sí misma y el
  // límite dejaría de existir. El servidor rechaza el intento igualmente.
  const mayGrant = Boolean(me && canGrantPrivileges(me));
  const current =
    role === "admin"
      ? "admin"
      : hasGlobalReadAccess
        ? "hr"
        : isAreaSupervisor
          ? "supervisor"
          : "employee";

  const options = {
    employee: { role: "employee" as const, isAreaSupervisor: false, hasGlobalReadAccess: false },
    supervisor: { role: "employee" as const, isAreaSupervisor: true, hasGlobalReadAccess: false },
    hr: { role: "employee" as const, isAreaSupervisor: true, hasGlobalReadAccess: true },
    admin: { role: "admin" as const, isAreaSupervisor: false, hasGlobalReadAccess: false },
  };

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">Rol</label>
      <select
        value={current}
        onChange={(event) => onChange(options[event.target.value as keyof typeof options])}
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]"
      >
        <option value="employee">Empleado</option>
        <option value="supervisor">Supervisor de área</option>
        <option value="hr" disabled={!mayGrant && current !== "hr"}>
          Supervisor de RRHH (lectura global)
        </option>
        <option value="admin" disabled={!mayGrant && current !== "admin"}>
          Administrador
        </option>
      </select>
      {!mayGrant && (
        <p className="mt-1.5 text-xs text-[var(--content-ink-dim)]">
          Nombrar administradores o conceder la lectura global es cosa del administrador.
        </p>
      )}
    </div>
  );
}

function AreasTab() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminArea | null>(null);

  const { data: areas = [], isLoading } = useQuery({
    queryKey: adminKeys.areas,
    queryFn: listAdminAreas,
  });

  const apply = (items: AdminArea[]) => {
    setError(null);
    queryClient.setQueryData(adminKeys.areas, items);
    void queryClient.invalidateQueries({ queryKey: areaKeys.all });
  };
  const fail = (cause: Error) => setError(cause.message);

  const toggleArea = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateArea(id, { isActive }),
    onSuccess: apply,
    onError: fail,
  });

  const addCategoryMutation = useMutation({
    mutationFn: ({ areaId, name }: { areaId: string; name: string }) =>
      addCategory(areaId, { name }),
    onSuccess: apply,
    onError: fail,
  });

  const toggleCategory = useMutation({
    mutationFn: ({
      areaId,
      categoryId,
      isActive,
    }: {
      areaId: string;
      categoryId: string;
      isActive: boolean;
    }) => updateCategory(areaId, categoryId, { isActive }),
    onSuccess: apply,
    onError: fail,
  });

  if (isLoading) {
    return (
      <Plate className="flex items-center justify-center py-16">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent"
          aria-label="Cargando áreas"
        />
      </Plate>
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
        >
          <PlusIcon className="h-3.5 w-3.5" /> Nueva área
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {areas.map((area) => (
          <Plate key={area.id} className={`p-4 ${area.isActive ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: area.color }}
                  aria-hidden="true"
                />
                <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
                  {area.name}
                </h3>
                {!area.isActive && (
                  <span className="rounded-full bg-[var(--content-bg)] px-2 py-0.5 text-[10px] text-[var(--content-ink-dim)]">
                    Desactivada
                  </span>
                )}
              </div>
              <div className="flex shrink-0 gap-2 text-xs">
                <button onClick={() => setEditing(area)} className="text-accent-ink hover:underline">
                  Editar
                </button>
                <button
                  onClick={() => toggleArea.mutate({ id: area.id, isActive: !area.isActive })}
                  className="text-[var(--content-ink-dim)] hover:underline"
                >
                  {area.isActive ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>

            {area.description && (
              <p className="mt-1 text-xs text-[var(--content-ink-dim)]">{area.description}</p>
            )}

            <p className="mt-2 text-xs text-[var(--content-ink-dim)]">
              Supervisores:{" "}
              {area.supervisors.length
                ? area.supervisors.map((person) => person.name).join(", ")
                : "sin asignar"}
            </p>
            <p className="text-xs text-[var(--content-ink-dim)]">
              {area.memberCount} personas · {area.activeTickets} tickets sin cerrar
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {area.categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() =>
                    toggleCategory.mutate({
                      areaId: area.id,
                      categoryId: category.id,
                      isActive: !category.isActive,
                    })
                  }
                  title={
                    category.isActive
                      ? "Desactivar: deja de ofrecerse en tickets nuevos"
                      : "Volver a activar"
                  }
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    category.isActive
                      ? "border-[var(--content-border)] text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                      : "border-dashed border-[var(--content-border)] text-[var(--content-ink-dim)]/50 line-through"
                  }`}
                >
                  {category.name}
                </button>
              ))}
              <NewCategoryButton
                onCreate={(name) => addCategoryMutation.mutate({ areaId: area.id, name })}
              />
            </div>
          </Plate>
        ))}
      </div>

      {creating && (
        <AreaModal onClose={() => setCreating(false)} onSaved={apply} onError={fail} />
      )}
      {editing && (
        <AreaModal
          area={editing}
          onClose={() => setEditing(null)}
          onSaved={apply}
          onError={fail}
        />
      )}
    </div>
  );
}

function NewCategoryButton({ onCreate }: { onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-full border border-dashed border-[var(--content-border)] px-2 py-0.5 text-xs text-accent-ink"
      >
        <PlusIcon className="h-3 w-3" /> Categoría
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim().length >= 2) onCreate(name.trim());
        setName("");
        setOpen(false);
      }}
      className="flex gap-1"
    >
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => !name && setOpen(false)}
        placeholder="Nombre"
        aria-label="Nombre de la categoría"
        className="w-28 rounded-full border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-0.5 text-xs text-[var(--content-ink)] outline-none focus:border-accent"
      />
      <button type="submit" className="text-xs font-medium text-accent-ink">
        Añadir
      </button>
    </form>
  );
}

function AreaModal({
  area,
  onClose,
  onSaved,
  onError,
}: {
  area?: AdminArea;
  onClose: () => void;
  onSaved: (items: AdminArea[]) => void;
  onError: (cause: Error) => void;
}) {
  const [name, setName] = useState(area?.name ?? "");
  const [description, setDescription] = useState(area?.description ?? "");
  const [color, setColor] = useState(area?.color ?? "#7c8cae");
  const [supervisors, setSupervisors] = useState<string[]>(
    area?.supervisors.map((person) => person.id) ?? [],
  );

  const { data: members = [] } = useQuery({
    queryKey: areaKeys.members(area?.id ?? ""),
    queryFn: () => listAreaMembers(area!.id),
    enabled: Boolean(area),
  });

  const save = useMutation({
    mutationFn: async () => {
      const items = area
        ? await updateArea(area.id, { name, description, color })
        : await createArea({ name, description, color, categories: [] });
      // Los supervisores se guardan aparte porque tocan la tabla de personas.
      return area ? await saveSupervisors(area.id, { userIds: supervisors }) : items;
    },
    onSuccess: (items) => {
      onSaved(items);
      onClose();
    },
    onError: (cause) => onError(cause as Error),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={area ? `Editar ${area.name}` : "Nueva área"}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={name.trim().length < 2 || save.isPending}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nombre" value={name} onChange={(event) => setName(event.target.value)} />
        <Field
          label="Descripción"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Para qué sirve el área"
        />
        <div>
          <label
            htmlFor="color"
            className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]"
          >
            Color de la etiqueta
          </label>
          <div className="flex items-center gap-2">
            <input
              id="color"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)]"
            />
            <span className="font-display text-xs tabular text-[var(--content-ink-dim)]">
              {color}
            </span>
          </div>
        </div>

        {area && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
              Supervisores del área
            </label>
            {members.length === 0 ? (
              <p className="text-xs text-[var(--content-ink-dim)]">
                El área todavía no tiene personas activas.
              </p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {members.map((member) => (
                  <li key={member.id}>
                    <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--content-ink)] hover:bg-[var(--content-bg)]">
                      <input
                        type="checkbox"
                        checked={supervisors.includes(member.id)}
                        onChange={(event) =>
                          setSupervisors((current) =>
                            event.target.checked
                              ? [...current, member.id]
                              : current.filter((id) => id !== member.id),
                          )
                        }
                        className="h-4 w-4 accent-accent"
                      />
                      {member.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

const DAY_LABEL: Record<number, string> = {
  1: "L",
  2: "M",
  3: "X",
  4: "J",
  5: "V",
  6: "S",
  7: "D",
};

const AI_LABEL: Record<keyof Settings["aiEnabled"], string> = {
  suggestArea: "Sugerir área al crear un ticket",
  classify: "Clasificar prioridad y categoría",
  summary: "Resumir la conversación",
  autocomplete: "Autocompletar respuestas",
  detectIncidents: "Detectar incidentes",
  replacementAdvice: "Sugerir reparar o reemplazar un equipo",
  repairEstimate: "Estimar el costo de una reparación",
};

/** Los plazos se guardan en minutos y se editan en horas: nadie piensa en 1440. */
const toHours = (minutes: number): string => String(Math.round((minutes / 60) * 100) / 100);
const toMinutes = (hours: string): number => Math.max(1, Math.round(Number(hours) * 60));

function ConfiguracionTab() {
  const queryClient = useQueryClient();
  const { me } = useAuth();
  // RRHH entra a Configuración, pero la IA y los límites de Reportes siguen siendo
  // del administrador: ni se le muestran ni viajan en lo que guarda.
  const isAdmin = me?.role === "admin";
  const { data: settings, isLoading } = useQuery({ queryKey: settingsKey, queryFn: getSettings });
  const [draft, setDraft] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newHoliday, setNewHoliday] = useState("");

  // El borrador arranca del servidor y solo se reemplaza cuando llega otro
  // distinto, para no pisar lo que el administrador está escribiendo.
  const [loadedFrom, setLoadedFrom] = useState<Settings | null>(null);
  if (settings && settings !== loadedFrom) {
    setLoadedFrom(settings);
    setDraft(structuredClone(settings));
  }

  const save = useMutation({
    mutationFn: () => {
      const { aiEnabled, reportLimits, maintenance, ...rest } = draft!;
      return updateSettings(isAdmin ? { ...rest, aiEnabled, reportLimits, maintenance } : rest);
    },
    onSuccess: async (saved) => {
      setError(null);
      queryClient.setQueryData(settingsKey, saved);
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (cause) => setError(cause.message),
  });

  if (isLoading || !draft) {
    return (
      <Plate className="flex items-center justify-center py-16">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent"
          aria-label="Cargando configuración"
        />
      </Plate>
    );
  }

  const patch = (change: Partial<Settings>) => setDraft({ ...draft, ...change });
  // Cerrar antes de recordar dejaría al solicitante sin aviso previo.
  const onHoldProblem =
    draft.onHoldAutoCloseDays < draft.onHoldReminderDays
      ? "El cierre no puede llegar antes que el recordatorio."
      : null;

  return (
    // Seis columnas en escritorio para poder repartir 3 + 2 + 1 tarjetas por fila;
    // en tableta quedan de dos en dos y en el móvil, una debajo de otra.
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
      <Plate className="space-y-3 p-4 lg:col-span-2">
        <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
          SLA por prioridad (horas laborables)
        </h3>
        <div className="grid grid-cols-[4rem_1fr_1fr] items-center gap-x-2 gap-y-2 text-sm">
          <span />
          <span className="text-xs text-[var(--content-ink-dim)]">1.ª respuesta</span>
          <span className="text-xs text-[var(--content-ink-dim)]">Resolución</span>
          {PRIORITIES.map((priority) => {
            const policy = draft.slaPolicies[priority]!;
            return (
              <Fragment key={priority}>
                <span className="text-[var(--content-ink-dim)]">{PRIORITY_LABEL[priority]}</span>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={toHours(policy.responseMinutes)}
                  onChange={(event) =>
                    patch({
                      slaPolicies: {
                        ...draft.slaPolicies,
                        [priority]: {
                          ...policy,
                          responseMinutes: toMinutes(event.target.value),
                        },
                      },
                    })
                  }
                  aria-label={`Primera respuesta para prioridad ${PRIORITY_LABEL[priority]}`}
                  className="w-full min-w-0 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1.5 text-[var(--content-ink)]"
                />
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={toHours(policy.resolutionMinutes)}
                  onChange={(event) =>
                    patch({
                      slaPolicies: {
                        ...draft.slaPolicies,
                        [priority]: {
                          ...policy,
                          resolutionMinutes: toMinutes(event.target.value),
                        },
                      },
                    })
                  }
                  aria-label={`Resolución para prioridad ${PRIORITY_LABEL[priority]}`}
                  className="w-full min-w-0 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1.5 text-[var(--content-ink)]"
                />
              </Fragment>
            );
          })}
        </div>
        <p className="text-xs text-[var(--content-ink-dim)]">
          El cambio afecta a los tickets nuevos. Los que ya existen conservan el plazo con el que
          nacieron, para que una edición no los venza de golpe.
        </p>
      </Plate>

      <Plate className="space-y-3 p-4 lg:col-span-2">
        <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
          Jornada laboral
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => {
            const active = draft.businessHours.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  patch({
                    businessHours: {
                      ...draft.businessHours,
                      days: active
                        ? draft.businessHours.days.filter((value) => value !== day)
                        : [...draft.businessHours.days, day].sort((a, b) => a - b),
                    },
                  })
                }
                className={`h-8 w-8 rounded-lg border text-xs font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent text-white"
                    : "border-[var(--content-border)] text-[var(--content-ink-dim)]"
                }`}
              >
                {DAY_LABEL[day]}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="time"
            value={draft.businessHours.start}
            onChange={(event) =>
              patch({ businessHours: { ...draft.businessHours, start: event.target.value } })
            }
            aria-label="Hora de apertura"
            className="rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1.5 text-[var(--content-ink)]"
          />
          <span className="text-[var(--content-ink-dim)]">a</span>
          <input
            type="time"
            value={draft.businessHours.end}
            onChange={(event) =>
              patch({ businessHours: { ...draft.businessHours, end: event.target.value } })
            }
            aria-label="Hora de cierre"
            className="rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1.5 text-[var(--content-ink)]"
          />
        </div>
        <TimezoneSelect
          value={draft.businessHours.timezone}
          onChange={(timezone) => patch({ businessHours: { ...draft.businessHours, timezone } })}
        />
        <p className="text-xs text-[var(--content-ink-dim)]">
          Es la zona en la que corre el reloj del SLA, igual para todo el equipo. Cada persona ve
          las fechas en su propio reloj.
        </p>
      </Plate>

      <Plate className="space-y-3 p-4 md:col-span-2 lg:col-span-2">
        <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
          Días festivos
        </h3>
        <div className="flex gap-2">
          <input
            type="date"
            value={newHoliday}
            onChange={(event) => setNewHoliday(event.target.value)}
            aria-label="Nuevo día festivo"
            className="flex-1 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]"
          />
          <button
            type="button"
            disabled={!newHoliday || draft.holidays.includes(newHoliday)}
            onClick={() => {
              patch({ holidays: [...draft.holidays, newHoliday].sort() });
              setNewHoliday("");
            }}
            className="flex items-center gap-1 rounded-lg border border-[var(--content-border)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] disabled:opacity-40"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Añadir
          </button>
        </div>
        {draft.holidays.length === 0 ? (
          <p className="text-xs text-[var(--content-ink-dim)]">
            Sin festivos: el SLA solo salta los fines de semana.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {draft.holidays.map((holiday) => (
              <li
                key={holiday}
                className="flex items-center gap-1.5 rounded-full border border-[var(--content-border)] px-2.5 py-1 text-xs text-[var(--content-ink)]"
              >
                {holiday}
                <button
                  type="button"
                  onClick={() =>
                    patch({ holidays: draft.holidays.filter((value) => value !== holiday) })
                  }
                  aria-label={`Quitar ${holiday}`}
                  className="text-[var(--content-ink-dim)] hover:text-red"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Plate>

      {/* Sin la tarjeta de límites (RRHH), los cierres ocupan la fila entera. */}
      <Plate className={`space-y-3 p-4 ${isAdmin ? "lg:col-span-3" : "md:col-span-2 lg:col-span-6"}`}>
        <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
          Cierres automáticos (días hábiles)
        </h3>
        <Field
          label="Cerrar un ticket resuelto tras"
          type="number"
          min="1"
          value={String(draft.autoCloseResolvedDays)}
          onChange={(event) => patch({ autoCloseResolvedDays: Number(event.target.value) })}
        />
        <Field
          label="Recordar al solicitante en espera tras"
          type="number"
          min="1"
          value={String(draft.onHoldReminderDays)}
          onChange={(event) => patch({ onHoldReminderDays: Number(event.target.value) })}
        />
        <Field
          label="Cerrar un ticket en espera tras"
          type="number"
          min={String(draft.onHoldReminderDays)}
          value={String(draft.onHoldAutoCloseDays)}
          onChange={(event) => patch({ onHoldAutoCloseDays: Number(event.target.value) })}
          aria-invalid={onHoldProblem !== null}
        />
        {onHoldProblem && (
          <p role="alert" className="text-xs text-red">
            {onHoldProblem}
          </p>
        )}
      </Plate>

      {isAdmin && (
        <Plate className="space-y-3 p-4 lg:col-span-3">
          <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
            Límites de Reportes
          </h3>
          <p className="text-xs text-[var(--content-ink-dim)]">
            Cada persona guarda sus propios reportes; el límite evita que una biblioteca
            personal se vuelva ingobernable (spec §7.8.8).
          </p>
          <Field
            label="Reportes guardados por persona"
            type="number"
            min="1"
            value={String(draft.reportLimits.maxSavedReports)}
            onChange={(event) =>
              patch({
                reportLimits: {
                  ...draft.reportLimits,
                  maxSavedReports: Number(event.target.value),
                },
              })
            }
          />
          <Field
            label="Gráficas por reporte"
            type="number"
            min="1"
            value={String(draft.reportLimits.maxWidgetsPerReport)}
            onChange={(event) =>
              patch({
                reportLimits: {
                  ...draft.reportLimits,
                  maxWidgetsPerReport: Number(event.target.value),
                },
              })
            }
          />
        </Plate>
      )}

      {isAdmin && (
        <Plate className="space-y-2 p-4 md:col-span-2 lg:col-span-6">
          <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
            Funciones de inteligencia artificial
          </h3>
          <p className="mb-1 text-xs text-[var(--content-ink-dim)]">
            Apagarlas no rompe nada: el ticket se crea igual, con el área elegida a mano, y los equipos y las órdenes muestran sus números sin la tarjeta de IA.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {(Object.keys(AI_LABEL) as (keyof Settings["aiEnabled"])[]).map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)]"
              >
                <span id={`ia-${key}`}>{AI_LABEL[key]}</span>
                <Switch
                  labelledBy={`ia-${key}`}
                  checked={draft.aiEnabled[key]}
                  onChange={(checked) => patch({ aiEnabled: { ...draft.aiEnabled, [key]: checked } })}
                />
              </div>
            ))}
          </div>
        </Plate>
      )}

      <div className="flex flex-wrap items-center gap-3 md:col-span-2 lg:col-span-6">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || onHoldProblem !== null}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim disabled:opacity-60"
        >
          {save.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
        {save.isSuccess && !save.isPending && (
          <span className="flex items-center gap-1 text-xs text-green">
            <CheckIcon className="h-3.5 w-3.5" /> Cambios guardados.
          </span>
        )}
        {error && (
          <span role="alert" className="text-xs text-red">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

/** Interruptor accesible: un botón con `role="switch"`, que el lector anuncia como tal. */
function Switch({
  checked,
  onChange,
  labelledBy,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        checked ? "bg-accent" : "bg-[var(--content-border)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/** Respaldo para navegadores sin `Intl.supportedValuesOf`. */
const FALLBACK_TIMEZONES = [
  "America/La_Paz",
  "America/Lima",
  "America/Bogota",
  "America/Mexico_City",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "America/Caracas",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "UTC",
];

/** Desfase actual de una zona, como `UTC−04:00`; cambia con el horario de verano. */
function offsetOf(timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date())
      .find((item) => item.type === "timeZoneName")?.value;
    return !part || part === "GMT" ? "UTC+00:00" : part.replace("GMT", "UTC").replace("-", "−");
  } catch {
    return "";
  }
}

/**
 * Todas las zonas IANA que conoce el navegador, agrupadas por continente y con su
 * desfase, para elegir sin tener que escribir `America/La_Paz` de memoria.
 */
function TimezoneSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const groups = useMemo(() => {
    const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    const zones = supported ? supported("timeZone") : FALLBACK_TIMEZONES;
    // La guardada siempre está, aunque el navegador no la liste (p. ej. "UTC").
    const all = zones.includes(value) ? zones : [value, ...zones];
    const map = new Map<string, { zone: string; label: string }[]>();
    for (const zone of all) {
      const region = zone.includes("/") ? zone.split("/")[0]! : "Otras";
      const city = zone.includes("/") ? zone.slice(region.length + 1) : zone;
      const label = `${city.replace(/_/g, " ").replace(/\//g, " / ")} (${offsetOf(zone)})`;
      map.set(region, [...(map.get(region) ?? []), { zone, label }]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [value]);

  return (
    <div>
      <label
        htmlFor="zona-horaria"
        className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]"
      >
        Zona horaria de la empresa
      </label>
      <select
        id="zona-horaria"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      >
        {groups.map(([region, zones]) => (
          <optgroup key={region} label={region}>
            {zones.map((item) => (
              <option key={item.zone} value={item.zone}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function Field({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      />
    </div>
  );
}
