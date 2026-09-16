import { pilotDefaultSchedule } from "./onboarding-defaults";
import { countryLanguage, type AppLanguage } from "./language";
import { COUNTRY_LOCALES } from "./salon-locale";
import {
  ANCHOR_AS_OF,
  ANCHOR_VERSION,
  anchoredPrice,
  type PriceTier,
} from "./price-anchors";
import { presetServices, type PresetRubro } from "./service-presets";
import type { SpecialistSchedule } from "./schema";

// Turning two answers into a salon that already exists.
//
// WHAT THIS IS FOR: after "Preparar mi negocio" the owner must meet a business,
// not a form. Every field below is filled — services with prices that are right
// for her country, the week the pilot's own book actually works, somebody who
// performs the services, the two money policies, and the answers her clients
// ask before booking. The six confirmation cards then ask her to agree, not to
// type.
//
// WHAT THIS IS NOT: a write. Nothing here touches Chatfuel. The draft lives in
// the browser until she presses "Continuar", which is the only reason it is
// safe to generate this much on her behalf — a guess that was never published
// costs her one tap to correct, and a guess that was published costs her a
// client quoted the wrong price.
//
// WHY THE OWNER IS ONLY ADDED WHEN SHE WORKS ALONE: a salon with staff has
// somebody specific behind each chair, and silently making the owner the first
// specialist puts her name on a booking she will not attend. Solo is the case
// where she IS the chair, and asking her to add herself is asking her to state
// the obvious.

export interface DraftInput {
  businessName: string;
  /** ISO-3166 alpha-2, lowercase. */
  country: string;
  timezone: string;
  /** What she does, from her own posts or from the picker. */
  rubros: readonly PresetRubro[];
  tier: PriceTier;
  /** She works alone: she becomes the first specialist. */
  solo: boolean;
  /** A team owner is not silently put on the book. */
  ownerServes?: boolean;
  /** Required when this is a team salon and the owner does not serve. */
  teamNames?: readonly string[];
  /** Shown on the specialist card; the account's own name is the default. */
  ownerName: string;
}

export interface DraftService {
  key: string;
  name: string;
  price: number;
  durationMinutes: number;
  rubro: PresetRubro;
  /** True everywhere but Chile: the badge that says "confírmalo". */
  approximate: boolean;
  /** "fallback" means the country had no anchor and the ratio filled it in. */
  priceSource: "anchor" | "fallback" | "none";
  priceEdited?: boolean;
  detailsEdited?: boolean;
  imported?: boolean;
  importedEdited?: boolean;
  currency?: string;
}

export interface DraftSpecialist {
  /** Stable local identity: display names are editable and cannot be React keys. */
  draftId: string;
  role: "owner" | "team";
  name: string;
  schedule: SpecialistSchedule;
  /** Service keys she performs — everything, until the owner says otherwise. */
  serviceKeys: string[];
}

export interface DraftPolicies {
  /**
   * Offered, switched off. 37% of the pilot's visits carried a deposit and the
   * commonest was exactly 5,000 CLP — common enough to propose, not common
   * enough to turn on for a salon that never asked for one.
   */
  depositAmount: number;
  depositEnabled: boolean;
  depositCurrency?: string;
  /** Hours of notice before a booking may be cancelled free. */
  cancellationHours: number;
}

export interface DraftFaqEntry {
  question: string;
  answer: string;
}

export interface SalonDraft {
  categories?: PresetRubro[];
  businessName: string;
  country: string;
  timezone: string;
  tier: PriceTier;
  teamMode: "solo" | "team";
  ownerServes: boolean;
  services: DraftService[];
  specialists: DraftSpecialist[];
  schedule: SpecialistSchedule;
  policies: DraftPolicies;
  faq: DraftFaqEntry[];
  /** True when at least one price came from the ratio rather than a real list. */
  hasFallbackPrices: boolean;
  anchorVersion: number;
  anchorAsOf: string;
  language?: AppLanguage;
  savedTeam?: DraftSpecialist[];
  savedOwner?: DraftSpecialist;
}

