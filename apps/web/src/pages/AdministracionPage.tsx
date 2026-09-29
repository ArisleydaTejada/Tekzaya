import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { CheckIcon, PlusIcon } from "../components/icons";
import { AREAS, USERS } from "../data/mock";

const TABS = [
  { id: "usuarios", label: "Usuarios" },
  { id: "areas", label: "Áreas y categorías" },
  { id: "configuracion", label: "Configuración" },
];

const ROLE_LABEL: Record<string, string> = {
  employee: "Empleado",
  area_supervisor: "Supervisor de área",
  hr_supervisor: "Supervisor de RRHH",
  admin: "Administrador",
};

export default function AdministracionPage() {
  const { tab = "usuarios" } = useParams();
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title="Administración" subtitle="Usuarios, áreas y configuración del sistema." />
      <div className="mb-5 flex gap-1 border-b border-[var(--content-border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`/administracion/${t.id}`)}
            className={`relative px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id ? "text-accent" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
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

function UsuariosTab() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revealedLink, setRevealedLink] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
        >
          <PlusIcon className="h-3.5 w-3.5" /> Invitar
        </button>
      </div>
      <Plate className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
              <th className="px-3 py-2.5 font-medium">Nombre</th>
              <th className="px-3 py-2.5 font-medium">Área</th>
              <th className="px-3 py-2.5 font-medium">Rol</th>
              <th className="px-3 py-2.5 font-medium">Supervisor</th>
              <th className="px-3 py-2.5 font-medium">Acceso global</th>
              <th className="px-3 py-2.5 font-medium">Estado</th>
              <th className="px-3 py-2.5 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {USERS.map((u) => (
              <tr key={u.id} className="border-b border-[var(--content-border)] last:border-0">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.name} initials={u.initials} size="sm" />
                    <div>
                      <p className="text-[var(--content-ink)]">{u.name}</p>
                      <p className="text-xs text-[var(--content-ink-dim)]">{u.name.toLowerCase().replace(" ", ".")}@tekzaya.com</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[var(--content-ink-dim)]">{AREAS.find((a) => a.id === u.areaId)?.name}</td>
                <td className="px-3 py-2.5 text-[var(--content-ink-dim)]">{ROLE_LABEL[u.role]}</td>
                <td className="px-3 py-2.5">{u.role === "area_supervisor" ? <CheckIcon className="text-green" /> : "—"}</td>
                <td className="px-3 py-2.5">{u.role === "admin" || u.role === "hr_supervisor" ? <CheckIcon className="text-green" /> : "—"}</td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full bg-[var(--content-bg)] px-2 py-0.5 text-xs text-[var(--content-ink-dim)]">Activo</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button className="text-accent hover:underline">Editar</button>
                    <button className="text-[var(--content-ink-dim)] hover:underline">Desactivar</button>
                    <button onClick={() => setRevealedLink(u.id)} className="text-[var(--content-ink-dim)] hover:underline">
                      Restablecer contraseña
                    </button>
                  </div>
                  {revealedLink === u.id && (
                    <p className="mt-1 truncate rounded bg-[var(--content-bg)] px-2 py-1 font-display text-[10px] tabular text-[var(--content-ink-dim)]">
                      tekzaya.app/reset/{u.id}-8f2a1c
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Plate>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invitar usuario"
        footer={
          <>
            <button onClick={() => setInviteOpen(false)} className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]">
              Cancelar
            </button>
            <button onClick={() => setInviteOpen(false)} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">
              Generar enlace de invitación
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nombre completo" placeholder="Ej. Rosa Delgado" />
          <Field label="Correo" placeholder="rosa.delgado@empresa.com" type="email" />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">Área</label>
            <select className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]">
              {AREAS.map((a) => (
                <option key={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">Rol</label>
            <select className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]">
              <option>Empleado</option>
              <option>Supervisor de área</option>
              <option>Supervisor de RRHH</option>
              <option>Administrador</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AreasTab() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {AREAS.map((a) => {
        const supervisors = USERS.filter((u) => u.areaId === a.id && (u.role === "area_supervisor" || u.role === "admin"));
        return (
          <Plate key={a.id} className="p-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: a.color }} />
              <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">{a.name}</h3>
            </div>
            <p className="mt-1 text-xs text-[var(--content-ink-dim)]">
              Supervisores: {supervisors.map((s) => s.name).join(", ") || "sin asignar"}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.categories.map((c) => (
                <span key={c} className="rounded-full border border-[var(--content-border)] px-2 py-0.5 text-xs text-[var(--content-ink-dim)]">
                  {c}
                </span>
              ))}
              <button className="flex items-center gap-1 rounded-full border border-dashed border-[var(--content-border)] px-2 py-0.5 text-xs text-accent">
                <PlusIcon className="h-3 w-3" /> Categoría
              </button>
            </div>
          </Plate>
        );
      })}
    </div>
  );
}

function ConfiguracionTab() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Plate className="space-y-3 p-4">
        <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">SLA por prioridad (horas)</h3>
        {[
          { label: "Urgente", first: "0.25", res: "4" },
          { label: "Alta", first: "1", res: "8" },
          { label: "Media", first: "4", res: "24" },
          { label: "Baja", first: "8", res: "72" },
        ].map((p) => (
          <div key={p.label} className="flex items-center gap-3 text-sm">
            <span className="w-16 text-[var(--content-ink-dim)]">{p.label}</span>
            <input defaultValue={p.first} className="w-20 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1.5 text-[var(--content-ink)]" />
            <span className="text-xs text-[var(--content-ink-dim)]">1.ª resp.</span>
            <input defaultValue={p.res} className="w-20 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1.5 text-[var(--content-ink)]" />
            <span className="text-xs text-[var(--content-ink-dim)]">resolución</span>
          </div>
        ))}
      </Plate>

      <Plate className="space-y-3 p-4">
        <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">General</h3>
        <Field label="Horario laboral" defaultValue="L–V, 08:00–18:00" />
        <Field label="Cierre automático de resueltos (días hábiles)" defaultValue="3" />
        <Field label="Dominio corporativo para Google" defaultValue="@tekzaya.com" />
        <Field label="Reportes guardados máx. por usuario" defaultValue="20" />
        <Field label="Gráficas máx. por reporte" defaultValue="12" />
        <label className="flex items-center justify-between text-sm text-[var(--content-ink)]">
          Funciones de IA activas
          <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
        </label>
      </Plate>

      <div className="lg:col-span-2">
        <button
          onClick={() => setSaved(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim"
        >
          Guardar cambios
        </button>
        {saved && <span className="ml-3 text-xs text-green">Cambios guardados.</span>}
      </div>
    </div>
  );
}

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">{label}</label>
      <input
        {...rest}
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      />
    </div>
  );
}
