/**
 * The automation shapes this module reads, taken from the scaffold's generated
 * API so the wizard's Chatfuel version is the only source of truth.
 *
 * The generated types carry string ENUMS (`FuelyAutomationScope.All`), while
 * the product's code compares plain strings ("InstagramPostComments"). `Widen`
 * turns every enum in a record into its string-literal union, so a file copied
 * from the product compiles unchanged; `asAutomations` is the one cast, at the
 * point the list leaves the API. The runtime values are the same strings.
 */
import type {
  FuelyAutomationListQuery,
  FuelyAutomationScope as ScopeEnum,
  FuelySettingBookingRulesAutonomyLevel as AutonomyEnum,
} from "~api/generated/automations/graphql";

type Widen<T> = T extends string
  ? `${T}`
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : T extends object
      ? { [K in keyof T]: Widen<T[K]> }
      : T;

export type RawAutomation = FuelyAutomationListQuery["bot"]["fuelyAutomations"][number];
export type FuelyAutomation = Widen<RawAutomation>;
export type FuelyAutomationScope = `${ScopeEnum}`;
export type FuelySettingBookingRulesAutonomyLevel = `${AutonomyEnum}`;
export type FuelySetting = FuelyAutomation["settings"][number];
export type FuelySettingTypename = FuelySetting["__typename"];
export type FuelySettingOf<T extends FuelySettingTypename> = Extract<FuelySetting, { __typename: T }>;

export const asAutomations = (raw: readonly RawAutomation[]): FuelyAutomation[] =>
  raw as unknown as FuelyAutomation[];

/** Chatfuel's documented limits (SDL), the ones this module can hit. */
export const FUELY_LIMITS = {
  automationNameMax: 200,
  customAutomationsPerScope: 30,
  keywordsMax: 50,
  keywordMaxLength: 50,
  postsMax: 50,
  replyExactTextMax: 1000,
} as const;
