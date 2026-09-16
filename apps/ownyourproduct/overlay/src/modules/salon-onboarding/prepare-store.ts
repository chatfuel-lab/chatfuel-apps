import type { ConfirmationCard } from "./confirmation";
import type { SalonDraft } from "./draft-build";
import { COUNTRY_LOCALES } from "./salon-locale";
import { repairSetupSchedule } from "./prepare-logic";

// Which of the six cards the owner has already agreed to, and whether the draft
// was ever written.
//
// Separate from `onboarding-draft.ts` on purpose: that store holds the
// Instagram wizard's own progress, and this holds the answer to one question —
// may the generated salon be published yet. Folding them together would mean a
// half-finished Instagram connection could unlock a write.

export interface PrepareState {
  version: 2;
  confirmed: ConfirmationCard[];
  /** Set once "Continuar" has written the draft, so it is never written twice. */
  published: boolean;
  draft: SalonDraft | null;
  address: string;
  phone: string;
  city?: string;
  step?: "business" | "categories" | "services" | "schedule" | "review";
  localeEdited?: boolean;
  languageEdited?: boolean;
  savedToProvider?: boolean;
}

const empty = (): PrepareState => ({
  version: 2,
  confirmed: [],
  published: false,
  draft: null,
  address: "",
  phone: "",
});

const storageKey = (botId: string): string => `agenda.prepare:${botId}`;

const restoreDraft = (draft: SalonDraft): SalonDraft => ({
  ...draft,
  schedule: repairSetupSchedule(draft.schedule),
  services: draft.services.map((service) => ({
    ...service,
    currency: service.currency ?? COUNTRY_LOCALES[draft.country]?.currency,
  })),
  policies: {
    ...draft.policies,
    depositCurrency: draft.policies.depositCurrency ?? COUNTRY_LOCALES[draft.country]?.currency,
  },
  specialists: draft.specialists.map((specialist, index) => {
    const restored = specialist as typeof specialist & {
      draftId?: string;
      role?: "owner" | "team";
    };
    const role = restored.role ?? (draft.ownerServes && index === 0 ? "owner" : "team");
    return {
      ...specialist,
      schedule: repairSetupSchedule(specialist.schedule),
      draftId: restored.draftId ?? (role === "owner" ? "owner" : `team-${index + 1}`),
      role,
    };
  }),
});

export const readPrepareState = (botId: string): PrepareState => {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(botId));
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<PrepareState>;
    if (!Array.isArray(parsed.confirmed)) return empty();
    return {
      version: 2,
      confirmed: parsed.confirmed.filter((c): c is ConfirmationCard => typeof c === "string"),
      published: parsed.published === true,
      draft: parsed.draft && typeof parsed.draft === "object"
        ? restoreDraft(parsed.draft as SalonDraft)
        : null,
      address: typeof parsed.address === "string" ? parsed.address : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      city: typeof parsed.city === "string" ? parsed.city : "",
      step: ["business", "categories", "services", "schedule", "review"].includes(parsed.step ?? "") ? parsed.step : "business",
      localeEdited: parsed.localeEdited === true,
      languageEdited: parsed.languageEdited === true,
      savedToProvider: parsed.savedToProvider === true,
    };
  } catch {
    return empty();
  }
};

export const savePrepareState = (botId: string, state: PrepareState): void => {
  try {
    globalThis.localStorage?.setItem(storageKey(botId), JSON.stringify(state));
  } catch {}
};

const content = (value: PrepareState) => JSON.stringify([value.draft, value.phone, value.address, value.city]);

export const savePrepareProgress = (botId: string, state: PrepareState): boolean => {
  const latest = readPrepareState(botId);
  if (
    latest.published ||
    (latest.savedToProvider === true && content(latest) !== content(state))
  ) {
    return false;
  }
  savePrepareState(botId, {
    ...state,
    published: false,
    savedToProvider:
      state.savedToProvider === true ||
      (latest.savedToProvider === true && content(latest) === content(state)),
  });
  return true;
};

export const publishPreparedState = async (
  botId: string,
  snapshot: PrepareState,
  publish: () => Promise<void>,
): Promise<boolean> => {
  const run = async (): Promise<boolean> => {
    const latest = readPrepareState(botId);
    if (
      latest.published ||
      latest.savedToProvider ||
      content(latest) !== content(snapshot)
    ) {
      return false;
    }
    await publish();
    return markPreparedSalonSaved(botId, snapshot);
  };
  const locks = globalThis.navigator?.locks;
  return locks
    ? locks.request(`agenda-prepare:${botId}`, { mode: "exclusive" }, run)
    : run();
};

export const markPreparedSalonSaved = (botId: string, snapshot: PrepareState): boolean => {
  const latest = readPrepareState(botId);
  if (content(latest) !== content(snapshot)) return false;
  savePrepareState(botId, { ...latest, savedToProvider: true });
  return true;
};

export const markPreparedSalonPublished = (botId: string, snapshot: PrepareState): boolean => {
  const latest = readPrepareState(botId);
  if (!latest.savedToProvider || content(latest) !== content(snapshot)) return false;
  savePrepareState(botId, { ...latest, published: true });
  return true;
};

export const markSavedPreparedSalonPublished = (botId: string): boolean => {
  const latest = readPrepareState(botId);
  if (!latest.savedToProvider) return false;
  savePrepareState(botId, { ...latest, published: true });
  return true;
};
