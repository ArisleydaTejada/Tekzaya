import { useTheme } from "../../theme/ThemeContext";
import { DETAILS, type DetailKey } from "./shots";

export interface VignetteItem {
  id: string;
  title: string;
  text: string;
  detail: DetailKey;
  alt: string;
}

/**
 * Un detalle de la aplicación visto de cerca: una sola pieza de la pantalla,
 * capturada a alta densidad. Enseña una cosa pequeña y concreta en lugar del
 * catálogo de funciones.
 */
export function Vignette({ item, className = "" }: { item: VignetteItem; className?: string }) {
  const { theme } = useTheme();
  const detail = DETAILS[item.detail];

  return (
    <figure className={`group ${className}`}>
      <div className="rounded-2xl bg-accent/[0.07] p-5 ring-1 ring-inset ring-accent/10 sm:p-8">
        <img
          src={detail[theme]}
          alt={item.alt}
          width={detail.width}
          height={detail.height}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full rounded-xl shadow-[0_18px_40px_-18px_rgba(34,31,44,0.45)] ring-1 ring-[var(--content-border)] transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-1.5"
        />
      </div>
      <figcaption className="mt-4 px-1">
        <span className="block font-display text-base font-semibold text-[var(--content-ink)]">{item.title}</span>
        <span className="mt-1 block text-[0.9375rem] leading-relaxed text-[var(--content-ink-dim)]">{item.text}</span>
      </figcaption>
    </figure>
  );
}
