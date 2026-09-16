/**
 * Writing a prepared salon into the bot, in the product's order: profile,
 * services, specialists, hours, rules, knowledge. Every step is idempotent by
 * name, so "Guardar" pressed twice, or a retry after a flaky connection, never
 * creates a second "Manicure" or a second owner. The plan is data first, so a
 * test can read it; the runner turns it into ~api mutations.
 */
import type { ModuleClient } from "~api";
import {
  BookingConfigSetConfirmationDocument,
  BookingConfigSetLocaleDocument,
  BookingServiceCreateDocument,
  BookingServicesDocument,
  BookingSpecialistCreateDocument,
  BookingSpecialistsDocument,
  DashboardLocale,
  type GoodsItemPriceCurrency as WireCurrency,
  type SpecialistDayScheduleInput,
  type SpecialistScheduleInput,
} from "~api/generated/bookings/graphql";
import {
  KbSetAdditionalInstructionsDocument,
  KbSetAddressDocument,
  KbSetBusinessHoursDocument,
  KbSetCompanyNameDocument,
  KbSetFaQsDocument,
  KbSetPhoneDocument,
  Weekday,
} from "~api/generated/knowledge-base/graphql";
import type { DraftService, DraftSpecialist, SalonDraft } from "./draft-build";
import { WRITE_ORDER, type WriteStep } from "./confirmation";
import { COUNTRY_LOCALES } from "./salon-locale";
import { currencyDecimals, WEEKDAY_KEYS, type SpecialistSchedule, type WeekdayKey } from "./schema";
import type { AppLanguage } from "./language";

export interface PublishInput {
  botId: string;
  draft: SalonDraft;
  phone: string;
  address: string;
  language: AppLanguage;
}

export type PublishStep =
  | { kind: "companyName"; value: string }
  | { kind: "phone"; value: string }
  | { kind: "address"; value: string }
  | { kind: "locale"; value: DashboardLocale }
  | { kind: "hours"; schedule: SpecialistSchedule }
  | { kind: "service"; key: string; title: string; durationSeconds: number; amount: string; currency: WireCurrency }
  | { kind: "specialist"; draftId: string; firstName: string; schedule: SpecialistSchedule; serviceKeys: string[] }
  | { kind: "faqs"; faqs: { question: string; answer: string }[] }
  | { kind: "instructions"; value: string }
  | { kind: "confirmation"; enabled: boolean };

export const stepOf = (step: PublishStep): WriteStep =>
  step.kind === "service" ? "services"
    : step.kind === "specialist" ? "specialists"
      : step.kind === "hours" ? "schedule"
        : step.kind === "faqs" ? "knowledge"
          : step.kind === "instructions" || step.kind === "confirmation" ? "rules"
            : "profile";

const LOCALE: Record<AppLanguage, DashboardLocale> = { es: DashboardLocale.Es, pt: DashboardLocale.Pt, en: DashboardLocale.En };
const WEEKDAY: Record<WeekdayKey, Weekday> = { sun: Weekday.Sun, mon: Weekday.Mon, tue: Weekday.Tue, wed: Weekday.Wed, thu: Weekday.Thu, fri: Weekday.Fri, sat: Weekday.Sat };

/** number → wire money: no fraction where the currency has no minor unit. */
export function amountOf(value: number, currency: string): string {
  const decimals = currencyDecimals(currency as Parameters<typeof currencyDecimals>[0]);
  return decimals === 0 ? String(Math.round(value)) : value.toFixed(2);
}

const POLICY_TEXT: Record<AppLanguage, (deposit: string | null, hours: number) => string> = {
  es: (d, h) => [d ? `Para reservar se pide un anticipo de ${d}; el cobro se confirma a mano.` : "No se pide anticipo para reservar.", `Se puede cancelar sin costo hasta ${h} horas antes de la cita.`].join(" "),
  pt: (d, h) => [d ? `Para reservar pede-se um sinal de ${d}; a cobrança é confirmada manualmente.` : "Não se pede sinal para reservar.", `Pode cancelar sem custo até ${h} horas antes do horário.`].join(" "),
  en: (d, h) => [d ? `A deposit of ${d} is asked to book; payment is confirmed by hand.` : "No deposit is asked to book.", `Cancellation is free up to ${h} hours before the appointment.`].join(" "),
};

export function planPublish(input: PublishInput): PublishStep[] {
  const { draft } = input;
  const currency = (draft.services[0]?.currency ?? COUNTRY_LOCALES[draft.country]?.currency ?? "USD") as WireCurrency;
  const steps: PublishStep[] = [];
  steps.push({ kind: "companyName", value: draft.businessName.trim() });
  if (input.phone.trim()) steps.push({ kind: "phone", value: input.phone.trim() });
  if (input.address.trim()) steps.push({ kind: "address", value: input.address.trim() });
  steps.push({ kind: "locale", value: LOCALE[input.language] });
  for (const s of draft.services) {
    steps.push({ kind: "service", key: s.key, title: s.name.trim(), durationSeconds: Math.max(5, Math.round(s.durationMinutes)) * 60, amount: amountOf(s.price, s.currency ?? currency), currency: (s.currency ?? currency) as WireCurrency });
  }
  for (const p of draft.specialists) {
    steps.push({ kind: "specialist", draftId: p.draftId, firstName: p.name.trim() || draft.businessName.trim(), schedule: p.schedule, serviceKeys: p.serviceKeys });
  }
  steps.push({ kind: "hours", schedule: draft.schedule });
  const deposit = draft.policies.depositEnabled && draft.policies.depositAmount > 0
    ? `${amountOf(draft.policies.depositAmount, draft.policies.depositCurrency ?? currency)} ${draft.policies.depositCurrency ?? currency}`
    : null;
  steps.push({ kind: "instructions", value: POLICY_TEXT[input.language](deposit, draft.policies.cancellationHours) });
  steps.push({ kind: "confirmation", enabled: true });
  if (draft.faq.length) steps.push({ kind: "faqs", faqs: draft.faq.map((f) => ({ question: f.question, answer: f.answer })) });
  return steps;
}

