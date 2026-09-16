import { currencyDecimals, type GoodsItemPriceCurrency } from "./schema";

// Everything about a salon that follows from the country it stands in: the
// money it charges, the tax it declares, and the shape of a phone number.
//
// WHY THIS EXISTS: the product was cloned from a Chilean original, and Chile
// was baked in as a constant in four unrelated places — the currency stamped on
// every service sent to Chatfuel (schema.ts DEFAULT_CURRENCY), the grouping of
// every price on screen (ui/format.ts money), the VAT rate in the reports
// export, and the dial code on every phone field. A salon in Guadalajara typed
// 500 and its own booking bot quoted the client 500 Chilean pesos.
//
// The shape deliberately mirrors src/core/timezone.ts: a table keyed by the
// ISO-3166 alpha-2 code Nominatim and Chatfuel both already speak, a runtime
// value adopted when the salon's bot is read, and a fallback that leaves a
// Chilean salon behaving exactly as it did before any of this existed.

/** The pre-multi-country default. Only correct for Chile, and only by accident. */
export const LEGACY_FALLBACK_COUNTRY = "cl";

export type SalonLocale = {
  /** Country name in Spanish — the label in every country picker. */
  name: string;
  /** What Chatfuel stores against every price (SDL GoodsItemPriceCurrency). */
  currency: GoodsItemPriceCurrency;
  /** Digit grouping and decimal mark. */
  numberLocale: string;
  /** Minor units. CLP, COP and PYG have none; the rest have two. */
  decimals: 0 | 2;
  /** The glyph in front of an amount. */
  symbol: string;
  /**
   * Standard VAT on salon services, as a percentage, or null where there is no
   * national number to default to. Brazil taxes services municipally (ISS,
   * 2-5%) and the United States by state, so null means "the owner must type
   * it" rather than "zero".
   */
  ivaPercent: number | null;
  /** International dial code, written the way the phone field stores it. */
  dialCode: string;
  /**
   * Digit mask for a mobile number, one `x` per digit. The eleven countries the
   * original already shipped keep their exact masks — changing one would
   * reformat every stored phone on its next save.
   */
  phoneMask: string;
};

/**
 * The markets this product is sold in. Adding a country here is the whole cost
 * of supporting it: no other module names a country any more.
 */
