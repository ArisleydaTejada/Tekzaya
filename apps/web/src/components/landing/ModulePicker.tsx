import { useState } from "react";
import { useTheme } from "../../theme/ThemeContext";
import { SHOT_HEIGHT, SHOT_WIDTH, SHOTS, type ShotKey } from "./shots";

interface ModuleCard {
  href: string;
  name: string;
  summary: string;
  points: string[];
  shot: ShotKey;
}

const MODULES: ModuleCard[] = [
  {
    href: "#tickets",
    name: "Tickets",
    summary: "La mesa de ayuda de cada área, con plazos y responsables.",
    points: ["SLA con horario laboral", "Reparto automático", "Reportes y satisfacción"],
    shot: "kanban",
  },
  {
    href: "#mantenimiento",
    name: "Mantenimiento",
    summary: "Los equipos de la empresa, sus órdenes de trabajo y lo que cuestan.",
    points: ["Historial de cada activo", "Preventivos programados", "Repuestos y costos"],
    shot: "activo",
  },
];

/**
 * Los dos módulos frente a frente, como dos productos. En escritorio, el que se
 * señala se ensancha y su captura sube: se elige uno sin leer toda la página.
 * El ancho cambia con `flex-grow`, no con una animación de tamaño a mano.
 */
export function ModulePicker() {
  const { theme } = useTheme();
  const [focused, setFocused] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4 lg:flex-row" onMouseLeave={() => setFocused(null)}>
      {MODULES.map((module, index) => {
        const wide = focused === index;

        return (
          <a
            key={module.href}
            href={module.href}
            onMouseEnter={() => setFocused(index)}
            onFocus={() => setFocused(index)}
            onBlur={() => setFocused(null)}
            className={`group relative flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-[var(--content-border)] bg-[var(--content-surface)] transition-[flex-grow,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-accent hover:shadow-[var(--content-shadow)] focus-visible:border-accent lg:min-h-[30rem] lg:basis-0 ${
              wide ? "lg:grow-[1.45]" : "lg:grow"
            }`}
          >
            <div className="relative z-10 p-6 sm:p-8">
              <h3 className="font-display text-3xl font-semibold tracking-tight text-[var(--content-ink)]">
                {module.name}
              </h3>
              <p className="mt-2 max-w-[38ch] text-[0.9375rem] leading-relaxed text-[var(--content-ink-dim)]">
                {module.summary}
              </p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {module.points.map((point) => (
                  <li
                    key={point}
                    className="rounded-lg bg-accent/10 px-2.5 py-1 text-sm font-semibold text-accent-ink"
                  >
                    {point}
                  </li>
                ))}
              </ul>
              <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-[var(--content-ink)] underline decoration-accent decoration-2 underline-offset-4">
                Ver el módulo
              </span>
            </div>

            {/* La captura asoma por abajo, montada en la plancha, y sube al elegir el módulo. */}
            <div className="relative mt-auto h-56 sm:h-64 lg:h-72">
              <div
                className={`absolute inset-x-6 top-0 rounded-t-2xl bg-panel p-2 pb-0 ring-1 ring-white/10 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] sm:inset-x-8 lg:w-[150%] lg:right-auto ${
                  wide ? "-translate-y-3" : "translate-y-0"
                }`}
              >
                <img
                  src={SHOTS[module.shot][theme]}
                  alt=""
                  width={SHOT_WIDTH}
                  height={SHOT_HEIGHT}
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full rounded-t-xl"
                />
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
