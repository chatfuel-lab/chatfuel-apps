// The catalogue we offer a salon whose own Instagram told us nothing.
//
// WHY THIS EXISTS: the review screen used to face an owner with an empty
// "Servicios 0" card and a file upload nobody on a phone can satisfy. Reading
// her captions covers the salons that publish prices; this covers the rest —
// and "the rest" is not a corner case, because a large share of LATAM salons
// answer "valores por interno" instead of posting a list.
//
// WHERE THE NUMBERS COME FROM: 608 real priced services and 7,660 real
// appointments in the Chilean pilot Diego already runs. Every price below is
// the MEDIAN of that family, not an invention and not a list price we made up.
// Two of them are deliberately absent: promos/packages/courses (they are one
// salon's campaign, never a starting catalogue) and micropigmentación beyond
// its own rubro (n=7, too few to hand anyone as a default).
//
// WHY PRICES ARE CHILE-ONLY: the medians are CLP. The same number under a
// Mexican salon's currency would quote a client 15,000 pesos for a manicure,
// which is the exact bug `salon-locale.ts` exists to prevent. Outside Chile the
// preset still carries the NAME and the DURATION — the two things that are the
// same everywhere — and the owner types her own price.

import { salonCountry } from "./salon-locale";

/** The rubro vocabulary the profile already stores, verbatim (Ajustes RUBROS). */
export const PRESET_RUBROS = [
  "uñas",
  "pies",
  "pestañas",
  "cejas",
  "faciales",
  "cabello",
  "masajes",
  "micropigmentación",
] as const;

export type PresetRubro = (typeof PRESET_RUBROS)[number];

export interface PresetService {
  /**
   * Stable slug, and the join to `core/price-anchors.ts`. The Spanish name is
   * what an owner reads and may be reworded; the key is what carries her
   * country's price, so it must never change once shipped.
   */
  key: string;
  name: string;
  /** Median price in CLP from the pilot. The anchor for Chilean salons. */
  clp: number;
  /** Slot length in minutes. Confident for pestañas and semipermanente; the
   *  rest is the booking granularity the pilot actually used. */
  minutes: number;
}

/**
 * Ordered by how often the family appears in the pilot, so the first rows a
 * salon sees are the ones most salons actually sell.
 */
export const RUBRO_PRESETS: Record<PresetRubro, PresetService[]> = {
  "uñas": [
    { key: "esmaltado-semipermanente", name: "Esmaltado semipermanente", clp: 15000, minutes: 60 },
    { key: "unas-polygel", name: "Uñas polygel", clp: 26000, minutes: 90 },
    { key: "unas-acrilicas", name: "Uñas acrílicas", clp: 28000, minutes: 120 },
    { key: "manicure-tradicional", name: "Manicure tradicional", clp: 15000, minutes: 60 },
    { key: "base-rubber", name: "Base rubber / nivelación", clp: 18900, minutes: 60 },
    { key: "manicure-rusa", name: "Manicure rusa", clp: 26500, minutes: 90 },
    { key: "retiro-unas", name: "Retiro", clp: 5000, minutes: 30 },
  ],
  "pies": [
    { key: "pedicure", name: "Pedicure", clp: 22200, minutes: 90 },
    { key: "pedicure-spa", name: "Pedicure spa", clp: 25000, minutes: 90 },
  ],
  "pestañas": [
    { key: "pestanas-volumen", name: "Pestañas volumen", clp: 35000, minutes: 120 },
    { key: "pestanas-clasicas", name: "Pestañas clásicas", clp: 25000, minutes: 120 },
    { key: "lifting-pestanas", name: "Lifting de pestañas", clp: 20990, minutes: 90 },
    { key: "retiro-pestanas", name: "Retiro de pestañas", clp: 5000, minutes: 30 },
  ],
  "cejas": [
    { key: "perfilado-cejas", name: "Perfilado de cejas", clp: 10000, minutes: 30 },
    { key: "laminado-cejas", name: "Laminado de cejas", clp: 18000, minutes: 60 },
    { key: "henna-cejas", name: "Henna de cejas", clp: 14995, minutes: 30 },
    { key: "depilacion-bozo", name: "Depilación de bozo", clp: 3495, minutes: 15 },
  ],
  "faciales": [
    { key: "limpieza-facial", name: "Limpieza facial", clp: 25000, minutes: 90 },
  ],
  "cabello": [
    { key: "alisado-keratina", name: "Alisado / keratina", clp: 45000, minutes: 180 },
    { key: "color-cabello", name: "Color", clp: 57500, minutes: 120 },
    { key: "corte-cabello", name: "Corte de cabello", clp: 15000, minutes: 60 },
    { key: "tratamiento-capilar", name: "Tratamiento capilar", clp: 34995, minutes: 60 },
    { key: "mechas-balayage", name: "Mechas / balayage", clp: 82000, minutes: 180 },
  ],
  "masajes": [
    { key: "masaje-descontracturante", name: "Masaje descontracturante", clp: 24990, minutes: 60 },
  ],
  "micropigmentación": [
    { key: "micropigmentacion-cejas", name: "Micropigmentación de cejas", clp: 80000, minutes: 120 },
  ],
};

