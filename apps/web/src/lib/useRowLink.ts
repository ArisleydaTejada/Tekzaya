import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

/** Lo que ya hace algo al pulsarlo dentro de la fila: casillas, botones, enlaces. */
const INTERACTIVE = "a, button, input, label, select, textarea, summary, [role=button], [role=checkbox]";

/**
 * Hace que toda una fila (o tarjeta) abra su registro. No sustituye al enlace de la
 * fila, que sigue ahí para el teclado, el lector de pantalla y `j`/`k`: esto solo
 * amplía la zona que responde al ratón.
 *
 * Ctrl/⌘ o la rueda abren en otra pestaña, como un enlace. Si se estaba
 * seleccionando texto de la fila, no se navega.
 */
export function useRowLink() {
  const navigate = useNavigate();

  return (href: string) => {
    const open = (event: MouseEvent<HTMLElement>, newTab: boolean) => {
      if (event.defaultPrevented) return;
      const target = event.target;

      if (target instanceof Element) {
        const control = target.closest(INTERACTIVE);

        if (control && event.currentTarget.contains(control)) return;
      }

      if (window.getSelection()?.toString()) return;

      if (newTab) window.open(href, "_blank", "noopener");
      else navigate(href);
    };

    return {
      onClick: (event: MouseEvent<HTMLElement>) => open(event, event.ctrlKey || event.metaKey),
      onAuxClick: (event: MouseEvent<HTMLElement>) => {
        if (event.button === 1) open(event, true);
      },
    };
  };
}