export function scheduleInput(schedule: SpecialistSchedule): SpecialistScheduleInput {
  const day = (key: WeekdayKey): SpecialistDayScheduleInput | undefined => {
    const d = schedule[key];
    if (!d) return undefined;
    return { enabled: d.enabled, start: d.start, end: d.end, break: d.break ? { start: d.break.start, end: d.break.end } : null };
  };
  return { enabled: schedule.enabled, sun: day("sun"), mon: day("mon"), tue: day("tue"), wed: day("wed"), thu: day("thu"), fri: day("fri"), sat: day("sat") };
}

export interface PublishReport {
  serviceIds: Record<string, string>;
  specialistIds: Record<string, string>;
  created: { services: number; specialists: number };
  reused: { services: number; specialists: number };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function runPublish(
  client: ModuleClient,
  input: PublishInput,
  onStep?: (step: WriteStep) => void,
): Promise<PublishReport> {
  const botID = input.botId;
  const steps = planPublish(input);
  const report: PublishReport = { serviceIds: {}, specialistIds: {}, created: { services: 0, specialists: 0 }, reused: { services: 0, specialists: 0 } };

  // What the bot already has, so a retry reuses instead of duplicating.
  const existing = await client.query(BookingServicesDocument, { botID });
  const byTitle = new Map<string, string>();
  for (const item of existing.bot?.goodsCatalog ?? []) {
    if (item.__typename === "GoodsService") byTitle.set(norm(item.title), item.id);
  }
  const people = await client.query(BookingSpecialistsDocument, { botID });
  const byName = new Map<string, string>();
  for (const p of people.bot?.specialists ?? []) byName.set(norm([p.profile.firstName, p.profile.lastName ?? ""].join(" ")), p.id);

  let announced: WriteStep | null = null;
  for (const step of steps) {
    const phase = stepOf(step);
    if (phase !== announced) { announced = phase; onStep?.(phase); }
    switch (step.kind) {
      case "companyName": await client.mutate(KbSetCompanyNameDocument, { botID, companyName: step.value }); break;
      case "phone": await client.mutate(KbSetPhoneDocument, { botID, phone: step.value }); break;
      case "address": await client.mutate(KbSetAddressDocument, { botID, address: step.value }); break;
      case "locale": await client.mutate(BookingConfigSetLocaleDocument, { botID, locale: step.value }); break;
      case "service": {
        const known = byTitle.get(norm(step.title));
        if (known) { report.serviceIds[step.key] = known; report.reused.services += 1; break; }
        const data = await client.mutate(BookingServiceCreateDocument, {
          botID,
          service: { title: step.title, description: "", durationSeconds: step.durationSeconds, isAvailable: true, price: { amount: step.amount, currency: step.currency }, images: [] },
        });
        const created = (data.goodsServiceCreate.goodsCatalog ?? []).find((i) => i.__typename === "GoodsService" && norm(i.title) === norm(step.title));
        if (!created || created.__typename !== "GoodsService") throw new Error(`Service "${step.title}" was not returned after creation`);
        byTitle.set(norm(step.title), created.id);
        report.serviceIds[step.key] = created.id;
        report.created.services += 1;
        break;
      }
      case "specialist": {
        const known = byName.get(norm(step.firstName));
        if (known) { report.specialistIds[step.draftId] = known; report.reused.specialists += 1; break; }
        const goodsServices = step.serviceKeys.map((k) => report.serviceIds[k]).filter((id): id is string => !!id);
        const data = await client.mutate(BookingSpecialistCreateDocument, {
          botID,
          info: { profile: { firstName: step.firstName }, schedule: scheduleInput(step.schedule), goodsServices },
        });
        const created = (data.specialistCreate.specialists ?? []).find((p) => norm([p.profile.firstName, p.profile.lastName ?? ""].join(" ")) === norm(step.firstName));
        if (!created) throw new Error(`Specialist "${step.firstName}" was not returned after creation`);
        byName.set(norm(step.firstName), created.id);
        report.specialistIds[step.draftId] = created.id;
        report.created.specialists += 1;
        break;
      }
      case "hours": {
        const workingHours = WEEKDAY_KEYS.map((key) => {
          const d = step.schedule[key];
          return { day: WEEKDAY[key], enabled: !!(step.schedule.enabled && d?.enabled), start: d?.start ?? "09:00", end: d?.end ?? "20:00" };
        });
        await client.mutate(KbSetBusinessHoursDocument, { botID, schedule: { workingHours } });
        break;
      }
      case "instructions": await client.mutate(KbSetAdditionalInstructionsDocument, { botID, additionalInstructions: step.value }); break;
      case "confirmation": await client.mutate(BookingConfigSetConfirmationDocument, { botID, enabled: step.enabled }); break;
      case "faqs": await client.mutate(KbSetFaQsDocument, { botID, faqs: step.faqs }); break;
    }
  }
  return report;
}

export { WRITE_ORDER };
export type { DraftService, DraftSpecialist };
