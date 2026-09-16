// Deriving the salon's wall clock from where the salon actually is.
//
// WHY NOT A LIBRARY: the only input we have is what Nominatim already returns
// for the address the owner picks — a country code and a state name. A
// lat/lon→IANA package would add a megabyte of polygon data to answer a
// question that a country code answers for every LATAM country except three.
// Mexico, Brazil and Chile are the three, and they are handled by state.
//
// WHY NOT THE BROWSER: a Chilean owner travelling, or a founder demoing from
// California, would silently re-timezone the salon. The address is the salon;
// the browser is wherever the phone is standing.
//
// Instants are stored absolute (UTC), so this zone decides how a stored instant
// is rendered as a wall clock — which means a booking made under the WRONG zone
// redisplays at the wrong time once the right zone arrives. That is why
// `isDerivedZone` exists: the caller must be able to tell a real answer from
// the historical Santiago default before it writes a booking.

/** The pre-multi-country default. Only correct for Chile, and only by accident. */
export const LEGACY_FALLBACK_ZONE = "America/Santiago";

/** One zone per country — correct for every country not in STATE_ZONES. */
const COUNTRY_ZONES: Record<string, string> = {
  ar: "America/Argentina/Buenos_Aires",
  bo: "America/La_Paz",
  br: "America/Sao_Paulo",
  cl: "America/Santiago",
  co: "America/Bogota",
  cr: "America/Costa_Rica",
  do: "America/Santo_Domingo",
  // NOTE: every country here must also exist in COUNTRY_LOCALES — a zone we can
  // derive but cannot price sends the salon to the Chilean fallback and stamps
  // CLP on its whole price list. tests/salon-locale.test.ts holds that line.
  ec: "America/Guayaquil",
  es: "Europe/Madrid",  // Canarias is the one exception; STATE_ZONES covers it
  gt: "America/Guatemala",
  hn: "America/Tegucigalpa",
  mx: "America/Mexico_City",
  ni: "America/Managua",
  pa: "America/Panama",
  pe: "America/Lima",
  pr: "America/Puerto_Rico",
  py: "America/Asuncion",
  sv: "America/El_Salvador",
  uy: "America/Montevideo",
  ve: "America/Caracas",
};

// Only the states that DIFFER from their country's default are listed; anything
// unlisted correctly falls through to COUNTRY_ZONES. Keys are normalised (see
// `normalise`), so accents and the "Estado de"/"Región de" prefixes Nominatim
// attaches do not have to be reproduced exactly.
const STATE_ZONES: Record<string, Record<string, string>> = {
  mx: {
    "quintana roo": "America/Cancun",
    "baja california": "America/Tijuana",
    "baja california sur": "America/Mazatlan",
    nayarit: "America/Mazatlan",
    sinaloa: "America/Mazatlan",
    chihuahua: "America/Chihuahua",
    sonora: "America/Hermosillo",
  },
  br: {
    acre: "America/Rio_Branco",
    amazonas: "America/Manaus",
    roraima: "America/Boa_Vista",
    rondonia: "America/Porto_Velho",
    "mato grosso": "America/Cuiaba",
    "mato grosso do sul": "America/Campo_Grande",
  },
  cl: {
    magallanes: "America/Punta_Arenas",
    "isla de pascua": "Pacific/Easter",
  },
  es: {
    canarias: "Atlantic/Canary",
  },
};

/** Lowercase, strip accents, drop the administrative prefixes Nominatim adds. */
const normalise = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(estado|provincia|region|departamento|de|del|la|las|los|y)\b/g, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The zone for a place, or null when the country is unknown to us — null is a
 * real answer meaning "ask the owner", not an error.
 *
 * `state` is consulted only for the three countries that span zones. Matching is
 * longest-key-first so "baja california sur" never resolves as "baja california".
 */
export function zoneForPlace(place: { countryCode?: string | null; state?: string | null }): string | null {
  const country = (place.countryCode ?? "").trim().toLowerCase();
  if (!country || !COUNTRY_ZONES[country]) return null;
  const states = STATE_ZONES[country];
  const state = place.state ? normalise(place.state) : "";
  if (states && state) {
    const keys = Object.keys(states).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (state === key || state.includes(key)) return states[key];
    }
  }
  return COUNTRY_ZONES[country];
}

/**
 * Zones no address can derive, but an owner may still need to pick.
 *
 * The United States spans four zones with no state table here, so
 * `zoneForPlace` correctly refuses to guess — which left a salon in Miami with
 * no way to say where it is. The picker is that way.
 */
const MANUAL_ONLY_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

/** Every zone this module can produce — the allowlist for a manual override. */
export function supportedZones(): string[] {
  const zones = new Set(Object.values(COUNTRY_ZONES));
  for (const states of Object.values(STATE_ZONES)) {
    for (const zone of Object.values(states)) zones.add(zone);
  }
  for (const zone of MANUAL_ONLY_ZONES) zones.add(zone);
  return [...zones].sort();
}

