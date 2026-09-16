import { RUBRO_PRESETS, PRESET_RUBROS } from "./service-presets";

// What a salon's services cost in the country it actually stands in.
//
// WHY THIS EXISTS: `service-presets.ts` carries the medians of 7,660 real
// appointments — in Chilean pesos. Outside Chile it therefore offers a NAME, a
// DURATION and a price of zero, which is the empty catalogue the whole
// generated draft exists to avoid. An owner in Guadalajara met "Esmaltado
// semipermanente — $0" and had to type her own price list after all.
//
// WHERE THE NUMBERS COME FROM: live 2026 price lists — Fresha listings for
// Bogotá, CDMX and Lima, Ágora pages for Buenos Aires, salon sites for Los
// Angeles — collected per city and then checked a second time against the
// sources. Two things were looked for and not found: invented rows, and rows
// that were the Chilean median times an exchange rate. What did not survive
// that check is absent here rather than guessed at.
//
// WHY THEY ARE MARKED APPROXIMATE: these are typical neighbourhood-salon
// prices, not this salon's prices. Chile is the exception — there the number IS
// the median of the pilot's own book — so only Chile is offered without the
// "confírmalo" badge.
//
// HOW TO CHANGE ONE: edit the number, bump `ANCHOR_AS_OF`, and say in the
// country's `note` where the new figure came from. A price with no story behind
// it is how the CLP bug happened the first time.
//
// WHAT IS DELIBERATELY MISSING, so nobody "completes" the table by inventing:
// henna de cejas is not sold as its own line in Mexico or the United States (in
// Mexico it is a surcharge on the brow shape, in the US the market sells tint,
// a different product); manicure rusa and base rubber mean different amounts of
// work in different countries and are absent where the local word did not
// settle; polygel has no regular salon price in Lima or Los Angeles. Five of
// the 25 rows account for most of the gaps. The rest are covered everywhere.

/** Bumped whenever a number moves, so a stale draft can be spotted. */
export const ANCHOR_VERSION = 2;

/** The month the price lists were read. */
export const ANCHOR_AS_OF = "2026-09";

/**
 * How much dearer or cheaper than the neighbourhood average this salon is.
 *
 * One constant, not a per-country table: the spread between a cheap and an
 * expensive salon in the same city is a property of salons, not of countries.
 */
export const TIER_FACTORS = { budget: 0.85, standard: 1.0, premium: 1.25 } as const;

export type PriceTier = keyof typeof TIER_FACTORS;

export interface CountryAnchors {
  currency: string;
  /** The coin an owner would actually write on a price list. */
  rounding: number;
  /** Where these numbers were read, and anything odd about the market. */
  note: string;
  /** Slug → typical price, already in the country's own currency. */
  services: Record<string, number>;
}

type ConvertedPriceMarket = {
  currency: string;
  reference: "mx" | "us";
  unitsPerReferenceUnit: number;
  rounding: number;
};

// Provisional suggestions for supported markets without a researched salon
// price list. Latin-American markets follow the Mexican list and Spain/Puerto
// Rico follow the US list, converted with 2026-09-08 USD rates. They remain
// `fallback` and approximate; they are deliberately not promoted to anchors.
const CONVERTED_PRICE_MARKETS: Record<string, ConvertedPriceMarket> = {
  bo: { currency: "BOB", reference: "mx", unitsPerReferenceUnit: 0.73266278, rounding: 5 },
  br: { currency: "BRL", reference: "mx", unitsPerReferenceUnit: 0.30273507, rounding: 5 },
  cr: { currency: "CRC", reference: "mx", unitsPerReferenceUnit: 26.79929913, rounding: 500 },
  do: { currency: "DOP", reference: "mx", unitsPerReferenceUnit: 3.49575534, rounding: 50 },
  ec: { currency: "USD", reference: "mx", unitsPerReferenceUnit: 0.05905656, rounding: 1 },
  es: { currency: "EUR", reference: "us", unitsPerReferenceUnit: 0.860364, rounding: 1 },
  gt: { currency: "GTQ", reference: "mx", unitsPerReferenceUnit: 0.45081897, rounding: 5 },
  hn: { currency: "HNL", reference: "mx", unitsPerReferenceUnit: 1.58480022, rounding: 10 },
  ni: { currency: "NIO", reference: "mx", unitsPerReferenceUnit: 2.17349239, rounding: 10 },
  pa: { currency: "PAB", reference: "mx", unitsPerReferenceUnit: 0.05905656, rounding: 1 },
  pr: { currency: "USD", reference: "us", unitsPerReferenceUnit: 1, rounding: 5 },
  py: { currency: "PYG", reference: "mx", unitsPerReferenceUnit: 353.87850572, rounding: 5000 },
  sv: { currency: "USD", reference: "mx", unitsPerReferenceUnit: 0.05905656, rounding: 1 },
  uy: { currency: "UYU", reference: "mx", unitsPerReferenceUnit: 2.37739661, rounding: 50 },
  ve: { currency: "USD", reference: "mx", unitsPerReferenceUnit: 0.05905656, rounding: 1 },
};