/** The deposit the pilot's own book shows, in the currencies we anchor. */
const SUGGESTED_DEPOSIT: Record<string, number> = {
  cl: 5000,
  mx: 200,
  ar: 8000,
  co: 20000,
  pe: 30,
  us: 20,
};

const DEFAULT_CANCELLATION_HOURS = 24;

function priceService(
  key: string,
  country: string,
  tier: PriceTier,
): Pick<DraftService, "price" | "approximate" | "priceSource"> {
  const anchored = anchoredPrice(key, country, tier);
  if (!anchored) return { price: 0, approximate: true, priceSource: "none" };
  return {
    price: anchored.price,
    approximate: anchored.approximate,
    priceSource: anchored.source,
  };
}

/**
 * The questions a client asks in the DM before she books, answered from the
 * draft itself so no sentence can contradict the catalogue beside it.
 *
 * Deliberately short and deliberately generic: this is the floor the assistant
 * stands on before the owner has written anything of her own, not her voice.
 */
export function buildSalonFaq(
  services: readonly DraftService[],
  policies: DraftPolicies,
  language: AppLanguage = "es",
): DraftFaqEntry[] {
  const approximate = services.some((service) => service.approximate);
  const longest = services.reduce((max, s) => Math.max(max, s.durationMinutes), 0);
  if (language === "en") return [
    { question: "How much does it cost?", answer: "Tell me which service you are interested in and I will share the price." },
    { question: "How do I book?", answer: "Tell me the service and your preferred day so we can check availability." },
    { question: "How long does it take?", answer: services.length ? `Duration depends on the service, from ${Math.min(...services.map((s) => s.durationMinutes))} to ${longest} minutes.` : "I will confirm the duration for your service." },
    { question: "Is a deposit required?", answer: policies.depositEnabled ? "A deposit is required to book. The remainder is paid at the appointment." : "No booking deposit is required." },
    { question: "What is the cancellation policy?", answer: `Please give ${policies.cancellationHours} hours of notice for changes or cancellation.` },
    { question: "Which payment methods are accepted?", answer: "Please confirm the payment method with the business before paying." },
    { question: "Where is the appointment?", answer: "We will confirm the appointment location with you." },
    { question: "Do you accept walk-ins?", answer: "Contact us to check availability." },
  ];
  if (language === "pt") return [
    {
      question: "Quanto custa?",
      answer: approximate
        ? "Envio a lista de preços por aqui. Os valores podem variar conforme o comprimento e as condições das unhas ou do cabelo."
        : "Envio a lista de preços por aqui.",
    },
    {
      question: "Como faço para agendar?",
      answer: "Diga qual serviço você quer e o melhor dia para conferirmos os horários disponíveis.",
    },
    {
      question: "Quanto tempo demora?",
      answer: longest
        ? `Depende do serviço: de 30 minutos a ${longest >= 120 ? `${Math.round(longest / 60)} horas` : `${longest} minutos`}.`
        : "Depende do serviço; confirmo a duração no momento do agendamento.",
    },
    {
      question: "É preciso pagar um sinal para reservar?",
      answer: policies.depositEnabled
        ? "Sim. A reserva é confirmada com um sinal e o restante é pago no dia do atendimento."
        : "Não é preciso pagar sinal. Você agenda e paga no dia do atendimento.",
    },
    {
      question: "E se eu não puder comparecer?",
      answer: `Avise com pelo menos ${policies.cancellationHours} horas de antecedência para remarcarmos sem problema.`,
    },
    {
      question: "Quais formas de pagamento vocês aceitam?",
      answer: "Confirme a forma de pagamento com o estabelecimento antes de pagar.",
    },
    {
      question: "Onde fica o atendimento?",
      answer: "Confirmamos o endereço exato no momento do agendamento.",
    },
    {
      question: "Vocês atendem sem horário marcado?",
      answer: "Entre em contato para conferir a disponibilidade.",
    },
  ];
  const faq: DraftFaqEntry[] = [
    {
      question: "¿Cuánto cuesta?",
      answer: approximate
        ? "Te paso la lista de precios por aquí mismo. Los valores pueden variar según el largo y el estado de la uña o el cabello."
        : "Te paso la lista de precios por aquí mismo.",
    },
    {
      question: "¿Cómo agendo una hora?",
      answer: "Me dices el servicio y el día que te acomoda, y te confirmo la hora por aquí.",
    },
    {
      question: "¿Cuánto se demora?",
      answer: longest
        ? `Depende del servicio: entre 30 minutos y ${longest >= 120 ? `${Math.round(longest / 60)} horas` : `${longest} minutos`}.`
        : "Depende del servicio; te lo confirmo al agendar.",
    },
    {
      question: "¿Piden abono para reservar?",
      answer: policies.depositEnabled
        ? "Sí, se reserva con un abono y el resto se paga el día de la atención."
        : "No, no pedimos abono. Reservas y pagas el día de tu hora.",
    },
    {
      question: "¿Qué pasa si no puedo asistir?",
      answer: `Avísame con al menos ${policies.cancellationHours} horas de anticipación y movemos tu hora sin problema.`,
    },
    {
      question: "¿Qué medios de pago aceptan?",
      answer: "Confirma el medio de pago con el negocio antes de pagar.",
    },
    {
      question: "¿Dónde quedan?",
      answer: "Te confirmo la dirección exacta cuando agendemos tu hora.",
    },
    {
      question: "¿Atienden sin reserva?",
      answer: "Trabajo con hora agendada para que no tengas que esperar.",
    },
  ];
  return faq;
}