export const COUNTRY_LOCALES: Record<string, SalonLocale> = {
  ar: { name: "Argentina", currency: "ARS", numberLocale: "es-AR", decimals: 2, symbol: "$", ivaPercent: 21, dialCode: "+54", phoneMask: "xxx xxxx-xxxx" },
  bo: { name: "Bolivia", currency: "BOB", numberLocale: "es-BO", decimals: 2, symbol: "Bs", ivaPercent: 13, dialCode: "+591", phoneMask: "xxxx xxxx" },
  br: { name: "Brasil", currency: "BRL", numberLocale: "pt-BR", decimals: 2, symbol: "R$", ivaPercent: null, dialCode: "+55", phoneMask: "xx xxxxx-xxxx" },
  cl: { name: "Chile", currency: "CLP", numberLocale: "es-CL", decimals: 0, symbol: "$", ivaPercent: 19, dialCode: "+56", phoneMask: "x xxxx xxxx" },
  co: { name: "Colombia", currency: "COP", numberLocale: "es-CO", decimals: 0, symbol: "$", ivaPercent: 19, dialCode: "+57", phoneMask: "xxx xxx xxxx" },
  cr: { name: "Costa Rica", currency: "CRC", numberLocale: "es-CR", decimals: 2, symbol: "₡", ivaPercent: 13, dialCode: "+506", phoneMask: "xxxx xxxx" },
  do: { name: "República Dominicana", currency: "DOP", numberLocale: "es-DO", decimals: 2, symbol: "RD$", ivaPercent: 18, dialCode: "+1", phoneMask: "(xxx) xxx-xxxx" },
  es: { name: "España", currency: "EUR", numberLocale: "es-ES", decimals: 2, symbol: "€", ivaPercent: 21, dialCode: "+34", phoneMask: "xxx xxx xxx" },
  ec: { name: "Ecuador", currency: "USD", numberLocale: "es-EC", decimals: 2, symbol: "$", ivaPercent: 15, dialCode: "+593", phoneMask: "xx xxx xxxx" },
  gt: { name: "Guatemala", currency: "GTQ", numberLocale: "es-GT", decimals: 2, symbol: "Q", ivaPercent: 12, dialCode: "+502", phoneMask: "xxxx xxxx" },
  hn: { name: "Honduras", currency: "HNL", numberLocale: "es-HN", decimals: 2, symbol: "L", ivaPercent: 15, dialCode: "+504", phoneMask: "xxxx-xxxx" },
  mx: { name: "México", currency: "MXN", numberLocale: "es-MX", decimals: 2, symbol: "$", ivaPercent: 16, dialCode: "+52", phoneMask: "xx xxxx xxxx" },
  ni: { name: "Nicaragua", currency: "NIO", numberLocale: "es-NI", decimals: 2, symbol: "C$", ivaPercent: 15, dialCode: "+505", phoneMask: "xxxx xxxx" },
  pa: { name: "Panamá", currency: "PAB", numberLocale: "es-PA", decimals: 2, symbol: "B/.", ivaPercent: 7, dialCode: "+507", phoneMask: "xxxx-xxxx" },
  pe: { name: "Perú", currency: "PEN", numberLocale: "es-PE", decimals: 2, symbol: "S/", ivaPercent: 18, dialCode: "+51", phoneMask: "xxx xxx xxx" },
  pr: { name: "Puerto Rico", currency: "USD", numberLocale: "es-PR", decimals: 2, symbol: "$", ivaPercent: 11.5, dialCode: "+1", phoneMask: "(xxx) xxx-xxxx" },
  py: { name: "Paraguay", currency: "PYG", numberLocale: "es-PY", decimals: 0, symbol: "₲", ivaPercent: 10, dialCode: "+595", phoneMask: "xxx xxxxxx" },
  sv: { name: "El Salvador", currency: "USD", numberLocale: "es-SV", decimals: 2, symbol: "$", ivaPercent: 13, dialCode: "+503", phoneMask: "xxxx xxxx" },
  us: { name: "Estados Unidos", currency: "USD", numberLocale: "en-US", decimals: 2, symbol: "$", ivaPercent: null, dialCode: "+1", phoneMask: "(xxx) xxx-xxxx" },
  uy: { name: "Uruguay", currency: "UYU", numberLocale: "es-UY", decimals: 2, symbol: "$U", ivaPercent: 22, dialCode: "+598", phoneMask: "xx xxx xxx" },
  ve: { name: "Venezuela", currency: "USD", numberLocale: "es-VE", decimals: 2, symbol: "$", ivaPercent: 16, dialCode: "+58", phoneMask: "xxx xxx-xxxx" },
};

/**
 * The salon whose session is open. A module value rather than a parameter on a
 * hundred call sites, for the same reason the timezone is one: there is exactly
 * one salon per browser, and it is known before any screen renders.
 */
let ACTIVE_COUNTRY: string = LEGACY_FALLBACK_COUNTRY;

/** ISO-3166 alpha-2, lowercase, of the country the salon stands in. */
export function salonCountry(): string {
  return ACTIVE_COUNTRY;
}

/** Everything that follows from that country. */
export function salonLocale(): SalonLocale {
  return COUNTRY_LOCALES[ACTIVE_COUNTRY] ?? COUNTRY_LOCALES[LEGACY_FALLBACK_COUNTRY];
}

/**
 * Point the product at `code`, returning whether it landed.
 *
 * An empty value resets to the fallback rather than being ignored: a bot with
 * no country must not inherit the previous salon's money after a workspace
 * switch. An unknown-but-present country is refused and changes nothing, so a
 * surprise from upstream degrades to the current country instead of inventing
 * a currency the wire enum may not even carry.
 */
export function setSalonCountry(code: string | null | undefined): boolean {
  const next = (code ?? "").trim().toLowerCase();
  if (!next) {
    ACTIVE_COUNTRY = LEGACY_FALLBACK_COUNTRY;
    return false;
  }
  if (!COUNTRY_LOCALES[next]) return false;
  ACTIVE_COUNTRY = next;
  return true;
}

/** Is this a country the product knows how to charge money in? */
export function isSupportedCountry(code: string | null | undefined): boolean {
  return !!COUNTRY_LOCALES[(code ?? "").trim().toLowerCase()];
}

