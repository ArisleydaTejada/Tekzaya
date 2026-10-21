import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { XIcon } from "./icons";

/**
 * Un panel que cuelga de un botón: el selector de mes y los filtros del
 * calendario. Se cierra al pulsar fuera o con Escape, y devuelve el foco al
 * botón. A diferencia de `DropdownMenu`, no va en un portal: vive en una barra
 * de herramientas, no dentro de una tabla que lo recorte.
 */
export function Popover({
  label,
  trigger,
  title,
  align = "left",
  children,
  triggerClassName,
}: {
  /** Nombre accesible del panel. */
  label: string;
  trigger: ReactNode;
  /** Cabecera visible del panel, con su botón de cerrar. */
  title?: string;
  align?: "left" | "right";
  children: ReactNode;
  triggerClassName: string | ((open: boolean) => string);
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Cerrar desde el panel (su botón, Escape o una opción marcada con
  // `data-popover-close`) devuelve el foco al botón; pulsar fuera no, porque el
  // foco ya está donde se pulsó.
  const closeFromPanel = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest("[data-popover-close]")) return;
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className={typeof triggerClassName === "function" ? triggerClassName(open) : triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          onClick={closeFromPanel}
          className={`absolute top-full z-30 mt-2 w-64 rounded-xl border border-[var(--content-border)] bg-[var(--content-surface)] shadow-[var(--content-shadow)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {title && (
            <div className="flex items-center justify-between border-b border-[var(--content-border)] px-4 py-3">
              <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">{title}</h3>
              <button
                type="button"
                data-popover-close
                aria-label="Cerrar"
                className="rounded-md p-1 text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)] hover:text-[var(--content-ink)]"
              >
                <XIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
