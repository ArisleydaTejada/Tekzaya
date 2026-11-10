import type { ComponentType } from "react";
import { attachmentUrl } from "../api/tickets";

/**
 * La portada en pequeño de un activo o un repuesto; sin foto, un icono del mismo
 * tamaño para que la columna no baile.
 */
export function Thumb({
  photoId,
  icon: Icon,
  size = "md",
}: {
  photoId?: string;
  icon: ComponentType<{ className?: string }>;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  return photoId ? (
    <img
      src={attachmentUrl(photoId)}
      alt=""
      loading="lazy"
      className={`${box} shrink-0 rounded-md border border-[var(--content-border)] object-cover`}
    />
  ) : (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded-md bg-[var(--content-bg)] text-[var(--content-ink-dim)]`}
      aria-hidden="true"
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </span>
  );
}
