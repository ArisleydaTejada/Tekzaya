import type { ReactNode } from "react";
import { Plate } from "./Plate";
import { TrendDownIcon, TrendUpIcon } from "./icons";

export interface StatTileTrend {
  /** Signed percentage vs. the previous period; sign decides the arrow. */
  value: number;
  /** Whether a positive value is a good outcome for this metric (false for "SLA vencidos", say). */
  goodWhenUp?: boolean;
}

interface StatTileProps {
  label: string;
  value: string;
  icon: ReactNode;
  caption?: ReactNode;
  trend?: StatTileTrend;
  className?: string;
}

export function StatTile({ label, value, icon, caption, trend, className = "" }: StatTileProps) {
  const up = (trend?.value ?? 0) >= 0;
  const good = trend ? up === (trend.goodWhenUp ?? true) : true;

  return (
    <Plate className={`flex h-full flex-col p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[var(--content-ink-dim)]">{label}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--content-border)] text-[var(--content-ink-dim)]">
          {icon}
        </span>
      </div>
      <p className="mt-2 font-display text-3xl font-semibold tabular leading-none text-[var(--content-ink)]">{value}</p>
      <div className="mt-auto flex items-center justify-between gap-1.5 pt-2.5 text-xs">
        {caption && <span className="text-[var(--content-ink-dim)]">{caption}</span>}
        {trend && (
          <span className={`flex items-center gap-0.5 font-medium ${good ? "text-green" : "text-red"}`}>
            {up ? <TrendUpIcon /> : <TrendDownIcon />}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
    </Plate>
  );
}
