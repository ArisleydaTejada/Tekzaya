import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Para filas que se desplazan en horizontal (el kanban): difumina el borde derecho
 * mientras quede contenido por ver, porque una columna cortada en seco no dice que
 * hay más. Al llegar al final, el borde vuelve a ser nítido.
 */
export function useOverflowFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [more, setMore] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;

    if (!el) return;
    setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  return {
    ref,
    fadeClass: more ? "[mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]" : "",
  };
}
