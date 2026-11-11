import { useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export type GaugeTone = "neutral" | "steel" | "accent" | "green" | "amber" | "red";

const START_ANGLE = 135;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;

  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const delta = ((a1 - a0) % 360 + 360) % 360;
  const largeArc = delta > 180 ? 1 : 0;

  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;
}

export interface GaugeDialProps {
  id: string;
  label: string;
  displayValue: string;
  /** 0–100: hasta dónde se llena la banda. */
  value: number;
  /**
   * Solo `neutral` cambia el dibujo (sin datos: línea gris y sin banda). El dial va siempre en
   * los colores de la marca; el estado lo cuentan la cifra y el pie.
   */
  tone: GaugeTone;
  featured?: boolean;
  /** Se conserva por compatibilidad; el dial claro no lleva resplandor. */
  glow?: boolean;
  /** Píldora bajo el arco con el contexto de la cifra, p. ej. el período ("Mes"). */
  badge?: string;
  caption?: ReactNode;
  className?: string;
}

/**
 * Dial claro en los colores de la marca (referencia: docs/ideas_diseno/dial.png): una línea
 * fina en degradado recorre todo el arco y una banda suave se llena hasta el valor. Sin
 * esfera oscura ni aguja: en una pantalla clara, el bloque negro pesaba más que la cifra.
 */
export function GaugeDial({
  id,
  label,
  caption,
  displayValue,
  value,
  tone,
  featured = false,
  badge,
  className = "",
}: GaugeDialProps) {
  const prefersReducedMotion = useReducedMotion();
  const cx = 100;
  const cy = 100;
  const outerR = 84;
  const bandR = 68;
  const bandWidth = 20;
  const empty = tone === "neutral";
  const clamped = Math.max(0, Math.min(100, value));
  const bandLength = (SWEEP / 360) * 2 * Math.PI * bandR;
  const outerPath = arcPath(cx, cy, outerR, START_ANGLE, START_ANGLE + SWEEP);
  const bandPath = arcPath(cx, cy, bandR, START_ANGLE, START_ANGLE + SWEEP);

  // "75%" se pinta como en la referencia: la cifra grande y el símbolo pequeño, arriba.
  const percent = displayValue.endsWith("%");
  const figure = percent ? displayValue.slice(0, -1) : displayValue;

  return (
    <div
      className={`flex flex-col items-center rounded-2xl border border-[var(--content-border)] bg-[var(--content-surface)] px-4 pb-4 pt-3 shadow-[var(--content-shadow)] ${className}`}
    >
      <p className="self-start text-sm text-[var(--content-ink)]">{label}</p>

      <div className={`relative ${featured ? "w-48" : "w-40"}`}>
        <svg viewBox="0 0 200 172" role="img" aria-label={`${label}: ${displayValue}`} className="block w-full">
          <defs>
            {/* Degradados en el espacio del dial, de abajo a la izquierda hacia abajo a la derecha. */}
            <linearGradient id={`dial-line-${id}`} gradientUnits="userSpaceOnUse" x1="20" y1="160" x2="180" y2="160">
              <stop offset="0%" style={{ stopColor: "var(--dial-start)" }} />
              <stop offset="100%" style={{ stopColor: "var(--dial-end)" }} />
            </linearGradient>
            <linearGradient id={`dial-band-${id}`} gradientUnits="userSpaceOnUse" x1="20" y1="160" x2="180" y2="160">
              <stop offset="0%" style={{ stopColor: "var(--dial-band-start)" }} />
              <stop offset="100%" style={{ stopColor: "var(--dial-band-end)" }} />
            </linearGradient>
          </defs>

          <path
            d={outerPath}
            fill="none"
            stroke={empty ? "var(--content-border)" : `url(#dial-line-${id})`}
            strokeWidth={3}
            strokeLinecap="round"
          />

          {!empty && (
            <path
              d={bandPath}
              fill="none"
              stroke={`url(#dial-band-${id})`}
              strokeWidth={bandWidth}
              strokeDasharray={bandLength}
              style={{
                strokeDashoffset: bandLength * (1 - clamped / 100),
                transition: prefersReducedMotion ? "none" : "stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />
          )}

          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            className="tabular"
            fill="var(--content-ink)"
            fontFamily="var(--font-body)"
            fontWeight={300}
            fontSize={figure.length > 4 ? 34 : 46}
          >
            {figure}
            {percent && (
              <tspan fontSize={18} fontWeight={500} dx={2} dy={-20}>
                %
              </tspan>
            )}
          </text>
        </svg>

        {badge && (
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-0.5 text-xs text-[var(--content-ink-dim)]">
            {badge}
          </span>
        )}
      </div>

      {caption && <p className="mt-2 text-center text-xs text-[var(--content-ink-dim)]">{caption}</p>}
    </div>
  );
}
