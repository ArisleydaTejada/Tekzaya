import type { DemoModule } from "@tekzaya/shared";
import { motion } from "motion/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DemoRequestDialog } from "../components/landing/DemoRequestDialog";
import { FlowSpotlight, type FlowStep } from "../components/landing/FlowSpotlight";
import logoIconWhite from "../assets/logo/LogoIconWhite.png";
import { Hero } from "../components/landing/Hero";
import { ModulePicker } from "../components/landing/ModulePicker";
import { Vignette, type VignetteItem } from "../components/landing/Vignette";
import { LogoLockup } from "../components/Logo";
import { ListIcon, MoonIcon, SunIcon, XIcon } from "../components/icons";
import { useTheme } from "../theme/ThemeContext";

/*
 * Página pública de Tekzaya. Dirección: la misma marca que la aplicación (morado
 * #58479d, Poppins para títulos y Nunito para el texto) y su metáfora de tablero
 * de instrumentos: cada captura va montada en la plancha oscura del login. El
 * otro motivo son los identificadores reales (TK-, ACT-, OT-), que cosen los
 * dos módulos. Dial: ENERGY 3 / RHYTHM 3 / MOTION 2. La plancha oscura abre
 * (portada) y cierra (última llamada) la página: es la misma pieza en los dos
 * temas, no una sección que invierte el tema.
 *
 * Radios, una sola escala: controles y fichas de texto 8 px (`rounded-lg`),
 * pestañas y pasos 12 px (`rounded-xl`), tarjetas y planchas 16 px (`rounded-2xl`).
 *
 * Cada módulo enseña tres detalles de cerca, no todas sus funciones; en "los
 * dos juntos" cada paso ilumina su parte del ticket.
 */

const NAV = [
  { href: "#tickets", label: "Tickets" },
  { href: "#mantenimiento", label: "Mantenimiento" },
  { href: "#planes", label: "Planes" },
];

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-dim";

const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--field-border)] px-5 py-2.5 text-sm font-semibold text-[var(--content-ink)] transition-colors hover:border-[var(--content-ink)] hover:bg-[var(--content-surface)]";

/** Las capturas entran al llegar a ellas: señalan dónde mirar en cada sección. */
function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}


function Header({ onDemo }: { onDemo: () => void }) {
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const themeLabel = theme === "dark" ? "Usar tema claro" : "Usar tema oscuro";

  return (
    // El único elemento translúcido: el contenido pasa por debajo al bajar.
    <header className="sticky top-0 z-40 border-b border-[var(--content-border)] bg-[var(--content-bg)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <a href="#inicio" className="flex min-h-11 shrink-0 items-center rounded-md" aria-label="Tekzaya, ir al inicio">
          <LogoLockup className="h-8 w-auto" />
        </a>

        <nav aria-label="Secciones" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--content-ink-dim)] transition-colors hover:text-[var(--content-ink)]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={themeLabel}
            title={themeLabel}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--content-ink-dim)] transition-colors hover:bg-[var(--content-surface)] hover:text-[var(--content-ink)]"
          >
            {theme === "dark" ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
          </button>
          <Link
            to="/ingresar"
            className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[var(--content-ink)] transition-colors hover:bg-[var(--content-surface)] sm:inline-flex"
          >
            Iniciar sesión
          </Link>
          {/* En móvil el botón vive dentro del menú: en la barra no cabe en una línea. */}
          <div className="hidden sm:block">
            <button type="button" onClick={onDemo} className={primaryButton}>
              Solicitar demo
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-controls="menu-movil"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--content-ink)] transition-colors hover:bg-[var(--content-surface)] md:hidden"
          >
            {menuOpen ? <XIcon aria-hidden="true" /> : <ListIcon aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="menu-movil" aria-label="Menú" className="border-t border-[var(--content-border)] px-4 pb-4 md:hidden">
          <ul className="flex flex-col py-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center rounded-md px-2 text-base font-medium text-[var(--content-ink)] hover:bg-[var(--content-surface)]"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                to="/ingresar"
                className="flex min-h-11 items-center rounded-md px-2 text-base font-medium text-[var(--content-ink)] hover:bg-[var(--content-surface)]"
              >
                Iniciar sesión
              </Link>
            </li>
          </ul>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onDemo();
            }}
            className={`${primaryButton} w-full`}
          >
            Solicitar demo
          </button>
        </nav>
      )}
    </header>
  );
}

