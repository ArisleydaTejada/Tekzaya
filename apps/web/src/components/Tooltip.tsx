import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "right" | "bottom";

const GAP = 8;

/**
 * Etiqueta flotante al pasar el ratón o al enfocar con teclado. Va en un portal porque
 * la barra lateral y la de pestañas recortan lo que se sale de ellas.
 *
 * Es solo visual: el control que envuelve debe llevar su propio nombre accesible
 * (`aria-label` o texto), para que el lector no lo lea dos veces.
 * Sin `label` no hace nada y devuelve el contenido tal cual.
 */
export function Tooltip({
  label,
  side = "right",
  className = "inline-flex",
  children,
}: {
  label?: string | null | undefined;
  side?: Side;
  /** Clases del envoltorio: en una columna flex conviene "flex flex-col". */
  className?: string;
  children: ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();

    setPosition(
      side === "right"
        ? { top: rect.top + rect.height / 2, left: rect.right + GAP }
        : { top: rect.bottom + GAP, left: rect.left + rect.width / 2 },
    );
  }, [open, side]);

  useEffect(() => {
    if (!open) return;
    const hide = () => setOpen(false);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    // Al desplazar, la etiqueta quedaría flotando lejos de su control.
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!label) return <>{children}</>;

  // Con el foco solo si llega por teclado: al hacer clic ya se sabe qué se pulsó.
  const onFocus = (event: FocusEvent<HTMLSpanElement>) => {
    if (event.target instanceof Element && event.target.matches(":focus-visible")) setOpen(true);
  };

  return (
    <span
      ref={anchor}
      className={className}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={() => setOpen(false)}
      onPointerDown={() => setOpen(false)}
      onFocus={onFocus}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open &&
        position &&
        createPortal(
          <span
            aria-hidden="true"
            style={{ top: position.top, left: position.left }}
            className={`pointer-events-none fixed z-[70] whitespace-nowrap rounded-md bg-[var(--content-ink)] px-2 py-1 text-xs font-medium text-[var(--content-bg)] shadow-[var(--content-shadow)] ${
              side === "right" ? "-translate-y-1/2" : "-translate-x-1/2"
            }`}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