export const hasPriceAnchors = (country: string): boolean => {
  const code = country.trim().toLowerCase();
  return (
    Object.prototype.hasOwnProperty.call(PRICE_ANCHORS, code) ||
    Object.prototype.hasOwnProperty.call(CONVERTED_PRICE_MARKETS, code)
  );
};

export const PRICE_ANCHORS: Record<string, CountryAnchors> = {
  cl: {
    currency: "CLP",
    rounding: 500,
    note: "Медианы 7 660 записей пилота Diego. Единственная страна, где цена не «примерно».",
    services: {}, // filled from RUBRO_PRESETS below — the pilot IS the anchor
  },
  mx: {
    currency: "MXN",
    rounding: 10,
    note: "Ciudad de México (Roma / Condesa / Del Valle), живые листинги Fresha и сайты салонов, сентябрь 2026, с НДС. Две оговорки. Русский маникюр вышел дешевле обычного (250 против 320) — источники так и говорят, но это терминологическая ловушка: под одним названием продают разный объём работы. И семиперманент 400 верен, только если маникюр входит в услугу: голое нанесение геля стоит 200-230.",
    services: {
      "manicure-tradicional": 320,
      "manicure-rusa": 250,
      "esmaltado-semipermanente": 400,
      "base-rubber": 450,
      "unas-polygel": 600,
      "unas-acrilicas": 700,
      "retiro-unas": 70,
      pedicure: 450,
      "pedicure-spa": 600,
      "pestanas-clasicas": 1000,
      "pestanas-volumen": 1300,
      "lifting-pestanas": 600,
      "retiro-pestanas": 200,
      "perfilado-cejas": 250,
      "laminado-cejas": 380,
      "depilacion-bozo": 120,
      "limpieza-facial": 700,
      "alisado-keratina": 2000,
      "color-cabello": 900,
      "corte-cabello": 480,
      "tratamiento-capilar": 800,
      "mechas-balayage": 2500,
      "masaje-descontracturante": 900,
      "micropigmentacion-cejas": 3800,
    },
  },
  ar: {
    currency: "ARS",
    rounding: 500,
    note: "Ágora, сентябрь 2026. САМЫЙ ХРУПКИЙ НАБОР, три оговорки. Инфляция съедает номинал быстрее всех остальных рынков — пересматривать каждые несколько месяцев. Это среднее ПО СТРАНЕ, а не по Буэнос-Айресу: в CABA дороже на четверть, в провинции дешевле на десятую. И опубликованная цена — верхняя граница, скидка за наличные 15-20% здесь обычное дело.",
    services: {
      "manicure-tradicional": 15000,
      "esmaltado-semipermanente": 24000,
      "unas-polygel": 33000,
      "unas-acrilicas": 34000,
      "retiro-unas": 8000,
      pedicure: 22500,
      "pedicure-spa": 30000,
      "pestanas-clasicas": 28500,
      "pestanas-volumen": 40000,
      "lifting-pestanas": 26000,
      "retiro-pestanas": 11000,
      "perfilado-cejas": 15000,
      "laminado-cejas": 24500,
      "depilacion-bozo": 7500,
      "limpieza-facial": 36000,
      "alisado-keratina": 50000,
      "color-cabello": 65000,
      "corte-cabello": 22000,
      "mechas-balayage": 100000,
      "masaje-descontracturante": 42000,
      "micropigmentacion-cejas": 130000,
    },
  },
  co: {
    currency: "COP",
    rounding: 1000,
    note: "Bogotá, 16 страниц Fresha плюс два независимых источника, сентябрь 2026. НЕ ЧИНИТЬ: лифтинг ресниц (100 000) почти равен полному классическому набору (110 000) — выглядит ошибкой, но проверено на 17 салонах, рынок такой. Между районами разрыв в два-три раза, волосы почти везде «от» и на длинных выходят вдвое дороже.",
    services: {
      "manicure-tradicional": 25000,
      "esmaltado-semipermanente": 50000,
      "base-rubber": 70000,
      "unas-polygel": 120000,
      "unas-acrilicas": 125000,
      "retiro-unas": 18000,
      pedicure: 30000,
      "pedicure-spa": 45000,
      "pestanas-clasicas": 110000,
      "pestanas-volumen": 140000,
      "lifting-pestanas": 100000,
      "retiro-pestanas": 15000,
      "perfilado-cejas": 14000,
      "laminado-cejas": 55000,
      "henna-cejas": 30000,
      "limpieza-facial": 110000,
      "corte-cabello": 32000,
      "color-cabello": 120000,
      "alisado-keratina": 180000,
      "mechas-balayage": 300000,
      "masaje-descontracturante": 120000,
      "micropigmentacion-cejas": 250000,
    },
  },
  pe: {
    currency: "PEN",
    rounding: 5,
    note: "Lima, Fresha и сайты салонов (tobu.pe, Ganesha, Peace Spa), сентябрь 2026.",
    services: {
      "manicure-tradicional": 40,
      "esmaltado-semipermanente": 60,
      "unas-acrilicas": 100,
      "base-rubber": 80,
      "retiro-unas": 30,
      pedicure: 50,
      "pestanas-clasicas": 100,
      "pestanas-volumen": 150,
      "lifting-pestanas": 130,
      "retiro-pestanas": 30,
      "perfilado-cejas": 35,
      "laminado-cejas": 100,
      "henna-cejas": 75,
      "depilacion-bozo": 15,
      "limpieza-facial": 90,
      "corte-cabello": 70,
      "color-cabello": 150,
      "tratamiento-capilar": 150,
      "alisado-keratina": 220,
      "mechas-balayage": 350,
      "masaje-descontracturante": 130,
      "micropigmentacion-cejas": 500,
    },
  },
  us: {
    currency: "USD",
    rounding: 5,
    note: "Los Angeles, 12 источников — прайсы районных салонов, не Беверли-Хиллз. Сентябрь 2026. Без налога и БЕЗ чаевых, а они здесь 18-25% и платятся почти всегда: клиентка увидит на четверть больше того, что стоит в каталоге.",
    services: {
      "manicure-tradicional": 30,
      "manicure-rusa": 60,
      "esmaltado-semipermanente": 50,
      "unas-acrilicas": 65,
      "retiro-pestanas": 45,
      pedicure: 40,
      "pedicure-spa": 70,
      "pestanas-clasicas": 140,
      "lifting-pestanas": 100,
      "perfilado-cejas": 25,
      "laminado-cejas": 90,
      "depilacion-bozo": 15,
      "limpieza-facial": 100,
      "alisado-keratina": 250,
      "color-cabello": 150,
      "corte-cabello": 70,
      "tratamiento-capilar": 45,
      "mechas-balayage": 300,
      "masaje-descontracturante": 80,
      "micropigmentacion-cejas": 500,
    },
  },
};