// Tres detalles por módulo, no el catálogo: cada uno es una pieza real de la pantalla.
const TICKET_DETAILS: VignetteItem[] = [
  {
    id: "sla",
    detail: "sla",
    title: "El SLA a la vista",
    text: "Cuenta solo horas laborables y feriados.",
    alt: "Indicador de cumplimiento del SLA del área: 100 % en el mes.",
  },
  {
    id: "llegada",
    detail: "llegada",
    title: "Clasificado al llegar",
    text: "Prioridad, área sugerida por la IA y lo que queda de plazo.",
    alt: "Cabecera del ticket TK-000099: en progreso, urgente, área sugerida por IA con 85 % de confianza y 30 horas de retraso.",
  },
  {
    id: "duplicados",
    detail: "duplicados",
    title: "Los duplicados, en un solo ticket",
    text: "Cada mensaje fusionado conserva de qué ticket vino.",
    alt: "Mensajes de varias personas fusionados en un ticket, cada uno marcado con su ticket original.",
  },
];

const MAINTENANCE_DETAILS: VignetteItem[] = [
  {
    id: "repuestos",
    detail: "repuestos",
    title: "Repuestos con alerta",
    text: "Avisa cuando algo baja del mínimo.",
    alt: "Repuestos de la impresora con su stock; el tóner HP 58A aparece bajo el mínimo.",
  },
  {
    id: "preventivos",
    detail: "preventivos",
    title: "Preventivos en el calendario",
    text: "Cada plan crea sus órdenes a tiempo.",
    alt: "Un día del calendario con tres órdenes preventivas de mantenimiento de impresoras.",
  },
  {
    id: "disponibilidad",
    detail: "disponibilidad",
    title: "Cuánto tiempo funcionó cada equipo",
    text: "Disponibilidad, fallas y la última avería.",
    alt: "Estado de la impresora: 93 % de disponibilidad en 30 días, 3 fallas en 90 días y la fecha de la última.",
  },
];

// Zonas medidas sobre la captura de TK-000096 (imagen mostrada a 2000 × 1250).
const FLOW_STEPS: FlowStep[] = [
  {
    ref: "TK-000096",
    text: "Andrés, de Marketing, avisa que se cayó el wifi en Ventas.",
    zones: [
      { x: 428, y: 150, width: 348, height: 60 },
      { x: 480, y: 370, width: 876, height: 112 },
    ],
  },
  {
    ref: "ACT-0051",
    text: "Daury, de IT, vincula el punto de acceso afectado y ve sus averías anteriores.",
    zones: [
      { x: 655, y: 615, width: 578, height: 30 },
      { x: 1515, y: 640, width: 440, height: 335 },
    ],
  },
  {
    ref: "OT-0166",
    text: "Abre la orden desde el ticket. Cuando termine, la conversación lo registra y Andrés lo ve.",
    zones: [
      { x: 680, y: 782, width: 530, height: 30 },
      { x: 1535, y: 985, width: 398, height: 138 },
    ],
  },
];

const PLANS: { module: Exclude<DemoModule, "both">; prefix: string; name: string; purpose: string; includes: string[] }[] = [
  {
    module: "tickets",
    prefix: "TK",
    name: "Tickets",
    purpose: "Para cualquier área que atienda pedidos.",
    includes: ["SLA con horario laboral", "Reparto automático", "Reportes y encuesta"],
  },
  {
    module: "maintenance",
    prefix: "OT",
    name: "Mantenimiento",
    purpose: "Para quien cuida equipos y quiere saber cuánto cuestan.",
    includes: ["Activos con su historial", "Órdenes y preventivos", "Repuestos y costos"],
  },
];

// El caso de la demostración, en tres piezas: lo que añade tener los dos módulos.
const CHAIN = [
  { ref: "TK-000096", label: "Se cayó el wifi en Ventas" },
  { ref: "ACT-0051", label: "Punto de acceso" },
  { ref: "OT-0166", label: "Orden en progreso" },
];