/** Does this zone exist as far as the platform's own date machinery is concerned? */
export function isUsableZone(zone: string | null | undefined): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the salon's zone was actually established, rather than inherited from
 * the pre-multi-country default.
 *
 * Chile is the honest edge: a Chilean salon's real zone IS America/Santiago, so
 * this cannot distinguish it from an unset one by value alone. The caller passes
 * `confirmed` (the owner picked an address or an override) to settle that.
 */
export function isDerivedZone(zone: string | null | undefined, confirmed = false): boolean {
  if (!isUsableZone(zone)) return false;
  return zone !== LEGACY_FALLBACK_ZONE || confirmed;
}

/**
 * Zones that belong to a country the tables above do not otherwise name. The
 * tables answer "where should this salon's clock be?"; this answers the reverse
 * question — "what country is a salon on this clock standing in?" — for which
 * every zone of a country counts, not just its canonical one.
 *
 * The browser hands us whichever zone the phone happens to be set to, and
 * "America/Monterrey" is as Mexican as "America/Mexico_City".
 */
const EXTRA_ZONE_COUNTRIES: Record<string, string> = {
  "america/monterrey": "mx",
  "america/merida": "mx",
  "america/matamoros": "mx",
  "america/bahia_banderas": "mx",
  "america/ojinaga": "mx",
  "america/ciudad_juarez": "mx",
  "america/fortaleza": "br",
  "america/recife": "br",
  "america/bahia": "br",
  "america/belem": "br",
  "america/maceio": "br",
  "america/araguaina": "br",
  "america/santarem": "br",
  "america/eirunepe": "br",
  "america/noronha": "br",
  "america/new_york": "us",
  "america/detroit": "us",
  "america/chicago": "us",
  "america/denver": "us",
  "america/boise": "us",
  "america/phoenix": "us",
  "america/los_angeles": "us",
  "america/anchorage": "us",
  "pacific/honolulu": "us",
};

/** Zone families where every member belongs to one country. */
const ZONE_PREFIX_COUNTRIES: Array<[string, string]> = [
  ["america/argentina/", "ar"],
  ["america/indiana/", "us"],
  ["america/kentucky/", "us"],
  ["america/north_dakota/", "us"],
];

const ZONE_COUNTRIES: Record<string, string> = (() => {
  const map: Record<string, string> = { ...EXTRA_ZONE_COUNTRIES };
  for (const [country, zone] of Object.entries(COUNTRY_ZONES)) map[zone.toLowerCase()] = country;
  for (const [country, states] of Object.entries(STATE_ZONES)) {
    for (const zone of Object.values(states)) map[zone.toLowerCase()] = country;
  }
  return map;
})();

/**
 * The country a salon on this clock stands in, or null when we cannot tell.
 *
 * This is how the salon's country survives without a home upstream: Chatfuel
 * stores `bot.timezone` (and we set it at provisioning from the owner's own
 * browser), but has no field we may write a country into. The zone is therefore
 * the durable record of where the salon is, and the currency, the VAT default
 * and the phone prefix are all read back out of it.
 *
 * Null is a real answer meaning "keep what we have", never an error.
 */
export function countryForZone(zone: string | null | undefined): string | null {
  const key = (zone ?? "").trim().toLowerCase();
  if (!key) return null;
  if (ZONE_COUNTRIES[key]) return ZONE_COUNTRIES[key];
  for (const [prefix, country] of ZONE_PREFIX_COUNTRIES) {
    if (key.startsWith(prefix)) return country;
  }
  return null;
}

/**
 * The zone to propose for a salon whose country the owner has just picked. The
 * device may sharpen the answer; it may never overrule it.
 *
 * WHY THE DEVICE CANNOT DECIDE: `countryForZone` reads the country back out of
 * the zone, because Chatfuel has nowhere to store a country — so the zone is
 * the durable record of where the salon stands, and the currency, the VAT
 * default and the phone prefix all follow from it. Under a device-first rule a
 * founder demoing from California who picked Chile would create a salon that
 * quotes its Santiago clients in dollars for the rest of its life.
 *
 * WHY THE DEVICE IS CONSULTED AT ALL: a country alone cannot answer for the
 * three countries that span zones, and `zoneForPlace` refuses the United States
 * outright (four zones, no state table). When the phone is standing in the
 * country the owner picked, it is the sharper answer for exactly those cases.
 *
 * Null means "we could not tell" — the caller has to ask her.
 */
export function proposeSalonZone(
  countryCode: string | null | undefined,
  deviceZone: string | null | undefined,
): string | null {
  const country = (countryCode ?? "").trim().toLowerCase();
  if (!country) return null;
  if (isUsableZone(deviceZone) && countryForZone(deviceZone) === country) return deviceZone!;
  return zoneForPlace({ countryCode: country });
}

/** This browser's own zone, or null where the platform will not say. */
export function deviceZone(): string | null {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isUsableZone(zone) ? zone : null;
  } catch {
    return null;
  }
}
