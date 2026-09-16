import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";
import {
  COUNTRY_LOCALES,
  isSupportedCountry,
  roundToCurrency,
} from "./salon-locale";
import { countryLanguage, type AppLanguage } from "./language";
import {
  anchoredPrice,
  type PriceTier,
} from "./price-anchors";
import { countryForZone, isUsableZone } from "./timezone";
import { pilotDefaultSchedule } from "./onboarding-defaults";
import type { SpecialistDaySchedule, SpecialistSchedule, WeekdayKey } from "./schema";
import { buildSalonDraft, type DraftService, type SalonDraft } from "./draft-build";
import type { ImportedService } from "./imported-service";
import { RUBRO_PRESETS, type PresetRubro } from "./service-presets";

export const SETUP_STEPS = [
  "business",
  "categories",
  "services",
  "schedule",
  "review",
] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export const nextSetupStep = (
  current: SetupStep,
  returnToReview = false,
): SetupStep => {
  if (returnToReview && current !== "review") return "review";
  const index = SETUP_STEPS.indexOf(current);
  return SETUP_STEPS[Math.min(index + 1, SETUP_STEPS.length - 1)];
};
export type SetupIssue = {
  field: string;
  step: SetupStep;
  reason:
    | "required"
    | "phone"
    | "timezone"
    | "service"
    | "hours"
    | "team"
    | "deposit";
};

export function normalizedSetupPhone(
  value: string,
  country: string,
): string | null {
  try {
    const phone = parsePhoneNumberFromString(value, {
      defaultCountry: country.toUpperCase() as CountryCode,
      extract: false,
    });
    return phone?.isValid() ? phone.number : null;
  } catch {
    return null;
  }
}

export const defaultClientLanguage = (country: string): AppLanguage =>
  countryLanguage(country.trim().toLowerCase());

