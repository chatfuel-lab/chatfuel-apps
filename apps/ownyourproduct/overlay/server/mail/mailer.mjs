/**
 * Transactional email, sent by the server and never by Supabase.
 *
 * WHY: Supabase's built-in mail is rate-limited to a handful of messages an
 * hour — enough to test, not enough for a pilot where every signup, invitation
 * and password reset is an email. Links still come from Supabase
 * (auth-links.mjs asks for them without sending anything); the message goes
 * out through a real provider.
 *
 * Configuration, all server-side (nothing here ever reaches the browser):
 *   AGENDA_MAIL_PROVIDER   resend | log | supabase   (default: resend when a
 *                          key is present, otherwise supabase = unchanged)
 *   RESEND_API_KEY         the provider key
 *   AGENDA_MAIL_FROM       sender, e.g. "OwnYourProduct <hola@mail.example.com>"
 *                          — its domain must be verified at the provider
 *   AGENDA_MAIL_REPLY_TO   optional reply-to address
 *   AGENDA_MAIL_BRAND      optional product name in the emails
 *
 * "supabase" keeps today's behaviour, so deploying this changes nothing until
 * the key and sender are set. "log" prints instead of sending (local work).
 */
import { renderMail } from "./templates.mjs";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SENDER_RE = /^(?:[^<>]{1,120}<)?\s*[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+\s*>?$/;

export class MailDeliveryError extends Error {
  constructor(message, { code = "MailDeliveryFailed", status = 0, retryable = false } = {}) {
    super(message);
    this.name = "MailDeliveryError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

/** The mail configuration, and what is wrong with it — names only, never values. */
export function mailerConfigFromEnv(env = process.env) {
  const apiKey = String(env.RESEND_API_KEY ?? "").trim();
  const from = String(env.AGENDA_MAIL_FROM ?? "").trim();
  const replyTo = String(env.AGENDA_MAIL_REPLY_TO ?? "").trim();
  const brand = String(env.AGENDA_MAIL_BRAND ?? "").trim() || "OwnYourProduct";
  const requested = String(env.AGENDA_MAIL_PROVIDER ?? "").trim().toLowerCase();
  const problems = [];
  let provider = requested || (apiKey ? "resend" : "supabase");
  if (!["resend", "log", "supabase"].includes(provider)) {
    problems.push("mail-provider-unknown");
    provider = "supabase";
  }
  if (provider === "resend") {
    if (!apiKey) problems.push("mail-resend-key-missing");
    if (!SENDER_RE.test(from)) problems.push("mail-sender-invalid");
    // A half-configured provider must not swallow signups: fall back to the
    // previous behaviour and say so on the health page.
    if (problems.length) provider = "supabase";
  }
  if (replyTo && !EMAIL_RE.test(replyTo)) problems.push("mail-reply-to-invalid");
  return Object.freeze({ provider, apiKey, from, replyTo: EMAIL_RE.test(replyTo) ? replyTo : "", brand, problems });
}

const resendProvider = ({ apiKey, from, replyTo, fetchImpl, baseUrl = "https://api.resend.com", timeoutMs = 10_000 }) => ({
  async deliver({ to, subject, html, text, idempotencyKey, tags }) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/emails`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          html,
          text,
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(tags?.length ? { tags } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new MailDeliveryError("The mail provider did not answer", { code: "MailProviderUnavailable", retryable: true });
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new MailDeliveryError(
        retryable ? "The mail provider is busy; try again" : "The mail provider refused the message",
        { code: retryable ? "MailProviderUnavailable" : "MailRejected", status: response.status, retryable },
      );
    }
    return { id: typeof payload?.id === "string" ? payload.id : null };
  },
});

const logProvider = (logger) => ({
  async deliver({ to, subject }) {
    // Never the body: it carries a sign-in link.
    logger?.info?.(`[mail] would send "${subject}" to ${to.replace(/(^.).*(@.*$)/, "$1***$2")}`);
    return { id: null };
  },
});

/**
 * `send({ to, template, locale, data, idempotencyKey })` → `{ id }`, or throws
 * MailDeliveryError. `active` is false for the "supabase" provider: callers
 * then keep asking Supabase to send, exactly as before.
 */
export function createMailer({ config = mailerConfigFromEnv(), fetchImpl = globalThis.fetch.bind(globalThis), logger = console } = {}) {
  const provider =
    config.provider === "resend"
      ? resendProvider({ apiKey: config.apiKey, from: config.from, replyTo: config.replyTo, fetchImpl })
      : config.provider === "log"
        ? logProvider(logger)
        : null;
  return Object.freeze({
    active: provider !== null,
    /**
     * Whether a message this mailer accepts actually reaches the recipient.
     * False for "log", which prints the subject and nothing else: a caller
     * that would otherwise report "invitation sent" has to say what really
     * happened and hand the link over itself.
     */
    delivers: config.provider === "resend",
    provider: config.provider,
    problems: config.problems,
    describe: () => ({ provider: config.provider, sender: Boolean(config.from), problems: [...config.problems] }),
    async send({ to, template, locale, data = {}, idempotencyKey }) {
      if (!provider) throw new MailDeliveryError("Transactional mail is not configured", { code: "MailNotConfigured" });
      const address = String(to ?? "").trim();
      if (!EMAIL_RE.test(address)) throw new MailDeliveryError("The recipient address is invalid", { code: "MailRecipientInvalid" });
      const message = renderMail(template, locale, { brand: config.brand, ...data });
      return provider.deliver({
        to: address,
        ...message,
        idempotencyKey,
        tags: [{ name: "template", value: template }],
      });
    },
  });
}