/**
 * A complete salon from the two answers she gave, plus what her posts said.
 *
 * `rubros` is the only place the outside world gets a say in what she sells;
 * everything after it follows from her country and the pilot's data.
 */
export function buildSalonDraft(input: DraftInput): SalonDraft {
  const country = input.country.trim().toLowerCase();
  const rows = presetServices(input.rubros, [], country);
  const services: DraftService[] = rows.map((row) => ({
    key: row.key,
    name: row.name,
    durationMinutes: row.durationMinutes,
    rubro: row.rubro,
    ...priceService(row.key, country, input.tier),
    priceEdited: false,
    currency: COUNTRY_LOCALES[country]?.currency,
  }));

  const schedule = pilotDefaultSchedule();
  const serviceKeys = services.map((s) => s.key);
  const ownerName = input.ownerName.trim() || input.businessName.trim();
  const teamNames = (input.teamNames ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  const specialistNames = input.solo
    ? [ownerName]
    : [...(input.ownerServes ? [ownerName] : []), ...teamNames];
  const specialists: DraftSpecialist[] = [...new Set(specialistNames)].map((name, index) => {
    const role = name === ownerName && (input.solo || input.ownerServes) ? "owner" : "team";
    return {
      draftId: role === "owner" ? "owner" : `team-${index + 1}`,
      role,
      name,
      schedule,
      serviceKeys,
    };
  });

  const policies: DraftPolicies = {
    depositAmount: SUGGESTED_DEPOSIT[country] ?? 0,
    depositEnabled: false,
    depositCurrency: COUNTRY_LOCALES[country]?.currency,
    cancellationHours: DEFAULT_CANCELLATION_HOURS,
  };

  const language = countryLanguage(country);
  return {
    businessName: input.businessName.trim(),
    categories: [...input.rubros],
    country,
    timezone: input.timezone,
    tier: input.tier,
    teamMode: input.solo ? "solo" : "team",
    ownerServes: input.solo || input.ownerServes === true,
    services,
    specialists,
    schedule,
    policies,
    faq: buildSalonFaq(services, policies, language),
    hasFallbackPrices: services.some((s) => s.priceSource === "fallback"),
    anchorVersion: ANCHOR_VERSION,
    anchorAsOf: ANCHOR_AS_OF,
    language,
  };
}
