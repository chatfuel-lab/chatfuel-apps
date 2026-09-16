/**
 * The language this module's copy is rendered in.
 *
 * The scaffold has no language of its own, so the choice lives in this browser
 * (localStorage) and falls back to what the browser asks for; Spanish is the
 * default because the first salons are in LATAM.
 *
 * Same `defineCopy` / `live` contract as the product's core/language, so files
 * copied from the product compile unchanged.
 */
import { useSyncExternalStore } from "react";

export type AppLanguage = "es" | "pt" | "en";
export const APP_LANGUAGES: readonly AppLanguage[] = ["es", "pt", "en"];
export const DEFAULT_LANGUAGE: AppLanguage = "es";

const STORAGE_KEY = "oyp.language";
const EVENT = "oyp:language";

const isLanguage = (value: unknown): value is AppLanguage =>
  typeof value === "string" && (APP_LANGUAGES as readonly string[]).includes(value);

const fromTag = (tag: string | null | undefined): AppLanguage | null => {
  const short = (tag ?? "").trim().toLowerCase().slice(0, 2);
  return isLanguage(short) ? short : null;
};

/** The language she picked in this browser, if any. */
export function chosenLanguage(): AppLanguage | null {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

function browserLanguage(): AppLanguage | null {
  const nav = globalThis.navigator;
  if (!nav) return null;
  for (const tag of [...(nav.languages ?? []), nav.language]) {
    const hit = fromTag(tag);
    if (hit) return hit;
  }
  return null;
}

/** The language every sentence is rendered in right now. */
export function appLanguage(): AppLanguage {
  return chosenLanguage() ?? browserLanguage() ?? DEFAULT_LANGUAGE;
}

export function setAppLanguage(language: AppLanguage | null): void {
  try {
    if (language) globalThis.localStorage?.setItem(STORAGE_KEY, language);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // A private window that refuses storage still gets the language for this page.
  }
  if (typeof Event !== "undefined") globalThis.dispatchEvent?.(new Event(EVENT));
}

export function onLanguageChange(listener: () => void): () => void {
  globalThis.addEventListener?.(EVENT, listener);
  globalThis.addEventListener?.("storage", listener);
  return () => {
    globalThis.removeEventListener?.(EVENT, listener);
    globalThis.removeEventListener?.("storage", listener);
  };
}

/** The current language, re-rendering the component when it changes. */
export function useAppLanguage(): AppLanguage {
  return useSyncExternalStore(onLanguageChange, appLanguage, () => DEFAULT_LANGUAGE);
}

export type CopyTable<T> = { es: T } & Partial<Record<AppLanguage, T>>;

const TABLES = new Map<string, CopyTable<unknown>>();

/** Declare a table under a name, so a completeness test can find it. */
export function defineCopy<T>(name: string, table: CopyTable<T>): CopyTable<T> {
  TABLES.set(name, table);
  return table;
}

export function copyTables(): ReadonlyMap<string, CopyTable<unknown>> {
  return TABLES;
}

/** The table's strings in one language; Spanish fills what a translation lacks. */
export function copy<T>(table: CopyTable<T>, language: AppLanguage = appLanguage()): T {
  return (table[language] ?? table.es) as T;
}

/** A view of the table that always reads in the current language. */
export function live<T extends object>(table: CopyTable<T>): T {
  return new Proxy({} as T, {
    get: (_target, key) => (copy(table) as Record<string | symbol, unknown>)[key],
    has: (_target, key) => key in (copy(table) as object),
    ownKeys: () => Reflect.ownKeys(copy(table) as object),
    getOwnPropertyDescriptor: (_target, key) => {
      const descriptor = Object.getOwnPropertyDescriptor(copy(table) as object, key);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}

/** The language a salon in this country reads by default: Brazil Portuguese, the USA English, everyone else Spanish. */
export const LANGUAGE_BY_COUNTRY: Record<string, AppLanguage> = { br: "pt", us: "en" };
export function countryLanguage(country: string): AppLanguage {
  return LANGUAGE_BY_COUNTRY[(country || "").toLowerCase()] ?? DEFAULT_LANGUAGE;
}
export const isAppLanguage = (value: unknown): value is AppLanguage =>
  typeof value === "string" && (APP_LANGUAGES as readonly string[]).includes(value);
