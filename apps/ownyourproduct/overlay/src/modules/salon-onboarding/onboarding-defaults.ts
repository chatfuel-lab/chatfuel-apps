import { daysToSchedule, type SpecialistSchedule } from "./schema";

export const AGENDA_CONMIGO_DEFAULT_TIMEZONE = "America/Santiago";
export const AGENDA_CONMIGO_DEFAULT_COUNTRY = "CL";

/**
 * What a salon that has just finished onboarding looks like before anybody has
 * had a chance to tune it.
 *
 * Nothing here talks to the transport: these are the values the catalogue
 * commands fall back to, kept in one file so the numbers can be argued with
 * rather than hunted for.
 */

/**
 * The pilot's week: Monday to Friday 10:00-20:00, Saturday 10:00-19:00, Sunday
 * closed.
 *
 * This is a MEASUREMENT, not a guess. It is the shape of 7,660 real
 * appointments from the Chilean pilot Diego runs: the first booking of the day
 * lands after 10, the last one before 20 on weekdays and before 19 on
 * Saturday, and Sunday is empty. The generic 09:00-20:00 Monday-to-Saturday
 * default that `defaultSchedule()` hands the Profesionales form is a plausible
 * week rather than an observed one, and it offers a clienta two hours a day
 * the salon does not actually work — an hour the assistant promises and nobody
 * turns up for costs more than an hour it never offered.
 *
 * Sunday keeps a start and an end because `SpecialistDaySchedule.start`/`.end`
 * are non-null on the wire (SDL 3633); `enabled: false` is what closes it, and
 * the hours beside it are what the owner sees pre-filled if she ever opens the
 * day.
 */
export function pilotDefaultSchedule(): SpecialistSchedule {
  return daysToSchedule([
    { weekday: 0, isWorking: false, startTime: "10:00", endTime: "19:00", breaks: [] },
    { weekday: 1, isWorking: true, startTime: "10:00", endTime: "20:00", breaks: [] },
    { weekday: 2, isWorking: true, startTime: "10:00", endTime: "20:00", breaks: [] },
    { weekday: 3, isWorking: true, startTime: "10:00", endTime: "20:00", breaks: [] },
    { weekday: 4, isWorking: true, startTime: "10:00", endTime: "20:00", breaks: [] },
    { weekday: 5, isWorking: true, startTime: "10:00", endTime: "20:00", breaks: [] },
    { weekday: 6, isWorking: true, startTime: "10:00", endTime: "19:00", breaks: [] },
  ]);
}

/** One row of a price list the owner imported or picked from the presets. */
export interface ImportedServiceDraft {
  title: string;
  price: number;
  durationMinutes?: number;
  color?: string;
  legacyId?: string;
}

/**
 * Why `created` is false, because the two reasons are not the same news:
 * `already-created` means an earlier run of this command made her and the
 * retry found her; `team-not-empty` means somebody else was there first and
 * the owner was deliberately NOT added on top of them.
 */
export type FirstProfessionalOutcome =
  | "created"
  | "already-created"
  | "team-not-empty";

export interface FirstProfessionalResult {
  specialistId: string;
  created: boolean;
  outcome: FirstProfessionalOutcome;
  /** The services she performs after this command, in wire order. */
  goodsServiceIDs: string[];
}

/**
 * Who ended up performing the new services. `failed` is returned rather than
 * thrown because the services themselves are already saved: a salon whose team
 * list was momentarily unreachable must keep its catalogue and be told which
 * people still need the link, not lose the import.
 */
export interface TeamServiceLinkResult {
  serviceIds: string[];
  linked: string[];
  alreadyLinked: string[];
  failed: { specialistId: string; reason: string }[];
}

export interface ImportedCatalogResult {
  serviceIds: string[];
  team: TeamServiceLinkResult;
}
