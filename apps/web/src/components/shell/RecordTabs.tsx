import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../../auth/AuthContext";
import { PlusIcon, XIcon } from "../icons";
import { Tooltip } from "../Tooltip";

export interface PickerSlotProps {
  open: boolean;
  onClose: () => void;
  /** Números ya abiertos como pestaña, para señalarlos en la lista. */
  openTabs: readonly string[];
  onPick: (number: string) => void;
}

interface RecordTabsProps {
  /** Sección dueña de las pestañas: `/tickets`, `/ordenes`… */
  basePath: string;
  /** Rutas hermanas del detalle que no son un registro (`nuevo`). */
  notRecords?: readonly string[];
  /** Nombre con el que se guardan, por persona, en este navegador. */
  storageName: string;
  navLabel: string;
  addLabel: string;
  /** Hook: el título del registro para la pestaña, o `undefined` mientras carga. */
  useTitle: (number: string) => string | undefined;
  renderPicker: (props: PickerSlotProps) => ReactNode;
}

/**
 * Pestañas de registros abiertos. Se ven en toda la aplicación, no solo en su sección,
 * para volver a un ticket u orden desde cualquier pantalla.
 * Se reordenan arrastrando o con Alt+Shift+← / →.
 */
export function RecordTabs({
  basePath,
  notRecords = [],
  storageName,
  navLabel,
  addLabel,
  useTitle,
  renderPicker,
}: RecordTabsProps) {
  const { me } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const storageKey = me ? `tekzaya.${storageName}.${me.id}` : null;
  const [tabs, setTabs] = useState<string[]>(() => readTabs(storageKey));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  const param = matchPath(`${basePath}/:number`, pathname)?.params.number;
  const current = param && !notRecords.includes(param) ? param : null;

  // Solo reacciona al cambio de ruta: al cerrar la pestaña activa la lista cambia antes que la ruta,
  // y mirar ambas volvía a abrir la que se cerraba.
  useEffect(() => {
    if (current) setTabs((prev) => (prev.includes(current) ? prev : [...prev, current]));
  }, [current]);

  useEffect(() => {
    if (!storageKey) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(tabs));
    } catch {
      /* sin almacenamiento: las pestañas viven solo en esta sesión */
    }
  }, [storageKey, tabs]);

  function close(number: string) {
    const index = tabs.indexOf(number);
    const next = tabs.filter((tab) => tab !== number);
    setTabs(next);

    if (number === current) {
      const neighbor = next[Math.min(index, next.length - 1)];
      navigate(neighbor ? `${basePath}/${neighbor}` : basePath);
    }
  }

  /** Pone `number` en la posición `index` (contada sin él). */
  function moveTo(number: string, index: number) {
    setTabs((prev) => {
      const without = prev.filter((tab) => tab !== number);
      const at = Math.max(0, Math.min(index, without.length));
      const next = [...without.slice(0, at), number, ...without.slice(at)];

      return next.every((tab, i) => tab === prev[i]) ? prev : next;
    });
  }

  // Al arrastrar, la pestaña se coloca en vivo antes o después de la que tiene
  // debajo según de qué mitad esté el puntero.
  function dragOver(over: string, event: DragEvent<HTMLElement>) {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (over === dragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    const index = tabs.filter((tab) => tab !== dragging).indexOf(over);
    moveTo(dragging, after ? index + 1 : index);
  }

  // Sin pestañas no hay barra: el "+" suelto sobraba.
  if (tabs.length === 0) return null;

  // Si hay otra barra de pestañas antes (tickets y órdenes juntas), una línea las separa.
  return (
    <nav
      aria-label={navLabel}
      className="hidden min-w-0 max-w-fit flex-1 items-end gap-1 self-stretch overflow-x-auto md:flex [scrollbar-width:none] [&+nav]:ml-1 [&+nav]:border-l [&+nav]:border-[var(--rail-bezel)] [&+nav]:pl-2"
    >
      {tabs.map((number) => (
        <RecordTab
          key={number}
          number={number}
          href={`${basePath}/${number}`}
          active={number === current}
          dragging={number === dragging}
          useTitle={useTitle}
          onClose={() => close(number)}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            // Firefox no arranca el arrastre sin algún dato.
            event.dataTransfer.setData("text/plain", number);
            setDragging(number);
          }}
          onDragOver={(event) => dragOver(number, event)}
          onDragEnd={() => setDragging(null)}
          onMove={(step) => moveTo(number, tabs.indexOf(number) + step)}
        />
      ))}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        title={addLabel}
        aria-label={addLabel}
        className="mb-1.5 ml-1 flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-lg text-[var(--rail-ink-dim)] hover:bg-[var(--rail-surface-2)] hover:text-[var(--rail-ink)]"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
      {renderPicker({
        open: pickerOpen,
        onClose: () => setPickerOpen(false),
        openTabs: tabs,
        onPick: (number) => {
          setPickerOpen(false);
          navigate(`${basePath}/${number}`);
        },
      })}
    </nav>
  );
}

