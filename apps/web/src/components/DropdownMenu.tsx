import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreIcon } from "./icons";

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

const MENU_WIDTH = 216;

/**
 * En un portal y con posición fija: las tablas con scroll horizontal recortarían un menú en la celda.
 * Por eso también se cierra al desplazar la página.
 */
/** Con `text`, el disparador muestra la palabra junto al icono (p. ej. "Más" en una barra de botones). */
export function DropdownMenu({ label, items, text }: { label: string; items: DropdownItem[]; text?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const height = menu.current?.offsetHeight ?? items.length * 36 + 8;
    // Alineado a la derecha del botón; si no cabe debajo, se abre hacia arriba.
    const below = rect.bottom + 4 + height <= window.innerHeight;
    setPosition({
      top: below ? rect.bottom + 4 : rect.top - 4 - height,
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);

    const onPointer = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) return;

      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        trigger.current?.focus();
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const index = buttons.findIndex((button) => button === document.activeElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        buttons[(index + step + buttons.length) % buttons.length]?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);

    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Al abrir, el foco pasa a la primera opción para poder seguir con el teclado.
  useEffect(() => {
    if (open && position) menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [open, position]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={text ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          text
            ? `flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] transition-colors hover:bg-[var(--content-bg)] ${
                open ? "bg-[var(--content-bg)]" : ""
              }`
            : `rounded-md p-1.5 text-[var(--content-ink-dim)] transition-colors hover:bg-[var(--content-bg)] hover:text-[var(--content-ink)] ${
                open ? "bg-[var(--content-bg)] text-[var(--content-ink)]" : ""
              }`
        }
      >
        <MoreIcon className={text ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {text}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={label}
            style={{
              position: "fixed",
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              width: MENU_WIDTH,
            }}
            className="z-50 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-1 shadow-[var(--content-shadow)]"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-[var(--content-bg)] focus-visible:bg-[var(--content-bg)] disabled:opacity-50 ${
                  item.danger ? "text-red" : "text-[var(--content-ink)]"
                }`}
              >
                {item.icon && (
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                      item.danger ? "" : "text-[var(--content-ink-dim)]"
                    }`}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                )}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
