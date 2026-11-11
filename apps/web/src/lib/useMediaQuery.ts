import { useSyncExternalStore } from "react";

/** Si la media query se cumple ahora, y se vuelve a pintar cuando cambia (girar el móvil, redimensionar). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);

      list.addEventListener("change", onChange);

      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
