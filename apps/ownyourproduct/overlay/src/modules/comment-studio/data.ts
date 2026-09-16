import type {
  FuelyAutomation,
  FuelyAutomationScope,
  FuelySettingOf,
  FuelySettingTypename,
} from "./lib/fuely";

/** The base automation of a scope: the one Chatfuel ships, never deletable. */
export function baseOf(
  all: readonly FuelyAutomation[],
  scope: FuelyAutomationScope,
): FuelyAutomation | null {
  return all.find((a) => a.isBase && a.scope === scope) ?? null;
}

/** The custom automations (rules) of a scope. */
export function customsOf(
  all: readonly FuelyAutomation[],
  scope: FuelyAutomationScope,
): FuelyAutomation[] {
  return all.filter((a) => !a.isBase && a.scope === scope);
}

export function settingOf<T extends FuelySettingTypename>(
  automation: FuelyAutomation | null | undefined,
  typename: T,
): FuelySettingOf<T> | null {
  const hit = automation?.settings.find((s) => s.__typename === typename);
  return (hit as FuelySettingOf<T> | undefined) ?? null;
}
