import type { HTMLAttributes } from "react";

export function Plate({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-[var(--content-border)] bg-[var(--content-surface)] shadow-[var(--content-shadow)] ${className}`}
      {...rest}
    />
  );
}
