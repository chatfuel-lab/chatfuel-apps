/**
 * The texts Comment Studio writes into the bot when she has not written her
 * own: one public reply under the comment and one Direct with her prices.
 *
 * Generated from the Knowledge Base (salon name, services with prices, hours)
 * so the card and the bot never disagree: the draft always wins, and her own
 * wording is kept only when it differs from the draft (see the model).
 */
import { FUELY_LIMITS } from "./lib/fuely";
import type { AppLanguage } from "./lib/language";

export interface AsistenteTexts {
  /** Light mode: the one message the clienta receives, verbatim. */
  dmFixedText: string;
  /** Full mode: how the AI opens the Direct after a comment. */
  dmPrompt: string;
  /** Legacy prompt retained because Chatfuel validates it on every write. */
  publicPrompt: string;
  /** The exact public reply written under a qualifying comment. */
  publicFixedText: string;
}

export interface SalonService {
  title: string;
  price: { amount: string; currency: string } | null;
}

export interface SalonFacts {
  /** Instagram handle without the @, "" when Instagram is not connected. */
  handle: string;
  salonName: string;
  services: readonly SalonService[];
  /** "09:00" – "19:00", null when the Knowledge Base has no hours. */
  hours: { open: string; close: string } | null;
}

export const EMPTY_FACTS: SalonFacts = { handle: "", salonName: "", services: [], hours: null };

export const PRICES_MARKER = "AGENDA_PRICES:";

const VOICE = {
  es: {
    salon: "tu salón",
    greeting: "¡Hola! Gracias por escribir 💜",
    catalogFallback: "Te paso los precios y las horas que tengo libres por aquí.",
    question: "¿Cuál te interesa y qué día te acomoda?",
    hours: (open: string, close: string) => `Atiendo de ${open} a ${close}.`,
    directIntro: (at: string) =>
      `Eres quien contesta el Direct de ${at}. Hablas en español, de tú, con frases cortas y cercanas.`,
    answerComment: "Salúdala por su nombre si lo sabes y responde lo que preguntó en el comentario.",
    prices: (list: string) =>
      `${PRICES_MARKER} ${list}. Usa esos precios tal cual. Si pregunta por un servicio que no está en la lista, no lo inventes ni lo cotices.`,
    noCatalog:
      "Todavía no tienes precios cargados: no cotices nada, pregúntale qué servicio quiere y avísale que la dueña le confirma el valor.",
    promptHours: (open: string, close: string) =>
      `HORARIO: atiende de ${open} a ${close}. Ofrécele siempre una hora concreta dentro de ese horario.`,
    offerTime: "Ofrécele siempre una hora concreta, nunca un “te aviso”.",
    publicPrompt: (at: string) =>
      `Responde en una línea el comentario que dejaron en ${at}, cercana y con su mismo tono. No des precios ni horas en público: eso va por Direct. Dile que le escribiste al Direct. No repitas el mismo texto dos veces seguidas.`,
    publicFixed: "¡Hola! Te escribí al Direct 💜",
  },
  en: {
    salon: "your salon",
    greeting: "Hi! Thanks for reaching out 💜",
    catalogFallback: "I can share our prices and available times here.",
    question: "Which service are you interested in, and what day works for you?",
    hours: (open: string, close: string) => `We're available from ${open} to ${close}.`,
    directIntro: (at: string) =>
      `You reply to Direct messages for ${at}. Write in English, use a warm tone, and keep sentences short.`,
    answerComment: "Greet the client by name when you know it and answer what they asked in the comment.",
    prices: (list: string) =>
      `${PRICES_MARKER} ${list}. Use these exact prices. If the client asks about a service outside this list, do not invent or estimate a price.`,
    noCatalog:
      "There are no prices in the catalog yet. Ask which service the client wants and say the owner will confirm the price.",
    promptHours: (open: string, close: string) =>
      `HOURS: the business is available from ${open} to ${close}. Always offer a specific time inside these hours.`,
    offerTime: "Always offer a specific time instead of saying you will get back to them.",
    publicPrompt: (at: string) =>
      `Reply in one warm sentence to the comment on ${at} and match the client's tone. Do not list prices or times publicly; those belong in Direct. Say you sent a Direct message, and do not repeat the same reply twice in a row.`,
    publicFixed: "Hi! I sent you a Direct message 💜",
  },
  pt: {
    salon: "seu salão",
    greeting: "Oi! Obrigada por escrever 💜",
    catalogFallback: "Posso te enviar os preços e os horários disponíveis por aqui.",
    question: "Qual serviço você procura e qual dia funciona para você?",
    hours: (open: string, close: string) => `Atendemos das ${open} às ${close}.`,
    directIntro: (at: string) =>
      `Você responde às mensagens no Direct de ${at}. Escreva em português, com um tom acolhedor e frases curtas.`,
    answerComment:
      "Cumprimente a cliente pelo nome quando souber e responda ao que ela perguntou no comentário.",
    prices: (list: string) =>
      `${PRICES_MARKER} ${list}. Use exatamente esses preços. Se a cliente perguntar por um serviço fora da lista, não invente nem estime o valor.`,
    noCatalog:
      "Ainda não há preços no catálogo. Pergunte qual serviço a cliente procura e diga que a responsável confirmará o valor.",
    promptHours: (open: string, close: string) =>
      `HORÁRIO: o atendimento é das ${open} às ${close}. Sempre ofereça um horário específico dentro desse período.`,
    offerTime: "Sempre ofereça um horário específico em vez de dizer que responderá depois.",
    publicPrompt: (at: string) =>
      `Responda em uma frase acolhedora ao comentário feito em ${at} e acompanhe o tom da cliente. Não informe preços nem horários em público; isso vai pelo Direct. Diga que enviou uma mensagem no Direct e não repita o mesmo texto duas vezes seguidas.`,
    publicFixed: "Oi! Enviei uma mensagem no Direct 💜",
  },
} satisfies Record<AppLanguage, unknown>;

