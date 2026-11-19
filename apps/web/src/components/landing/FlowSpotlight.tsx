import { motion, useReducedMotion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import { useTheme } from "../../theme/ThemeContext";
import { SHOT_HEIGHT, SHOT_WIDTH, SHOTS } from "./shots";

/** Una zona de la captura, en píxeles de la imagen mostrada a 2000 × 1250. */
interface Zone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowStep {
  ref: string;
  text: ReactNode;
  /** Siempre dos zonas: así cada paso se anima desde el anterior en vez de aparecer de golpe. */
  zones: [Zone, Zone];
}

const VIEW_WIDTH = 2000;

const VIEW_HEIGHT = 1250;

const PAD = 10;

/**
 * Los pasos de un ticket que abre una orden de trabajo, sobre la captura real
 * de ese ticket: al elegir un paso, la imagen oscurece todo menos las partes de
 * la pantalla de las que habla. Es la única animación que explica algo que una
 * imagen fija no puede: dónde mirar.
 */
export function FlowSpotlight({ steps, alt }: { steps: FlowStep[]; alt: string }) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const maskId = useId();
  const zones = steps[active]?.zones ?? steps[0]?.zones ?? [];

  const rects = zones.map((zone) => ({
    x: zone.x - PAD,
    y: zone.y - PAD,
    width: zone.width + PAD * 2,
    height: zone.height + PAD * 2,
  }));

  // Con "reducir movimiento", el resaltado salta al paso nuevo sin desplazarse.
  const transition = reduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 220, damping: 30 };

  return (
    // Captura a todo el ancho y el recorrido debajo: la sección no repite el
    // "lista a la izquierda, imagen a la derecha" de la portada y de Tickets.
    <div className="flex flex-col gap-6">
      <div>
        <div className="rounded-2xl bg-panel p-2 shadow-instrument ring-1 ring-white/10 sm:p-2.5">
          <div className="relative overflow-hidden rounded-xl">
            <img
              src={SHOTS.ticketOt[theme]}
              alt={alt}
              width={SHOT_WIDTH}
              height={SHOT_HEIGHT}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
            <svg
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <defs>
                <mask id={maskId}>
                  <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="white" />
                  {rects.map((rect, index) => (
                    <motion.rect key={index} rx={18} fill="black" initial={false} animate={rect} transition={transition} />
                  ))}
                </mask>
              </defs>
              <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="rgb(18 16 26 / 0.55)" mask={`url(#${maskId})`} />
              {rects.map((rect, index) => (
                <motion.rect
                  key={index}
                  rx={18}
                  fill="none"
                  stroke="#b5a3cf"
                  strokeWidth={5}
                  initial={false}
                  animate={rect}
                  transition={transition}
                />
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* El recorrido: la barra de arriba de cada paso se llena hasta el elegido. */}
      <ol className="grid gap-3 md:grid-cols-3 md:gap-4">
        {steps.map((step, index) => {
          const selected = index === active;

          return (
            <li key={step.ref}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setActive(index)}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                className={`h-full w-full rounded-xl border px-4 pb-4 pt-3 text-left transition-colors ${
                  selected
                    ? "border-accent bg-[var(--content-surface)] shadow-[var(--content-shadow)]"
                    : "border-[var(--content-border)] hover:border-[var(--field-border)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mb-3 block h-1 rounded-full transition-colors ${
                    index <= active ? "bg-accent" : "bg-[var(--content-border)]"
                  }`}
                />
                <span className="tabular inline-block rounded-md bg-accent/10 px-1.5 py-0.5 font-body text-[0.8125rem] font-bold text-accent-ink">
                  {step.ref}
                </span>
                <span className="mt-2 block leading-relaxed text-[var(--content-ink)]">{step.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
