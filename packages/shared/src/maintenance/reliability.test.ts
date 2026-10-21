import { describe, expect, it } from "vitest";
import { businessMinutesBetween, type BusinessCalendar } from "../sla/businessTime";
import {
  availabilityPercent,
  businessClock,
  minutesInWindow,
  mtbfHours,
  mttrHours,
  repairEpisodes,
  statusIntervals,
} from "./reliability";

const calendar: BusinessCalendar = {
  hours: { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00", timezone: "America/La_Paz" },
  holidays: [],
};
/** La Paz es UTC-4 todo el año. */
const at = (iso: string) => new Date(`${iso}-04:00`);

// Una impresora que entra el lunes 2 de marzo a las 08:00, falla el viernes a las
// 17:00 y vuelve a funcionar el lunes 9 a las 09:00. La cuenta, a mano, en horas
// de jornada (08:00–18:00, lunes a viernes):
//   operativa: lun–jue 4 × 10 h + vie 08–17 9 h       = 49 h
//   parada:    vie 17–18 1 h + lun 08–09 1 h          =  2 h  (el fin de semana no cuenta)
//   operativa: lun 09–18 9 h + mar 10 h               = 19 h
// Ventana: del lunes 2 a las 00:00 al miércoles 11 a las 00:00.
const changes = [
  { status: "operational" as const, at: at("2026-03-02T08:00:00") },
  { status: "in_repair" as const, at: at("2026-03-06T17:00:00") },
  { status: "operational" as const, at: at("2026-03-09T09:00:00") },
];
const from = at("2026-03-02T00:00:00");
const to = at("2026-03-11T00:00:00");

describe("MTBF, MTTR y disponibilidad en horas laborables (plan A6)", () => {
  const clock = businessClock(calendar, from, to);
  const intervals = statusIntervals(changes, to);

  it("cuadran con la cuenta a mano, sin contar el fin de semana", () => {
    const operational = minutesInWindow(intervals, "operational", from, to, clock);
    const repair = minutesInWindow(intervals, "in_repair", from, to, clock);
    expect(operational).toBe(68 * 60);
    expect(repair).toBe(2 * 60);

    const episodes = repairEpisodes(intervals);
    expect(episodes).toHaveLength(1);
    expect(mtbfHours(operational, 1)).toBe(68);
    expect(mttrHours(episodes.map((episode) => clock(episode.from, episode.to)))).toBe(2);
    expect(availabilityPercent(operational, repair)).toBeCloseTo((68 / 70) * 100, 6);
  });

  it("un festivo no cuenta como tiempo operativo", () => {
    const holiday: BusinessCalendar = { ...calendar, holidays: ["2026-03-10"] };
    const withHoliday = businessClock(holiday, from, to);
    expect(minutesInWindow(intervals, "operational", from, to, withHoliday)).toBe(58 * 60);
  });

  it("la parada que sigue abierta no es todavía una reparación", () => {
    const open = statusIntervals(changes.slice(0, 2), to);
    expect(repairEpisodes(open)).toEqual([]);
    expect(mttrHours([])).toBeNull();
  });

  it("sin fallas no hay MTBF, y sin tiempo no hay disponibilidad", () => {
    expect(mtbfHours(600, 0)).toBeNull();
    expect(availabilityPercent(0, 0)).toBeNull();
  });

  it("dos tramos seguidos en el mismo estado son uno", () => {
    const repeated = statusIntervals([changes[0]!, { status: "operational", at: at("2026-03-03T12:00:00") }], to);
    expect(repeated).toHaveLength(1);
  });

  it("el reloj con caché da lo mismo que el motor del SLA", () => {
    const yearFrom = at("2026-01-01T00:00:00");
    const yearTo = at("2026-12-31T00:00:00");
    const year = businessClock(calendar, yearFrom, yearTo);
    const samples: [string, string][] = [
      ["2026-01-01T00:00:00", "2026-12-31T00:00:00"],
      ["2026-02-13T16:42:00", "2026-02-16T08:30:00"],
      ["2026-05-07T11:05:00", "2026-09-22T17:59:00"],
      ["2026-07-04T03:00:00", "2026-07-04T23:00:00"],
    ];
    for (const [a, b] of samples) {
      expect(year(at(a), at(b))).toBe(businessMinutesBetween(at(a), at(b), calendar));
    }
  });
});
