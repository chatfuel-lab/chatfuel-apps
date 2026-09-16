/**
 * The numbers, with nothing on screen: which bookings count as money, how a
 * period is cut in the salon's own time zone, and what an export looks like.
 * The product's rule is kept: revenue is the service price of bookings that
 * were not cancelled; a cancelled or missed booking is counted, not billed.
 */
import { BookingStatus } from "~api/generated/bookings/graphql";
import { toZoneIso, wallClockIn, wallClockToInstant } from "~ui/lib/time/timezone";
import type { AppLanguage } from "./language";

export type PeriodPreset = "TODAY" | "YESTERDAY" | "LAST_7_DAYS" | "LAST_30_DAYS" | "THIS_MONTH" | "LAST_MONTH" | "LAST_3_MONTHS";
export const PERIODS: PeriodPreset[] = ["TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_30_DAYS", "THIS_MONTH", "LAST_MONTH", "LAST_3_MONTHS"];

export interface Range { startMs: number; endMs: number; fromDay: string; toDay: string }

const pad2 = (n: number) => String(n).padStart(2, "0");
const dayKey = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
const startOf = (y: number, m: number, d: number, zone: string) => wallClockToInstant({ year: y, month: m, day: d }, zone);
const endOf = (y: number, m: number, d: number, zone: string) => wallClockToInstant({ year: y, month: m, day: d, hour: 23, minute: 59, second: 59 }, zone) + 999;
const shiftDays = (y: number, m: number, d: number, by: number) => { const t = new Date(Date.UTC(y, m - 1, d + by)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The period as wall-clock days in the salon's zone, then as instants. */
export function periodRange(preset: PeriodPreset, now: number, zone: string): Range {
  const t = wallClockIn(now, zone);
  let a = { y: t.year, m: t.month, d: t.day };
  let b = { y: t.year, m: t.month, d: t.day };
  switch (preset) {
    case "YESTERDAY": a = b = shiftDays(t.year, t.month, t.day, -1); break;
    case "LAST_7_DAYS": a = shiftDays(t.year, t.month, t.day, -6); break;
    case "LAST_30_DAYS": a = shiftDays(t.year, t.month, t.day, -29); break;
    case "THIS_MONTH": a = { y: t.year, m: t.month, d: 1 }; break;
    case "LAST_MONTH": { const m = t.month === 1 ? 12 : t.month - 1; const y = t.month === 1 ? t.year - 1 : t.year; a = { y, m, d: 1 }; b = { y, m, d: daysInMonth(y, m) }; break; }
    case "LAST_3_MONTHS": { let m = t.month - 2, y = t.year; if (m < 1) { m += 12; y -= 1; } a = { y, m, d: 1 }; break; }
    default: break;
  }
  return { startMs: startOf(a.y, a.m, a.d, zone), endMs: endOf(b.y, b.m, b.d, zone), fromDay: dayKey(a.y, a.m, a.d), toDay: dayKey(b.y, b.m, b.d) };
}

/** What the bookings query takes: the bot zone's offset, never Z. */
export const apiTimes = (range: Range, zone: string) => ({ startTime: toZoneIso(range.startMs, zone), endTime: toZoneIso(range.endMs, zone) });

export interface BookingLike {
  status: BookingStatus | `${BookingStatus}`;
  startTime: string;
  service?: { title: string; price?: { amount: string; currency: string } | null } | null;
  specialist?: { profile: { firstName: string; lastName?: string | null } } | null;
  contact?: { name: string } | null;
  inlineContact?: { name: string } | null;
}

export const BILLED: ReadonlySet<string> = new Set([BookingStatus.Attended, BookingStatus.Confirmed, BookingStatus.Pending, BookingStatus.Reschedule]);
export const LOST: ReadonlySet<string> = new Set([BookingStatus.Canceled, BookingStatus.NoShow]);

export const priceOf = (b: BookingLike): number => Number(b.service?.price?.amount ?? 0) || 0;
export const personOf = (b: BookingLike): string => b.inlineContact?.name || b.contact?.name || "";
export const specialistOf = (b: BookingLike): string => b.specialist ? [b.specialist.profile.firstName, b.specialist.profile.lastName ?? ""].join(" ").trim() : "";

export interface Ranked { name: string; count: number; revenue: number }

export interface Summary {
  currency: string | null;
  revenue: number;
  billedCount: number;
  lostCount: number;
  withoutPrice: number;
  expenses: number;
  supplies: number;
  net: number;
  byService: Ranked[];
  bySpecialist: Ranked[];
  byClient: Ranked[];
}

const rank = (map: Map<string, Ranked>, by: keyof Ranked) => [...map.values()].sort((a, b) => Number(b[by]) - Number(a[by]) || a.name.localeCompare(b.name));
const bump = (map: Map<string, Ranked>, name: string, revenue: number) => {
  const key = name || "—";
  const row = map.get(key) ?? { name: key, count: 0, revenue: 0 };
  row.count += 1; row.revenue += revenue; map.set(key, row);
};

export function summarize(bookings: readonly BookingLike[], expenses: readonly { amount: string | number }[], supplies: readonly { cost: string | number }[]): Summary {
  let revenue = 0, billedCount = 0, lostCount = 0, withoutPrice = 0;
  let currency: string | null = null;
  const byService = new Map<string, Ranked>(), bySpecialist = new Map<string, Ranked>(), byClient = new Map<string, Ranked>();
  for (const b of bookings) {
    if (LOST.has(b.status)) { lostCount += 1; continue; }
    if (!BILLED.has(b.status)) continue;
    const price = priceOf(b);
    if (!b.service?.price) withoutPrice += 1;
    currency = currency ?? b.service?.price?.currency ?? null;
    revenue += price; billedCount += 1;
    bump(byService, b.service?.title ?? "", price);
    bump(bySpecialist, specialistOf(b), price);
    bump(byClient, personOf(b), price);
  }
  const spent = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const bought = supplies.reduce((s, e) => s + (Number(e.cost) || 0), 0);
  return {
    currency, revenue, billedCount, lostCount, withoutPrice, expenses: spent, supplies: bought, net: revenue - spent,
    byService: rank(byService, "revenue"), bySpecialist: rank(bySpecialist, "revenue"), byClient: rank(byClient, "revenue"),
  };
}

const LOCALE: Record<AppLanguage, string> = { es: "es-CL", pt: "pt-BR", en: "en-US" };
export function money(value: number, currency: string | null, language: AppLanguage): string {
  if (!currency) return new Intl.NumberFormat(LOCALE[language]).format(value);
  try { return new Intl.NumberFormat(LOCALE[language], { style: "currency", currency, maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value); }
  catch { return `${value} ${currency}`; }
}

/** RFC 4180-ish: quotes doubled, every field quoted, UTF-8 BOM so Excel reads accents. */
export function toCsv(header: readonly string[], rows: readonly (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export const todayKey = (now: number, zone: string): string => { const t = wallClockIn(now, zone); return dayKey(t.year, t.month, t.day); };