/**
 * The words that give a rubro away in a caption, accents both ways because a
 * caption is typed on a phone and half of them carry no accents at all.
 * Matched against a lowercased, accent-stripped caption, so only the plain form
 * needs to be listed.
 */
const RUBRO_WORDS: Record<PresetRubro, readonly string[]> = {
  "uñas": ["manicur", "acrilic", "polygel", "poligel", "softgel", "esmaltad", "semiperm", "rubber", "kapping", "capping", "nail"],
  "pies": ["pedicur", "pies", "podolog"],
  "pestañas": ["pestan", "lash", "lifting", "volumen", "rimel", "extensiones"],
  "cejas": ["ceja", "brow", "laminad", "henna", "bozo", "perfilad"],
  "faciales": ["facial", "limpieza de cutis", "peeling", "dermapen"],
  "cabello": ["cabello", "pelo", "corte", "alisad", "keratin", "mechas", "balayage", "tinte", "capilar", "brushing", "peinad"],
  "masajes": ["masaj", "relajante", "descontractur"],
  "micropigmentación": ["micropigment", "microblading"],
};

const flatten = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * What this salon does, guessed from her own posts.
 *
 * Deliberately generous: a caption mentioning uñas twice and cejas once means
 * she sells both, and offering one row too many costs her a tap while offering
 * one too few costs her a service the bot can never book. Falls back to uñas,
 * which 16 of the pilot's 19 profiles sell.
 */
export function inferRubros(captions: readonly (string | null | undefined)[]): PresetRubro[] {
  const haystack = flatten(captions.filter(Boolean).join(" \n "));
  if (!haystack.trim()) return ["uñas"];
  const found = PRESET_RUBROS.filter((rubro) =>
    RUBRO_WORDS[rubro].some((word) => haystack.includes(word)),
  );
  return found.length ? found : ["uñas"];
}

export interface PresetRow {
  /** Carried through so the caller can price the row from `price-anchors`. */
  key: string;
  name: string;
  /** 0 where we have no defensible number for this salon's currency. */
  price: number;
  durationMinutes: number;
  rubro: PresetRubro;
}

/** Whether we can put a price on a preset at all in this salon's country. */
export function presetPricesApply(country: string = salonCountry()): boolean {
  return country === "cl";
}

/**
 * The rows to offer, deduplicated against what she already has.
 *
 * `existing` is matched on a flattened name so "Esmaltado Semipermanente" and
 * "esmaltado semipermanente" do not both appear.
 */
export function presetServices(
  rubros: readonly string[],
  existing: readonly string[] = [],
  country: string = salonCountry(),
): PresetRow[] {
  const priced = presetPricesApply(country);
  const known = new Set(existing.map(flatten));
  const seen = new Set<string>();
  const rows: PresetRow[] = [];
  for (const rubro of PRESET_RUBROS) {
    if (!rubros.includes(rubro)) continue;
    for (const preset of RUBRO_PRESETS[rubro]) {
      const fingerprint = flatten(preset.name);
      if (known.has(fingerprint) || seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      rows.push({
        key: preset.key,
        name: preset.name,
        price: priced ? preset.clp : 0,
        durationMinutes: preset.minutes,
        rubro,
      });
    }
  }
  return rows;
}