function RecordTab({
  number,
  href,
  active,
  dragging,
  useTitle,
  onClose,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMove,
}: {
  number: string;
  href: string;
  active: boolean;
  dragging: boolean;
  useTitle: (number: string) => string | undefined;
  onClose: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  /** Mover con teclado: −1 a la izquierda, +1 a la derecha. */
  onMove: (step: -1 | 1) => void;
}) {
  const title = useTitle(number);
  const label = title ? `${number} ${title}` : `${number} …`;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={(event) => event.preventDefault()}
      onDragEnd={onDragEnd}
      // Todas con fondo, para que se vean como pestañas abiertas y no como texto suelto.
      // La activa toma el color del contenido, como si siguiera en él, y una línea de marca arriba.
      className={`group relative flex h-11 min-w-[120px] max-w-[230px] shrink cursor-grab items-center rounded-t-lg border border-b-0 text-sm transition-colors active:cursor-grabbing ${
        dragging ? "opacity-50" : ""
      } ${
        active
          ? "border-[var(--rail-bezel)] bg-[var(--content-bg)] text-[var(--content-ink)] before:absolute before:inset-x-2 before:top-0 before:h-0.5 before:rounded-full before:bg-accent"
          : "border-transparent bg-accent/10 text-[var(--rail-ink)] hover:bg-accent/20"
      }`}
    >
      <Link
        to={href}
        title={label}
        aria-current={active ? "page" : undefined}
        aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
        // El enlace no se arrastra por su cuenta: lo que se mueve es la pestaña.
        draggable={false}
        onKeyDown={(event) => {
          // Reordenar sin ratón. La pestaña conserva el foco tras moverse.
          if (event.altKey && event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            event.preventDefault();
            onMove(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
        // Clic con la rueda cierra la pestaña, como en el navegador.
        onAuxClick={(event) => {
          if (event.button === 1) {
            event.preventDefault();
            onClose();
          }
        }}
        className="min-w-0 flex-1 truncate py-2 pl-3 pr-1"
      >
        {/* Un solo texto: el número suelto no debe competir con el de la página. */}
        {label}
      </Link>
      <Tooltip label="Cerrar" side="bottom" className="mr-1.5 flex shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label={`Cerrar ${number}`}
          className="flex h-6 w-6 items-center justify-center rounded-md opacity-70 transition-colors hover:bg-accent/30 hover:text-[var(--rail-ink)] hover:opacity-100 focus-visible:opacity-100"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}

const storedTabs = z.array(z.unknown()).transform((items) =>
  items.flatMap((item) => {
    const tab = z.string().safeParse(item);

    return tab.success ? [tab.data] : [];
  }),
);

function readTabs(key: string | null): string[] {
  if (!key) return [];

  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");

    const tabs = storedTabs.safeParse(parsed);

    return tabs.success ? tabs.data : [];
  } catch {
    return [];
  }
}