export default function LandingPage() {
  const [demo, setDemo] = useState<{ open: boolean; module: DemoModule }>({ open: false, module: "both" });
  const openDemo = useCallback((module: DemoModule = "both") => setDemo({ open: true, module }), []);
  const closeDemo = useCallback(() => setDemo((current) => ({ ...current, open: false })), []);

  useEffect(() => {
    const previous = document.title;
    document.title = "Tekzaya: tickets y mantenimiento";

    // Un enlace con ancla (/#planes) llega antes de que la sección exista: se baja al pintarla.
    const target = decodeURIComponent(window.location.hash.slice(1));

    if (target) document.getElementById(target)?.scrollIntoView();

    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-dvh overflow-x-clip bg-[var(--content-bg)] text-[var(--content-ink)]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
      >
        Saltar al contenido
      </a>
      <Header onDemo={() => openDemo()} />

      <main id="contenido">
        {/* ── Portada ─────────────────────────────────────────── */}
        <Hero onDemo={() => openDemo()} />

        {/* ── Los dos módulos ─────────────────────────────────── */}
        <section id="modulos" aria-labelledby="modulos-titulo">
          <div className="mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6 lg:px-8 lg:pb-28 lg:pt-32">
            <h2 id="modulos-titulo" className="max-w-3xl font-display text-3xl font-semibold tracking-tight md:text-5xl">
              Dos módulos. Empieza por uno o usa los dos.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--content-ink-dim)]">
              Cada uno funciona solo y se contrata por separado. Juntos, un ticket puede abrir una orden de trabajo.
            </p>
            <div className="mt-12">
              <ModulePicker />
            </div>
          </div>
        </section>

        {/* ── Tickets ─────────────────────────────────────────── */}
        <section id="tickets" aria-labelledby="tickets-titulo" className="border-t border-[var(--content-border)]">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
              <h2
                id="tickets-titulo"
                className="font-display text-3xl font-semibold tracking-tight md:text-5xl lg:col-span-7"
              >
                Tickets: cada pedido con su plazo y su responsable.
              </h2>
              <p className="text-lg leading-relaxed text-[var(--content-ink-dim)] lg:col-span-5">
                Las personas piden ayuda a un área. El área reparte, responde y cierra con el reloj a la vista.
              </p>
            </div>

            {/* El indicador ocupa la columna alta; los dos detalles del ticket se apilan al lado. */}
            <div className="mt-14 grid items-start gap-8 lg:grid-cols-12">
              <Reveal className="lg:col-span-5">
                <Vignette item={TICKET_DETAILS[0]} />
              </Reveal>
              <div className="grid gap-8 lg:col-span-7">
                <Reveal>
                  <Vignette item={TICKET_DETAILS[1]} />
                </Reveal>
                <Reveal>
                  <Vignette item={TICKET_DETAILS[2]} />
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        {/* ── Mantenimiento ───────────────────────────────────── */}
        <section
          id="mantenimiento"
          aria-labelledby="mantenimiento-titulo"
          className="border-t border-[var(--content-border)] bg-[var(--content-surface)]"
        >
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            {/* Espejo de Tickets: aquí el título va a la derecha y los detalles en una fila. */}
            <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
              <h2
                id="mantenimiento-titulo"
                className="font-display text-3xl font-semibold tracking-tight md:text-5xl lg:order-2 lg:col-span-7 lg:text-right"
              >
                Mantenimiento: la historia completa de cada equipo.
              </h2>
              <p className="text-lg leading-relaxed text-[var(--content-ink-dim)] lg:order-1 lg:col-span-5">
                Lo que falló, lo que se le hizo y lo que costó, equipo por equipo.
              </p>
            </div>

            <div className="mt-14 grid items-start gap-8 sm:grid-cols-2 lg:grid-cols-12">
              <Reveal className="sm:col-span-2 lg:col-span-5">
                <Vignette item={MAINTENANCE_DETAILS[0]} />
              </Reveal>
              <Reveal className="lg:col-span-3">
                <Vignette item={MAINTENANCE_DETAILS[1]} />
              </Reveal>
              <Reveal className="lg:col-span-4">
                <Vignette item={MAINTENANCE_DETAILS[2]} />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Los dos juntos ──────────────────────────────────── */}
        <section id="juntos" aria-labelledby="juntos-titulo" className="border-t border-[var(--content-border)]">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <h2 id="juntos-titulo" className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Con los dos módulos, un ticket abre una orden de trabajo
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-[var(--content-ink-dim)]">
                Recorre el caso de los datos de demostración: cada paso marca dónde ocurre en el ticket.
              </p>
            </div>
            <Reveal className="mt-10">
              <FlowSpotlight
                steps={FLOW_STEPS}
                alt="Ticket TK-000096 con su conversación, el equipo afectado ACT-0051 y la orden de trabajo OT-0166 en progreso."
              />
            </Reveal>
          </div>
        </section>

        {/* ── Planes ──────────────────────────────────────────── */}
        <section id="planes" aria-labelledby="planes-titulo" className="border-t border-[var(--content-border)]">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <h2 id="planes-titulo" className="font-display text-3xl font-semibold tracking-tight md:text-5xl">
                Contrata solo lo que necesitas.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-[var(--content-ink-dim)]">
                El precio depende del tamaño de tu equipo: te lo enviamos después de la demo.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2">
              {PLANS.map((plan) => (
                <article
                  key={plan.module}
                  aria-labelledby={`plan-${plan.module}`}
                  className="group flex flex-col rounded-2xl border border-[var(--content-border)] bg-[var(--content-surface)] p-6 transition-colors hover:border-accent sm:p-8"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 id={`plan-${plan.module}`} className="font-display text-2xl font-semibold">
                      {plan.name}
                    </h3>
                    {/* El prefijo de sus números en la app (TK-, OT-): firma el plan sin icono inventado. */}
                    <span
                      aria-hidden="true"
                      className="rounded-lg border border-accent/30 px-2 py-0.5 font-display text-sm font-semibold tracking-wide text-accent-ink transition-colors group-hover:border-accent"
                    >
                      {plan.prefix}-
                    </span>
                  </div>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--content-ink-dim)]">{plan.purpose}</p>
                  <ul className="mt-6 flex flex-wrap gap-2">
                    {plan.includes.map((item) => (
                      <li key={item} className="rounded-lg bg-accent/10 px-2.5 py-1 text-sm font-semibold text-accent-ink">
                        {item}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => openDemo(plan.module)}
                    className={`${secondaryButton} mt-8 self-start`}
                  >
                    Solicitar demo
                  </button>
                </article>
              ))}
            </div>

            {/* El plan conjunto ocupa todo el ancho: no compite con los otros dos, los reúne. */}
            <article
              aria-labelledby="plan-both"
              className="mt-6 grid gap-8 rounded-2xl border-2 border-accent bg-[var(--content-surface)] p-6 sm:p-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center"
            >
              <div>
                <h3 id="plan-both" className="font-display text-2xl font-semibold">
                  Tickets + Mantenimiento
                </h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--content-ink-dim)]">
                  Los dos, conectados: un ticket abre la orden del equipo afectado.
                </p>
                <button type="button" onClick={() => openDemo("both")} className={`${primaryButton} mt-6`}>
                  Solicitar demo
                </button>
              </div>
              <ol aria-label="Del ticket a la orden de trabajo" className="flex flex-col sm:flex-row sm:items-center">
                {CHAIN.map((link, index) => (
                  <li key={link.ref} className="flex flex-col sm:flex-1 sm:flex-row sm:items-center">
                    {index > 0 && (
                      <span aria-hidden="true" className="ml-6 h-4 w-px bg-accent/50 sm:ml-0 sm:h-px sm:w-5 sm:shrink-0" />
                    )}
                    <span className="flex-1 rounded-xl border border-[var(--content-border)] bg-[var(--content-bg)] px-4 py-3">
                      <span className="block text-xs font-semibold tracking-wide text-accent-ink">{link.ref}</span>
                      <span className="mt-0.5 block text-sm font-medium">{link.label}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </article>
          </div>
        </section>

        {/* ── Cierre: la misma plancha de la portada abre y cierra la página ── */}
        <section aria-labelledby="cierre-titulo" className="px-2 pb-2 sm:px-4 sm:pb-4">
          <div className="relative isolate overflow-hidden rounded-3xl bg-[linear-gradient(155deg,#2c2640_0%,#221f2c_45%,#1a1722_100%)] ring-1 ring-white/12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-56 -left-40 -z-10 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(closest-side,rgba(181,163,207,0.24),rgba(88,71,157,0.1)_55%,transparent)]"
            />
            {/* La marca, grande y recortada por el borde: firma la página, no informa. */}
            <img
              src={logoIconWhite}
              alt=""
              aria-hidden="true"
              width={688}
              height={649}
              loading="lazy"
              className="pointer-events-none absolute -right-16 top-1/2 -z-10 hidden h-auto w-[26rem] -translate-y-1/2 opacity-[0.07] md:block"
            />
            <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
              <h2
                id="cierre-titulo"
                className="max-w-2xl font-display text-3xl font-semibold leading-tight tracking-tight text-panel-ink md:text-5xl"
              >
                Empieza por el módulo que más te urge.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-panel-ink-dim">
                En la demo recorres Tickets y Mantenimiento con datos de ejemplo. Después eliges uno, o los dos.
              </p>
              <button
                type="button"
                onClick={() => openDemo()}
                className="mt-9 inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 text-[0.9375rem] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(88,71,157,0.8)] transition-colors hover:bg-accent-dim"
              >
                Solicitar demo
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--content-border)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <LogoLockup className="h-7 w-auto" />
            <p className="mt-2 text-sm text-[var(--content-ink-dim)]">© 2026 Tekzaya</p>
          </div>
          <nav aria-label="Pie de página">
            <ul className="flex flex-wrap gap-x-2 gap-y-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-[var(--content-ink-dim)] transition-colors hover:text-[var(--content-ink)]"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  to="/ingresar"
                  className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-[var(--content-ink-dim)] transition-colors hover:text-[var(--content-ink)]"
                >
                  Iniciar sesión
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>

      <DemoRequestDialog open={demo.open} initialModule={demo.module} onClose={closeDemo} />
    </div>
  );
}