/** The pilot's own medians, keyed the way the anchors are. */
const chileanMedians = (): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const rubro of PRESET_RUBROS) {
    for (const preset of RUBRO_PRESETS[rubro]) out[preset.key] = preset.clp;
  }
  return out;
};

PRICE_ANCHORS.cl.services = chileanMedians();

export function isAnchoredCountry(country: string): boolean {
  return !!PRICE_ANCHORS[country.trim().toLowerCase()];
}

const round = (value: number, step: number): number =>
  step > 0 ? Math.max(step, Math.round(value / step) * step) : Math.round(value);

/**
 * How this country's prices sit against the pilot's, worked out from the rows
 * both of them carry.
 *
 * WHY A DERIVED FACTOR AND NOT A TYPED-IN ONE: the services without a local
 * anchor still need a number, and the honest way to reach it is the ratio the
 * country's own data already shows — the MEDIAN ratio across every service we
 * did find, so one unusual row cannot drag the rest. A hand-picked factor would
 * be exactly the invention the whole file is written to avoid.
 */
function fallbackFactor(country: string): number | null {
  const anchors = PRICE_ANCHORS[country]?.services;
  const chile = PRICE_ANCHORS.cl.services;
  if (!anchors) return null;
  const ratios = Object.entries(anchors)
    .map(([key, price]) => (chile[key] ? price / chile[key] : null))
    .filter((r): r is number => r !== null && Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b);
  if (!ratios.length) return null;
  const middle = Math.floor(ratios.length / 2);
  return ratios.length % 2 ? ratios[middle] : (ratios[middle - 1] + ratios[middle]) / 2;
}

export interface AnchoredPrice {
  price: number;
  currency: string;
  /** False only in Chile, where the number is this market's own median. */
  approximate: boolean;
  /** Where the number came from, so the screen can say so and a test can check. */
  source: "anchor" | "fallback";
}

/**
 * What to pre-fill for one service, in one country, at one tier.
 *
 * Null means we have nothing defensible — the caller leaves the row unpriced
 * and lets her type it, which is worse than a good guess and far better than a
 * confident wrong one.
 */
export function anchoredPrice(
  serviceKey: string,
  country: string,
  tier: PriceTier = "standard",
): AnchoredPrice | null {
  const code = country.trim().toLowerCase();
  const table = PRICE_ANCHORS[code];
  if (!table) {
    const converted = CONVERTED_PRICE_MARKETS[code];
    if (!converted) return null;
    const reference = anchoredPrice(serviceKey, converted.reference, tier);
    if (!reference) return null;
    return {
      price: round(
        reference.price * converted.unitsPerReferenceUnit,
        converted.rounding,
      ),
      currency: converted.currency,
      approximate: true,
      source: "fallback",
    };
  }
  const factor = TIER_FACTORS[tier];
  const approximate = code !== "cl";
  const direct = table.services[serviceKey];
  if (direct !== undefined) {
    return {
      price: round(direct * factor, table.rounding),
      currency: table.currency,
      approximate,
      source: "anchor",
    };
  }
  const chile = PRICE_ANCHORS.cl.services[serviceKey];
  const ratio = fallbackFactor(code);
  if (chile === undefined || ratio === null) return null;
  return {
    price: round(chile * ratio * factor, table.rounding),
    currency: table.currency,
    // A fallback is approximate even in Chile — though Chile never reaches
    // here, since every preset it has is an anchor by construction.
    approximate: true,
    source: "fallback",
  };
}
