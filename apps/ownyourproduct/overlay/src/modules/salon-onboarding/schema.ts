/**
 * The slice of the product's Chatfuel schema the onboarding logic needs:
 * specialist schedules and currency minor units. Pure types and helpers,
 * no transport. The wire shapes live in ~api/generated/bookings.
 */
export type HHmm = string;

export type GoodsItemPriceCurrency =
  | "USD" | "EUR" | "ARS" | "BOB" | "BRL" | "CLP" | "COP" | "CRC" | "DOP"
  | "GTQ" | "GYD" | "HNL" | "HTG" | "MXN" | "NIO" | "PAB" | "PEN" | "PYG"
  | "SRD" | "UYU";

const ZERO_DECIMAL_CURRENCIES: ReadonlySet<GoodsItemPriceCurrency> = new Set<GoodsItemPriceCurrency>([
  "CLP", "COP", "PYG",
]);

export function currencyDecimals(currency: GoodsItemPriceCurrency): 0 | 2 {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

export interface SpecialistDayScheduleBreak {
  start: HHmm;
  end: HHmm;
}

export interface SpecialistDaySchedule {
  enabled: boolean;
  start: HHmm;
  end: HHmm;
  break: SpecialistDayScheduleBreak | null;
}

export type WeekdayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export const WEEKDAY_KEYS: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface SpecialistSchedule {
  enabled: boolean;
  sun: SpecialistDaySchedule | null;
  mon: SpecialistDaySchedule | null;
  tue: SpecialistDaySchedule | null;
  wed: SpecialistDaySchedule | null;
  thu: SpecialistDaySchedule | null;
  fri: SpecialistDaySchedule | null;
  sat: SpecialistDaySchedule | null;
}

export interface SpecialistScheduleDay {
  weekday: number;
  isWorking: boolean;
  startTime: HHmm;
  endTime: HHmm;
  breaks: SpecialistDayScheduleBreak[];
}

export function scheduleToDays(schedule: SpecialistSchedule | null): SpecialistScheduleDay[] {
  return WEEKDAY_KEYS.map((key, weekday) => {
    const day = schedule ? schedule[key] : null;
    return {
      weekday,
      isWorking: !!schedule?.enabled && !!day?.enabled,
      startTime: day?.start ?? "09:00",
      endTime: day?.end ?? "20:00",
      breaks: day?.break ? [day.break] : [],
    };
  });
}

export function daysToSchedule(days: SpecialistScheduleDay[]): SpecialistSchedule {
  const out: SpecialistSchedule = {
    enabled: days.some((d) => d.isWorking),
    sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null,
  };
  for (const d of days) {
    const key = WEEKDAY_KEYS[d.weekday];
    if (!key) continue;
    out[key] = {
      enabled: d.isWorking,
      start: d.startTime,
      end: d.endTime,
      break: d.breaks[0] ?? null,
    };
  }
  return out;
}
