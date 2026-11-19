import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { useTheme } from "../../theme/ThemeContext";
import { CROPS, SHOT_HEIGHT, SHOT_WIDTH, SHOTS } from "./shots";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * Portada sobre la plancha oscura del login, en los dos temas: es la misma
 * pieza de marca con la que se entra a la aplicación. La captura va inclinada,
 * como una pantalla vista desde un lado, y encima flotan dos piezas reales, una
 * por módulo: la tarjeta de un ticket y el costo de una orden de trabajo.
 *
 * El movimiento cuenta la profundidad: al bajar, las piezas sueltas suben más
 * rápido que la captura. Con "reducir movimiento" todo queda quieto.
 */
export function Hero({ onDemo }: { onDemo: () => void }) {
  const { theme } = useTheme();
  const reduce = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end start"] });
  const shotY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 50]);
  const ticketY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -70]);
  const costY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -130]);

  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: EASE_OUT },
        };

  return (
    <section id="inicio" ref={section} aria-labelledby="inicio-titulo" className="px-2 pt-2 sm:px-4 sm:pt-4">
      {/* Degradado del carbón-violeta de la plancha: en tema oscuro es lo que la separa del fondo. */}
      <div className="relative isolate overflow-hidden rounded-3xl bg-[linear-gradient(155deg,#2c2640_0%,#221f2c_45%,#1a1722_100%)] ring-1 ring-white/12">
        {/* Luz lila detrás de la captura: separa el producto del fondo y es el lila del logo. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-48 -z-10 h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(closest-side,rgba(181,163,207,0.30),rgba(88,71,157,0.12)_55%,transparent)]"
        />

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pt-14 sm:px-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,7fr)] lg:gap-12 lg:pt-20">
          <div className="lg:pb-28">
            {/* Una línea por módulo en escritorio: lo que hace Tickets y lo que hace Mantenimiento. */}
            <motion.h1
              id="inicio-titulo"
              {...enter(0)}
              className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-panel-ink md:text-5xl lg:text-[2.25rem] xl:text-[2.9rem] 2xl:text-[3.4rem]"
            >
              <span className="lg:block lg:whitespace-nowrap">Atiende cada pedido</span>{" "}
              <span className="text-accent-soft lg:block lg:whitespace-nowrap">y cuida cada equipo.</span>
            </motion.h1>
            <motion.p {...enter(0.08)} className="mt-6 max-w-[44ch] text-lg leading-relaxed text-panel-ink-dim">
              Tekzaya tiene dos módulos que se contratan por separado: Tickets para la mesa de ayuda y
              Mantenimiento para tus activos.
            </motion.p>
            <motion.div {...enter(0.16)} className="mt-9 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onDemo}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 text-[0.9375rem] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(88,71,157,0.8)] transition-colors hover:bg-accent-dim"
              >
                Solicitar demo
              </button>
              <a
                href="#planes"
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/25 px-6 text-[0.9375rem] font-semibold text-panel-ink transition-colors hover:border-white/50 hover:bg-white/10"
              >
                Ver planes
              </a>
            </motion.div>
          </div>

          {/* La captura baja por debajo del borde de la plancha: es una ventana a la aplicación. */}
          <div className="relative -mb-10 sm:-mb-16 lg:-mb-24 lg:-mr-24 xl:-mr-40">
            <motion.div style={{ y: shotY }} {...enter(0.1)}>
              <div className="origin-left rounded-2xl bg-black/30 p-2 ring-1 ring-white/15 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] lg:[transform:perspective(2200px)_rotateY(-9deg)_rotateX(4deg)]">
                <img
                  src={SHOTS.tickets[theme]}
                  alt="Lista de tickets del área de IT y Sistemas, con estado, solicitante, responsables, plazo de SLA y prioridad de cada uno."
                  width={SHOT_WIDTH}
                  height={SHOT_HEIGHT}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="block h-auto w-full rounded-xl"
                />
              </div>
            </motion.div>

            {/* Las piezas sueltas repiten lo que ya dice la captura: para un lector de pantalla son decorado. */}
            <motion.div
              aria-hidden="true"
              style={{ y: ticketY }}
              className="absolute -left-4 top-[12%] w-[42%] sm:-left-10 lg:-left-6 lg:top-[36%] lg:w-[34%]"
            >
              <motion.img
                {...enter(0.45)}
                src={CROPS.ticket[theme]}
                alt=""
                width={CROPS.ticket.width}
                height={CROPS.ticket.height}
                className="block h-auto w-full rounded-xl shadow-[0_24px_48px_-12px_rgba(0,0,0,0.65)] ring-1 ring-black/10"
              />
            </motion.div>
            <motion.div
              aria-hidden="true"
              style={{ y: costY }}
              className="absolute bottom-[18%] right-2 w-[46%] sm:right-6 lg:bottom-[26%] lg:right-28 lg:w-[36%] xl:right-44"
            >
              <motion.img
                {...enter(0.6)}
                src={CROPS.costo[theme]}
                alt=""
                width={CROPS.costo.width}
                height={CROPS.costo.height}
                className="block h-auto w-full rounded-xl shadow-[0_24px_48px_-12px_rgba(0,0,0,0.65)] ring-1 ring-black/10"
              />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