const LOCALE: Record<AppLanguage, string> = { es: "es-CL", en: "en-US", pt: "pt-BR" };

/** "$12.000" / "R$ 80" — the currency the catalogue carries, in her locale. */
export function money(amount: string, currency: string, language: AppLanguage): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  try {
    return new Intl.NumberFormat(LOCALE[language], {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

/** The first services with a price, as "Manicure $12.000, Pedicure $15.000". */
export function priceProse(services: readonly SalonService[], language: AppLanguage, max = 4): string {
  return services
    .filter((s) => s.price && s.title.trim())
    .slice(0, max)
    .map((s) => `${s.title.trim()} ${money(s.price!.amount, s.price!.currency, language)}`)
    .join(", ");
}

const capped = (text: string): string =>
  text.length > FUELY_LIMITS.replyExactTextMax ? text.slice(0, FUELY_LIMITS.replyExactTextMax) : text;

/** The bot's four texts for this salon, in her language. */
export function generatedTexts(language: AppLanguage, facts: SalonFacts): AsistenteTexts {
  const voice = VOICE[language];
  const handle = facts.handle.trim().replace(/^@/, "");
  const at = handle ? `@${handle}` : facts.salonName.trim() || voice.salon;
  const prose = priceProse(facts.services, language);
  const hasHours = !!facts.hours?.open && !!facts.hours?.close;
  const dmFixedText = capped(
    [
      voice.greeting,
      prose ? `${prose}.` : voice.catalogFallback,
      hasHours ? voice.hours(facts.hours!.open, facts.hours!.close) : "",
      voice.question,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const dmPrompt = [
    voice.directIntro(at),
    voice.answerComment,
    prose ? voice.prices(prose) : voice.noCatalog,
    hasHours ? voice.promptHours(facts.hours!.open, facts.hours!.close) : voice.offerTime,
  ].join("\n");
  return {
    dmFixedText,
    dmPrompt,
    publicPrompt: voice.publicPrompt(at),
    publicFixedText: voice.publicFixed,
  };
}