export const SETUP_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${hours}:${minutes}`;
});

const validSetupTime = (time: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

const nextSetupTime = (start: string): string => {
  const startIndex = SETUP_TIME_OPTIONS.indexOf(start);
  return SETUP_TIME_OPTIONS[Math.min(startIndex + 2, SETUP_TIME_OPTIONS.length - 1)] ?? "23:30";
};

export const updateSetupDayTime = (
  day: SpecialistDaySchedule,
  patch: { start?: string; end?: string },
): SpecialistDaySchedule => {
  const next = { ...day, ...patch };
  if (next.start >= next.end) next.end = nextSetupTime(next.start);
  return next;
};

export const repairSetupSchedule = (schedule: SpecialistSchedule): SpecialistSchedule => {
  const fallback = pilotDefaultSchedule();
  const next = { ...schedule };
  for (const key of ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as WeekdayKey[]) {
    const day = next[key];
    const fallbackDay = fallback[key];
    if (!fallbackDay) continue;
    if (!day) {
      next[key] = { ...fallbackDay };
    } else if (
      !validSetupTime(day.start) || !validSetupTime(day.end) || day.start >= day.end ||
      !SETUP_TIME_OPTIONS.includes(day.start) || !SETUP_TIME_OPTIONS.includes(day.end)
    ) {
      next[key] = { ...day, start: fallbackDay.start, end: fallbackDay.end };
    }
  }
  return next;
};

export function restoreServiceProvenance(
  service: DraftService,
  country: string,
  tier: PriceTier,
): DraftService {
  const preset = RUBRO_PRESETS[service.rubro]?.find(
    (item) => item.key === service.key,
  );
  const anchor = anchoredPrice(service.key, country, tier);
  return {
    ...service,
    priceEdited:
      service.priceEdited === true ||
      !(
        anchor !== null &&
        service.price === anchor.price &&
        (service.currency ?? anchor.currency) === anchor.currency
      ),
    detailsEdited:
      service.detailsEdited === true ||
      (!preset ||
        preset.name !== service.name ||
        preset.minutes !== service.durationMinutes),
  };
}

export function selectSetupCategories(
  draft: SalonDraft,
  categories: PresetRubro[],
): SalonDraft {
  const previous =
    draft.categories ?? [
      ...new Set(draft.services.map((service) => service.rubro)),
    ];
  const added = categories.filter((category) => !previous.includes(category));
  const suggestions = buildSalonDraft({
    businessName: draft.businessName,
    country: draft.country,
    timezone: draft.timezone,
    tier: draft.tier,
    rubros: added,
    solo: true,
    ownerName: "",
  }).services;
  const retained = draft.services.filter((service) => {
    const restored = restoreServiceProvenance(
      service,
      draft.country,
      draft.tier,
    );
    return (
      categories.includes(service.rubro) ||
      restored.priceEdited ||
      restored.detailsEdited
    );
  });
  const services = retained.concat(
    suggestions.filter(
      (service) =>
        !retained.some(
          (existing) =>
            existing.key === service.key ||
            serviceIdentity(existing.name) === serviceIdentity(service.name),
        ),
    ),
  );
  const serviceKeys = new Set(services.map((service) => service.key));
  const addedKeys = services
    .filter(
      (service) =>
        !draft.services.some((existing) => existing.key === service.key),
    )
    .map((service) => service.key);
  return {
    ...draft,
    categories,
    services,
    specialists: draft.specialists.map((person) => ({
      ...person,
      serviceKeys: [
        ...person.serviceKeys.filter((key) => serviceKeys.has(key)),
        ...addedKeys,
      ],
    })),
  };
}

export function forceSolo(draft: SalonDraft, ownerName: string): SalonDraft {
  const existingOwner =
    draft.specialists.find((person) => person.role === "owner") ??
    draft.savedOwner;
  const owner = {
    draftId: "owner",
    role: "owner" as const,
    name:
      existingOwner?.name.trim() ||
      ownerName.trim() ||
      draft.businessName.trim(),
    schedule: draft.schedule,
    serviceKeys: draft.services.map((service) => service.key),
  };
  const activeTeam = draft.specialists.filter(
    (person) => person.role !== "owner",
  );
  return {
    ...draft,
    teamMode: "solo",
    ownerServes: true,
    specialists: [owner],
    savedOwner: owner,
    savedTeam:
      draft.teamMode === "team" && activeTeam.length
        ? activeTeam
        : draft.savedTeam,
  };
}

export function retierServices(
  draft: SalonDraft,
  tier: PriceTier,
  country = draft.country,
): SalonDraft {
  const currency = COUNTRY_LOCALES[country]?.currency;
  return {
    ...draft,
    country,
    tier,
    policies: {
      ...draft.policies,
      depositAmount: currency
        ? roundToCurrency(draft.policies.depositAmount, currency)
        : draft.policies.depositAmount,
      depositCurrency: currency,
    },
    services: draft.services.map((service) => {
      const durationMinutes = normalizeServiceDuration(
        service.durationMinutes,
      );
      if (service.priceEdited)
        return {
          ...service,
          price: currency
            ? roundToCurrency(service.price, currency)
            : service.price,
          durationMinutes,
          currency,
        };
      const anchor = anchoredPrice(service.key, country, tier);
      return {
        ...service,
        price: anchor?.price ?? 0,
        durationMinutes,
        approximate: anchor?.approximate ?? true,
        priceSource: anchor?.source ?? "none",
        currency,
      };
    }),
  };
}

export const serviceIdentity = (name: string): string =>
  name.trim().normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ");

export const normalizeServiceDuration = (value: number): number =>
  Number.isFinite(value) ? Math.round(value / 15) * 15 : value;

export const setupAddress = (address: string, city: string): string => {
  const street = address.trim();
  const locality = city.trim();
  if (!street) return locality;
  if (!locality) return street;
  const normalizedStreet = serviceIdentity(street.replace(/,+$/, ""));
  const normalizedCity = serviceIdentity(locality);
  if (
    normalizedStreet === normalizedCity ||
    normalizedStreet.includes(normalizedCity)
  ) {
    return street;
  }
  return `${street}, ${locality}`;
};

const importCategory = (draft: SalonDraft): PresetRubro =>
  draft.categories?.[0] ?? draft.services[0]?.rubro ?? "uñas";

const importedService = (
  draft: SalonDraft,
  row: ImportedService,
  existing?: DraftService,
): DraftService => {
  const currency = COUNTRY_LOCALES[draft.country]?.currency;
  return {
    key: existing?.key ?? `import-${crypto.randomUUID()}`,
    name: existing?.name ?? row.name.trim(),
    price: currency ? roundToCurrency(row.price, currency) : row.price,
    durationMinutes: normalizeServiceDuration(row.durationMinutes),
    rubro: existing?.rubro ?? importCategory(draft),
    approximate: false,
    priceSource: "none",
    priceEdited: true,
    detailsEdited: true,
    imported: true,
    importedEdited: false,
    currency,
  };
};

export type ServiceListSnapshot = Pick<
  SalonDraft,
  "services" | "specialists" | "hasFallbackPrices"
>;

export const snapshotServiceList = (draft: SalonDraft): ServiceListSnapshot => ({
  services: draft.services.map((service) => ({ ...service })),
  specialists: draft.specialists.map((specialist) => ({
    ...specialist,
    serviceKeys: [...specialist.serviceKeys],
  })),
  hasFallbackPrices: draft.hasFallbackPrices,
});

export const restoreServiceList = (
  draft: SalonDraft,
  snapshot: ServiceListSnapshot,
): SalonDraft => ({
  ...draft,
  services: snapshot.services.map((service) => ({ ...service })),
  specialists: snapshot.specialists.map((specialist) => ({
    ...specialist,
    serviceKeys: [...specialist.serviceKeys],
  })),
  hasFallbackPrices: snapshot.hasFallbackPrices,
});

export function replaceDraftServices(
  draft: SalonDraft,
  rows: readonly ImportedService[],
): SalonDraft {
  const services = rows.map((row) => {
    const existing = draft.services.find(
      (service) => serviceIdentity(service.name) === serviceIdentity(row.name),
    );
    return importedService(draft, row, existing);
  });
  const serviceKeys = services.map((service) => service.key);
  return {
    ...draft,
    services,
    hasFallbackPrices: false,
    specialists: draft.specialists.map((person) => ({
      ...person,
      serviceKeys,
    })),
  };
}

export function mergeDraftServices(
  draft: SalonDraft,
  rows: readonly ImportedService[],
): SalonDraft {
  const services = [...draft.services];
  const addedKeys: string[] = [];
  for (const row of rows) {
    const index = services.findIndex(
      (service) => serviceIdentity(service.name) === serviceIdentity(row.name),
    );
    if (index >= 0) {
      const existing = services[index];
      const handEdited =
        existing.imported === true
          ? existing.importedEdited === true
          : existing.priceEdited === true || existing.detailsEdited === true;
      if (!handEdited) services[index] = importedService(draft, row, existing);
      continue;
    }
    const created = importedService(draft, row);
    services.push(created);
    addedKeys.push(created.key);
  }
  return {
    ...draft,
    services,
    hasFallbackPrices: services.some(
      (service) => service.priceSource === "fallback",
    ),
    specialists: draft.specialists.map((person) => ({
      ...person,
      serviceKeys: [...person.serviceKeys, ...addedKeys],
    })),
  };
}

export function setupIssues(
  draft: SalonDraft,
  phone: string,
  location: string,
): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const add = (field: string, step: SetupStep, reason: SetupIssue["reason"]) =>
    issues.push({ field, step, reason });
  if (!draft.businessName.trim()) add("businessName", "business", "required");
  if (!isSupportedCountry(draft.country)) add("country", "business", "required");
  if (!location.trim()) add("address", "business", "required");
  if (!normalizedSetupPhone(phone, draft.country))
    add("phone", "business", "phone");
  if (
    !isUsableZone(draft.timezone) ||
    countryForZone(draft.timezone) !== draft.country
  )
    add("timezone", "business", "timezone");
  const categories =
    draft.categories ?? [
      ...new Set(draft.services.map((service) => service.rubro)),
    ];
  if (!categories.length) add("categories", "categories", "required");
  if (!draft.services.length) add("services", "services", "service");
  const currency = COUNTRY_LOCALES[draft.country]?.currency;
  for (const service of draft.services) {
    if (
      !service.name.trim() ||
      !Number.isFinite(service.price) ||
      service.price <= 0 ||
      (currency !== undefined &&
        service.price !== roundToCurrency(service.price, currency)) ||
      !Number.isFinite(service.durationMinutes) ||
      service.durationMinutes < 15 ||
      service.durationMinutes > 1440 ||
      service.durationMinutes !==
        normalizeServiceDuration(service.durationMinutes) ||
      (service.currency && service.currency !== currency)
    )
      add(`service-${service.key}`, "services", "service");
  }
  const names = new Set<string>();
  const keys = new Set(draft.services.map((s) => s.key));
  if (
    !draft.specialists.length ||
    draft.specialists.some((person) => {
      const name = serviceIdentity(person.name);
      const duplicate = names.has(name);
      names.add(name);
      return (
        !name || duplicate || !person.serviceKeys.some((key) => keys.has(key))
      );
    }) ||
    draft.services.some(
      (s) => !draft.specialists.some((p) => p.serviceKeys.includes(s.key)),
    )
  )
    add("team", "schedule", "team");
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  if (
    !draft.schedule.enabled ||
    !days.some((key) => draft.schedule[key]?.enabled)
  )
    add("hours", "schedule", "hours");
  for (const day of days) {
    const hours = draft.schedule[day];
    if (
      hours?.enabled &&
      (!validSetupTime(hours.start) ||
        !validSetupTime(hours.end) ||
        hours.start >= hours.end)
    )
      add(`hours-${day}`, "schedule", "hours");
  }
  if (
    draft.policies.depositEnabled &&
    (!Number.isFinite(draft.policies.depositAmount) ||
      draft.policies.depositAmount <= 0 ||
      (currency !== undefined &&
        draft.policies.depositAmount !==
          roundToCurrency(draft.policies.depositAmount, currency)) ||
      draft.policies.depositCurrency !== currency)
  )
    add("deposit", "schedule", "deposit");
  return issues;
}
