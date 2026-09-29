import { describe, expect, it } from "vitest";
import { DEFAULT_SLA_POLICIES } from "../settings";
import {
  addBusinessMinutes,
  businessMinutesBetween,
  computeSlaTargets,
  shiftTargets,
  slaStateAt,
  worstSlaState,
  type BusinessCalendar,
} from "./index";

// Bolivia no aplica horario de verano: los casos base quedan libres de esa variable.
const laPaz: BusinessCalendar = {
  hours: { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00", timezone: "America/La_Paz" },
  holidays: [],
};

/** Reloj de pared de La Paz (UTC−4) expresado como instante UTC. */
function laPazTime(iso: string): Date {
  return new Date(`${iso}-04:00`);
}

describe("addBusinessMinutes", () => {
  it("suma dentro de la misma jornada", () => {
    // Miércoles 10:00 + 2 h = 12:00 del mismo día
    const result = addBusinessMinutes(laPazTime("2026-09-16T10:00"), 120, laPaz);
    expect(result.toISOString()).toBe(laPazTime("2026-09-16T12:00").toISOString());
  });

  it("empieza a contar en la apertura si el ticket entra de madrugada", () => {
    // Miércoles 03:00 → el reloj arranca a las 08:00, así que 1 h vence a las 09:00
    const result = addBusinessMinutes(laPazTime("2026-09-16T03:00"), 60, laPaz);
    expect(result.toISOString()).toBe(laPazTime("2026-09-16T09:00").toISOString());
  });

  it("pasa al día siguiente cuando llega fuera de hora", () => {
    // Miércoles 19:30 → jueves 08:00 + 30 min
    const result = addBusinessMinutes(laPazTime("2026-09-16T19:30"), 30, laPaz);
    expect(result.toISOString()).toBe(laPazTime("2026-09-17T08:30").toISOString());
  });

  it("parte la jornada y continúa al día siguiente", () => {
    // Miércoles 17:00, quedan 60 min de jornada; 3 h → jueves 10:00
    const result = addBusinessMinutes(laPazTime("2026-09-16T17:00"), 180, laPaz);
    expect(result.toISOString()).toBe(laPazTime("2026-09-17T10:00").toISOString());
  });

  it("salta el fin de semana", () => {
    // Viernes 17:00 + 2 h → lunes 09:00 (1 h el viernes, 1 h el lunes)
    const result = addBusinessMinutes(laPazTime("2026-09-18T17:00"), 120, laPaz);
    expect(result.toISOString()).toBe(laPazTime("2026-09-21T09:00").toISOString());
  });

  it("un ticket creado el sábado arranca el lunes", () => {
    const result = addBusinessMinutes(laPazTime("2026-09-19T11:00"), 60, laPaz);
    expect(result.toISOString()).toBe(laPazTime("2026-09-21T09:00").toISOString());
  });

  it("salta los festivos configurados", () => {
    const conFestivo: BusinessCalendar = { ...laPaz, holidays: ["2026-09-17"] };
    // Miércoles 17:00 + 2 h, con el jueves festivo → viernes 09:00
    const result = addBusinessMinutes(laPazTime("2026-09-16T17:00"), 120, conFestivo);
    expect(result.toISOString()).toBe(laPazTime("2026-09-18T09:00").toISOString());
  });

  it("reparte un plazo largo en varias jornadas", () => {
    // 72 h de "Baja" = 7 jornadas completas (10 h) + 2 h
    const result = addBusinessMinutes(laPazTime("2026-09-16T08:00"), 72 * 60, laPaz);
    expect(result.toISOString()).toBe(laPazTime("2026-09-25T10:00").toISOString());
  });

  it("se detiene justo al cierre sin desbordar al día siguiente", () => {
    const result = addBusinessMinutes(laPazTime("2026-09-16T16:00"), 120, laPaz);
    expect(result.toISOString()).toBe(laPazTime("2026-09-16T18:00").toISOString());
  });

  it("avisa en vez de colgarse si no hay ningún día laborable", () => {
    const imposible: BusinessCalendar = { ...laPaz, hours: { ...laPaz.hours, days: [] } };
    expect(() => addBusinessMinutes(laPazTime("2026-09-16T10:00"), 60, imposible)).toThrow(
      /businessHours/,
    );
  });
});

describe("cambio de horario de verano", () => {
  // Madrid adelanta el reloj el domingo 29/03/2026: la jornada del lunes sigue
  // siendo de 10 h aunque ese fin de semana el día durase 23 h.
  const madrid: BusinessCalendar = {
    hours: { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00", timezone: "Europe/Madrid" },
    holidays: [],
  };

  it("mantiene la jornada completa tras el salto", () => {
    const viernes = new Date("2026-03-27T15:00:00+01:00"); // 15:00 en Madrid
    // Quedan 3 h el viernes; 5 h → lunes 10:00 (ya en horario de verano, +02:00)
    const result = addBusinessMinutes(viernes, 5 * 60, madrid);
    expect(result.toISOString()).toBe(new Date("2026-03-30T10:00:00+02:00").toISOString());
  });

  it("cuenta 10 h laborables en el lunes del cambio", () => {
    const lunes = new Date("2026-03-30T00:00:00+02:00");
    const martes = new Date("2026-03-31T00:00:00+02:00");
    expect(businessMinutesBetween(lunes, martes, madrid)).toBe(600);
  });
});

describe("businessMinutesBetween", () => {
  it("ignora el tiempo fuera de jornada", () => {
    const from = laPazTime("2026-09-16T17:00");
    const to = laPazTime("2026-09-17T09:00");
    // 1 h el miércoles + 1 h el jueves; la noche no cuenta
    expect(businessMinutesBetween(from, to, laPaz)).toBe(120);
  });

  it("devuelve cero si el fin es anterior al inicio", () => {
    expect(
      businessMinutesBetween(laPazTime("2026-09-17T09:00"), laPazTime("2026-09-16T09:00"), laPaz),
    ).toBe(0);
  });

  it("no cuenta un fin de semana entero", () => {
    const viernes = laPazTime("2026-09-18T18:00");
    const lunes = laPazTime("2026-09-21T08:00");
    expect(businessMinutesBetween(viernes, lunes, laPaz)).toBe(0);
  });
});

describe("estados del SLA", () => {
  const urgente = DEFAULT_SLA_POLICIES.urgent; // 15 min de respuesta

  it("marca en riesgo al consumir el 75 % del plazo", () => {
    const creado = laPazTime("2026-09-16T10:00");
    const targets = computeSlaTargets(creado, urgente.responseMinutes, laPaz);

    expect(slaStateAt(laPazTime("2026-09-16T10:05"), targets)).toBe("on_time");
    // 15 min × 0,75 = 11,25 → riesgo desde el minuto 11
    expect(slaStateAt(laPazTime("2026-09-16T10:11"), targets)).toBe("at_risk");
    expect(slaStateAt(laPazTime("2026-09-16T10:16"), targets)).toBe("breached");
  });

  it("congela el veredicto cuando ya se respondió", () => {
    const creado = laPazTime("2026-09-16T10:00");
    const targets = computeSlaTargets(creado, urgente.responseMinutes, laPaz);
    const aTiempo = { ...targets, completedAt: laPazTime("2026-09-16T10:10") };
    const tarde = { ...targets, completedAt: laPazTime("2026-09-16T10:40") };

    // Aunque se consulte días después, el resultado no cambia
    const muchoDespues = laPazTime("2026-09-30T10:00");
    expect(slaStateAt(muchoDespues, aTiempo)).toBe("on_time");
    expect(slaStateAt(muchoDespues, tarde)).toBe("breached");
  });

  it("no vence de noche: el plazo se estira hasta la jornada siguiente", () => {
    // Creado a las 17:50 con 15 min de plazo: vence a las 08:05 del día siguiente
    const targets = computeSlaTargets(laPazTime("2026-09-16T17:50"), 15, laPaz);
    expect(targets.dueAt.toISOString()).toBe(laPazTime("2026-09-17T08:05").toISOString());
    expect(slaStateAt(laPazTime("2026-09-16T21:00"), targets)).toBe("on_time");
  });
});

describe("pausa por 'En espera'", () => {
  it("corre el plazo el tiempo laborable que estuvo pausado", () => {
    const creado = laPazTime("2026-09-16T09:00");
    const targets = computeSlaTargets(creado, 8 * 60, laPaz); // Alta: 8 h → 17:00

    expect(targets.dueAt.toISOString()).toBe(laPazTime("2026-09-16T17:00").toISOString());

    // Dos horas esperando al solicitante
    const conPausa = shiftTargets(
      targets,
      laPazTime("2026-09-16T10:00"),
      laPazTime("2026-09-16T12:00"),
      laPaz,
    );
    expect(conPausa.dueAt.toISOString()).toBe(laPazTime("2026-09-17T09:00").toISOString());
  });

  it("una pausa fuera de jornada no regala tiempo", () => {
    const targets = computeSlaTargets(laPazTime("2026-09-16T09:00"), 8 * 60, laPaz);
    const conPausa = shiftTargets(
      targets,
      laPazTime("2026-09-16T19:00"),
      laPazTime("2026-09-16T23:00"),
      laPaz,
    );
    expect(conPausa.dueAt.toISOString()).toBe(targets.dueAt.toISOString());
  });
});

describe("worstSlaState", () => {
  it("se queda con el peor de los dos relojes", () => {
    expect(worstSlaState("on_time", "breached")).toBe("breached");
    expect(worstSlaState("at_risk", "on_time")).toBe("at_risk");
    expect(worstSlaState("on_time", "on_time")).toBe("on_time");
  });
});
