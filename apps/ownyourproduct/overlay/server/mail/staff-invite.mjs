/**
 * One e-mail: the invitation a manager sends from Team. The mailer, the
 * templates (es / en / pt) and the per-address brake are the product's own
 * files next to this one; this is the seam the server mounts.
 *
 * Wire it where the app's server handles routes (see the playbook): read the
 * signed-in user's tenant from the auth gate, take `{ to, link, name, role,
 * salonName, inviterName, locale }` from the JSON body, and call
 * `sendStaffInvite`. Never accept a `link` from the browser that points
 * outside this app's origin — build it from the invite token server-side.
 *
 * Env (server-side only, never VITE_*):
 *   RESEND_API_KEY      the provider key; without it the mailer logs instead of sending
 *   AGENDA_MAIL_FROM    the sender, e.g. "Studio Aurora <hola@mail.example.com>"
 *   AGENDA_MAIL_BRAND   optional product name inside the e-mails
 */
import { createMailer, mailerConfigFromEnv } from "./mailer.mjs";
import { createMailThrottle } from "./throttle.mjs";
import { mailLocale } from "./templates.mjs";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function createStaffInviteMailer({ env = process.env, logger = console, mailer = createMailer({ config: mailerConfigFromEnv(env), logger }), throttle = createMailThrottle() } = {}) {
  return {
    /** Whether a real provider is configured; the UI shows the link to copy when it is not. */
    delivers: mailer.delivers === true,
    describe: () => mailer.describe(),
    /**
     * @param {{ to: string, link: string, name?: string, role: 'manager'|'specialist', salonName: string, inviterName?: string, locale?: string, client?: { key: string, shared: boolean }, appOrigin: string }} input
     */
    async send(input) {
      const to = String(input.to ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(to)) throw Object.assign(new Error("The recipient address is invalid"), { code: "MailRecipientInvalid", status: 422 });
      let link;
      try { link = new URL(String(input.link ?? "")); } catch { throw Object.assign(new Error("The invitation link is invalid"), { code: "MailLinkInvalid", status: 422 }); }
      if (link.origin !== String(input.appOrigin ?? "")) throw Object.assign(new Error("The invitation link must point at this app"), { code: "MailLinkForeign", status: 422 });
      if (!throttle.allow(to, input.client ?? { key: "unknown", shared: true }, { scope: "invite" })) {
        throw Object.assign(new Error("Too many invitations to this address; try again later"), { code: "MailThrottled", status: 429 });
      }
      return mailer.send({
        to,
        template: "staff_invite",
        locale: mailLocale(input.locale),
        data: {
          link: link.toString(),
          name: String(input.name ?? "").trim(),
          role: input.role === "manager" ? "manager" : "specialist",
          salonName: String(input.salonName ?? "").trim(),
          inviterName: String(input.inviterName ?? "").trim(),
        },
        idempotencyKey: `staff-invite:${to}:${link.searchParams.get("token") ?? link.pathname}`,
      });
    },
  };
}