/** Every country the pickers offer, in the name order the original used. */
export function supportedCountries(): Array<{ code: string; locale: SalonLocale }> {
  return Object.entries(COUNTRY_LOCALES)
    .map(([code, locale]) => ({ code, locale }))
    .sort((a, b) => a.locale.name.localeCompare(b.locale.name, "es"));
}

/**
 * The phone-prefix select's options.
 *
 * Deduplicated by dial code, because the select's value IS the dial code and
 * the stored phone is `"<dial code> <number>"` — two options sharing "+1" would
 * make the parse-back ambiguous and the select unselectable. The United States
 * wins that tie over the Dominican Republic on name order; both are NANP, so
 * the mask a Dominican owner gets is still her own.
 */
export function phoneCountries(): Array<{ code: string; name: string; dialCode: string; phoneMask: string }> {
  const seen = new Set<string>();
  const out: Array<{ code: string; name: string; dialCode: string; phoneMask: string }> = [];
  for (const { code, locale } of supportedCountries()) {
    if (seen.has(locale.dialCode)) continue;
    seen.add(locale.dialCode);
    out.push({ code, name: locale.name, dialCode: locale.dialCode, phoneMask: locale.phoneMask });
  }
  return out;
}

/**
 * An amount written the way this salon's customers read money.
 *
 * Never `Intl.NumberFormat(..., { style: "currency" })`: that prints "MX$500"
 * for a Mexican salon, and an owner writing her own price list does not think
 * of her pesos as foreign. The symbol comes from the table, the digits from the
 * locale.
 */
export function formatMoney(value: number | undefined, locale: SalonLocale = salonLocale()): string {
  // `|| 0` collapses -0 and NaN exactly as the Chilean-only original did, and
  // Math.round keeps its half-up rule on negatives (Intl rounds half away from
  // zero), so no Chilean salon sees a single character change.
  const n = (Number.isFinite(value) ? (value as number) : 0) || 0;
  const shown = locale.decimals === 0 ? Math.round(n) : n;
  const fractionDigits = Number.isInteger(shown) ? 0 : locale.decimals;
  return (
    locale.symbol +
    shown.toLocaleString(locale.numberLocale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
  );
}

export function parseMoneyInput(value: string, locale: SalonLocale = salonLocale()): number | null {
  const parts = new Intl.NumberFormat(locale.numberLocale).formatToParts(12345.6);
  const group = parts.find((part) => part.type === "group")?.value ?? "";
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  let normalized = value.trim().replace(/\s/g, "").replace(/[^\d.,-]/g, "");

  if (decimal !== "." && normalized.includes(decimal)) {
    if (group) normalized = normalized.split(group).join("");
    normalized = normalized.replace(decimal, ".");
  } else if (group === ".") {
    if (/^-?\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
      normalized = normalized.split(group).join("");
    }
  } else if (group) {
    normalized = normalized.split(group).join("");
  }

  const parsed = Number(normalized);
  return normalized && Number.isFinite(parsed) ? parsed : null;
}

/**
 * The "Ej: 56912345678" a phone field shows before anything is typed.
 *
 * It was Chile's in two screens and Venezuela's in a third — the original
 * author's own number shapes. An owner copies the shape she is shown, so the
 * example has to carry her country's code and her country's length.
 */
export function phoneExample(locale: SalonLocale = salonLocale()): string {
  const digits = (locale.phoneMask.match(/x/g) ?? []).length;
  // Mobile numbers in the region start with 9 far more often than not, and the
  // rest only has to look like a number.
  const body = Array.from({ length: digits }, (_, i) => (i === 0 ? 9 : i % 10)).join("");
  return locale.dialCode.replace("+", "") + body;
}

/**
 * The smallest amount this currency can express — the `step` of a price input.
 *
 * Takes a CURRENCY, not only the salon: a service written before the salon's
 * country was known carries its own currency, and offering a Mexican salon two
 * decimals for a row stored in CLP invites a fractional Chilean peso.
 */
export function priceStep(currency: GoodsItemPriceCurrency = salonLocale().currency): number {
  return currencyDecimals(currency) === 0 ? 1 : 0.01;
}

/** Round to the currency's own precision, so sums compare and display exactly. */
export function roundToCurrency(
  value: number,
  currency: GoodsItemPriceCurrency = salonLocale().currency,
): number {
  if (!Number.isFinite(value)) return 0;
  if (currencyDecimals(currency) === 0) return Math.round(value);
  return Math.round(value * 100) / 100;
}
