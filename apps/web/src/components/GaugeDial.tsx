import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export type GaugeTone = "neutral" | "steel" | "accent" | "green" | "amber" | "red";

const TONE_COLOR: Record<GaugeTone, string> = {
  neutral: "var(--color-panel-ink-dim)",
  steel: "var(--color-steel)",
  accent: "var(--accent-contrast)",
  green: "var(--status-green)",
  amber: "var(--status-amber)",
  red: "var(--status-red)",
};

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
  /** 0–100, position of the needle and fill arc */
  value: number;
  tone: GaugeTone;
  featured?: boolean;
  glow?: boolean;
  caption?: ReactNode;
  className?: string;
}

export function GaugeDial({
  id,
  label,
  caption,
  displayValue,
  value,
  tone,
  featured = false,
  glow = false,
  className = "",
}: GaugeDialProps) {
  const prefersReducedMotion = useReducedMotion();
  const cx = 60;
  const cy = 60;
  const r = 46;
  const trackPath = arcPath(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP);
  const clamped = Math.max(0, Math.min(100, value));
  const needleAngle = START_ANGLE + (clamped / 100) * SWEEP;
  const color = TONE_COLOR[tone];
  const circumference = (SWEEP / 360) * 2 * Math.PI * r;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const angle = START_ANGLE + t * SWEEP;
    const outer = polar(cx, cy, r + 5, angle);
    const inner = polar(cx, cy, r - 2, angle);
    return { key: t, x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
  });

  const rivetStyle =
    "absolute h-[5px] w-[5px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#767f8f,#1a1d23_75%)] shadow-[0_0.5px_0_rgba(255,255,255,0.15),0_1px_1px_rgba(0,0,0,0.6)]";

  return (
    <div
      className={`relative flex flex-col items-center overflow-hidden rounded-2xl border border-[var(--content-border)] bg-[var(--content-surface)] pt-4 shadow-[var(--content-shadow)] ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-x-3 top-0 h-10 rounded-full opacity-[0.06] blur-xl"
        style={{ background: "radial-gradient(ellipse at 50% 0%, #ffffff, transparent 70%)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4] mix-blend-overlay"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 0.5px, transparent 0.5px)",
          backgroundSize: "3px 3px",
        }}
        aria-hidden="true"
      />
      <span className={`${rivetStyle} left-2 top-2`} aria-hidden="true" />
      <span className={`${rivetStyle} right-2 top-2`} aria-hidden="true" />
      <span className={`${rivetStyle} bottom-2 left-2`} aria-hidden="true" />
      <span className={`${rivetStyle} bottom-2 right-2`} aria-hidden="true" />

      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label={`${label}: ${displayValue}`}
        className={featured ? "h-36 w-36" : "h-28 w-28"}
      >
        <defs>
          <radialGradient id={`face-${id}`} cx="50%" cy="36%" r="75%">
            <stop offset="0%" stopColor="#242933" />
            <stop offset="100%" stopColor="#12151b" />
          </radialGradient>
          <linearGradient id={`bezel-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#454c59" />
            <stop offset="50%" stopColor="#20242b" />
            <stop offset="100%" stopColor="#4a5160" />
          </linearGradient>
          {glow && (
            <filter id={`glow-${id}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>

        <circle cx={cx} cy={cy} r={56} fill={`url(#bezel-${id})`} />
        <circle cx={cx} cy={cy} r={53} fill="#0b0c10" />
        <circle cx={cx} cy={cy} r={51} fill={`url(#face-${id})`} stroke="#050608" strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={51} fill="none" stroke="#3d4451" strokeWidth={0.75} opacity={0.6} />

        {ticks.map((t) => (
          <line
            key={t.key}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke="#525a68"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ))}

        <path d={trackPath} fill="none" stroke="#282d36" strokeWidth={7} strokeLinecap="round" />

        <motion.path
          d={trackPath}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={circumference}
          filter={glow ? `url(#glow-${id})` : undefined}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 90, damping: 16 }
          }
          style={{ strokeDashoffset: circumference }}
        />

        <motion.g
          initial={false}
          animate={{ rotate: needleAngle }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 70, damping: 9, mass: 0.6 }
          }
          style={{ originX: "60px", originY: "60px" }}
        >
          <line x1={cx - 8} y1={cy} x2={cx + 36} y2={cy} stroke="#f5f7fa" strokeWidth={2.5} strokeLinecap="round" />
          <line x1={cx - 8} y1={cy} x2={cx + 36} y2={cy} stroke={color} strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
        </motion.g>

        <circle cx={cx} cy={cy} r={6} fill="#1b1f27" stroke="#565e6d" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={2.5} fill={color} />

        <text
          x={cx}
          y={cy + 25}
          textAnchor="middle"
          className="tabular"
          fill="#f5f7fa"
          fontFamily="var(--font-display)"
          fontWeight={600}
          fontSize={featured ? 21 : 17}
        >
          {displayValue}
        </text>
      </svg>

      <span className="mt-1.5 rounded-md bg-panel px-2.5 py-1 text-center font-display text-[10px] font-medium uppercase leading-tight tracking-[0.14em] text-panel-ink-dim shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
        {label}
      </span>
      <span className={`text-center text-xs text-[var(--content-ink-dim)] ${caption ? "mb-3 mt-1.5" : "mb-3"}`}>
        {caption ?? " "}
      </span>
    </div>
  );
}
