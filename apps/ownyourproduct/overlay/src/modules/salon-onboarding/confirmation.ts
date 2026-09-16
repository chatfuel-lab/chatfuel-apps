// The six cards between a generated draft and a salon that exists.
//
// WHY A CARD CAN BE "CONFIRMED" WITHOUT BEING EDITED: everything here arrives
// pre-filled — from the pilot medians, from her country's anchors, from her own
// Instagram. The tap is not data entry, it is her saying "yes, that is my
// salon". An owner who agrees with all six taps six times and is done, which is
// the whole point of generating the draft in the first place.
//
// WHY BLOCKED IS NOT THE SAME AS UNCONFIRMED: a card she has not looked at yet
// is unconfirmed and one tap from done. A card with nothing valid behind it —
// no services, nobody who performs them — cannot be confirmed at all, and
// saying "confirm the prices" to an owner with an empty catalogue is the kind
// of instruction that makes a product feel broken. The two states read
// differently on screen and only one of them is her fault.
//
// WHY ZERO IS AN ANSWER: a deposit of nothing and a cancellation window of
// nothing are both real, common policies. They are never "missing", so they
// never block — the card still has to be confirmed, because a salon that does
// take deposits must not discover the default by losing money to a no-show.
//
// No React and no store: `gate.ts` keeps the same split, so a test can put a
// draft in any shape it likes.

/** The six, in the order they are shown. */
export const CONFIRMATION_CARDS = [
  "negocio",
  "horario",
  "servicios",
  "equipo",
  "deposito",
  "cancelacion",
] as const;

export type ConfirmationCard = (typeof CONFIRMATION_CARDS)[number];

/**
 * The order the draft is written in at "Continuar", and the only order that
 * works: services need the profile's currency, specialists are linked to
 * service ids, a schedule belongs to a specialist, and the rules and the FAQ
 * both quote prices that must already exist.
 */
export const WRITE_ORDER = [
  "profile",
  "services",
  "specialists",
  "schedule",
  "rules",
  "knowledge",
] as const;

export type WriteStep = (typeof WRITE_ORDER)[number];

/** Which card an owner should be sent to when a write step fails. */
const STEP_CARD: Record<WriteStep, ConfirmationCard> = {
  profile: "negocio",
  services: "servicios",
  specialists: "equipo",
  schedule: "horario",
  // The rules card carries both money policies; the deposit is the one an
  // owner recognises, and the cancellation card sits next to it either way.
  rules: "deposito",
  // Nothing on screen is called "knowledge". The FAQ is generated from the
  // catalogue and quotes it, so a failure there is a question about services.
  knowledge: "servicios",
};

export function cardForWriteStep(step: WriteStep): ConfirmationCard {
  return STEP_CARD[step];
}

/** What the draft holds, reduced to what the cards actually judge. */
export interface DraftFacts {
  businessName: string;
  address: string;
  phone: string;
  timezone: string;
  /** At least one weekday the salon is open, with an end after its start. */
  hasWorkingDay: boolean;
  serviceCount: number;
  /** Whether anybody performs at least one of those services. */
  specialistCount: number;
  /** Zero is a policy, not a gap. */
  depositAmount: number;
  cancellationHours: number;
}

export type CardStatus = "confirmed" | "pending" | "blocked";

export interface CardState {
  card: ConfirmationCard;
  status: CardStatus;
  /**
   * Why it cannot be confirmed, as a stable key the copy layer turns into a
   * sentence. Null unless the status is "blocked".
   */
  blockedBy: string | null;
}

/**
 * The phone is the one field an owner cannot skip: it is the number her
 * WhatsApp reminders are sent from, so a salon without it books clients it can
 * never remind. The address is deliberately NOT required — home-based
 * professionals do not publish one, and the assistant tells the client where to
 * come once the booking is made.
 */
function blockReason(card: ConfirmationCard, facts: DraftFacts): string | null {
  switch (card) {
    case "negocio":
      if (!facts.businessName.trim()) return "no-business-name";
      if (!facts.phone.trim()) return "no-phone";
      return null;
    case "horario":
      if (!facts.timezone.trim()) return "no-timezone";
      if (!facts.hasWorkingDay) return "no-working-day";
      return null;
    case "servicios":
      return facts.serviceCount > 0 ? null : "no-services";
    case "equipo":
      return facts.specialistCount > 0 ? null : "no-specialist";
    case "deposito":
    case "cancelacion":
      return null;
  }
}

export function cardStates(
  facts: DraftFacts,
  confirmed: readonly ConfirmationCard[],
): CardState[] {
  const done = new Set(confirmed);
  return CONFIRMATION_CARDS.map((card) => {
    const blockedBy = blockReason(card, facts);
    // Blocked wins over confirmed: a card she confirmed and then emptied — by
    // deleting her last service, say — is not still agreed to.
    if (blockedBy) return { card, status: "blocked" as const, blockedBy };
    return {
      card,
      status: done.has(card) ? ("confirmed" as const) : ("pending" as const),
      blockedBy: null,
    };
  });
}

export interface ContinuarState {
  ready: boolean;
  /** Cards she still has to look at. */
  pending: ConfirmationCard[];
  /** Cards she cannot confirm yet, whatever she taps. */
  blocked: ConfirmationCard[];
}

/**
 * Whether the draft may be written to Chatfuel.
 *
 * This is the boundary the whole design rests on: before it returns true,
 * nothing about this salon has left the browser. `pending` and `blocked` are
 * returned separately because "faltan 2 cosas" pointing at a card she can fix
 * and one she cannot are two different sentences.
 */
export function continuarState(
  facts: DraftFacts,
  confirmed: readonly ConfirmationCard[],
): ContinuarState {
  const states = cardStates(facts, confirmed);
  const pending = states.filter((s) => s.status === "pending").map((s) => s.card);
  const blocked = states.filter((s) => s.status === "blocked").map((s) => s.card);
  return { ready: pending.length === 0 && blocked.length === 0, pending, blocked };
}
