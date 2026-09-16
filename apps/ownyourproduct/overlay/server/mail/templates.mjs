/**
 * The product's transactional emails, in the three languages the app speaks.
 *
 * Every dynamic value is escaped before it reaches the HTML, and every email
 * carries a plain-text twin with the raw link: a mail client that strips the
 * button still has something to tap. The words are the app's own register —
 * "tú", short sentences, what happens when she taps and when the link expires.
 */

export const MAIL_LOCALES = ["es", "en", "pt"];
export const MAIL_TEMPLATES = ["verify_email", "access_recovery", "login_link", "account_invite", "staff_invite", "notice"];

const COPY = {
  es: {
    greeting: (name) => (name ? `Hola, ${name}:` : "Hola:"),
    ignore: "Si no esperabas este correo, puedes ignorarlo.",
    fallback: "Si el botón no funciona, copia este enlace en tu navegador:",
    verify_email: {
      subject: (d) => `Confirma tu correo en ${d.brand}`,
      lines: () => ["Toca el botón para confirmar tu correo y entrar a tu agenda."],
      action: "Confirmar correo",
      footer: "El enlace sirve una sola vez.",
    },
    access_recovery: {
      subject: (d) => `Recupera el acceso a ${d.brand}`,
      lines: () => ["Recibimos una solicitud para crear una contraseña nueva. El enlace vence en 1 hora."],
      action: "Crear una contraseña nueva",
      footer: "Si no fuiste tú, ignora este correo: tu contraseña no cambia.",
    },
    login_link: {
      subject: (d) => `Tu enlace para entrar a ${d.brand}`,
      lines: () => ["Toca el botón para entrar. El enlace sirve una sola vez y vence en 1 hora."],
      action: "Entrar",
      footer: "Nadie de nuestro equipo te pedirá este enlace.",
    },
    account_invite: {
      subject: (d) => `Te dieron acceso a ${d.brand}`,
      lines: (d) => [d.inviterName ? `${d.inviterName} te dio acceso a ${d.brand}.` : `Te dieron acceso a ${d.brand}.`, "Toca el botón para crear tu contraseña y entrar."],
      action: "Aceptar invitación",
      footer: "La invitación sirve una sola vez.",
    },
    staff_invite: {
      subject: (d) => `${d.salonName} te invitó a su agenda`,
      lines: (d) => [
        `${d.inviterName || d.salonName} te invitó a ${d.salonName} en ${d.brand} como ${d.roleLabel}.`,
        "Toca el botón para aceptar y crear tu acceso.",
      ],
      action: "Aceptar invitación",
      footer: "Si no conoces a este salón, ignora este correo.",
      roles: { specialist: "especialista", manager: "gerente" },
    },
    notice: { subject: (d) => d.title, lines: (d) => [d.body], action: "Abrir", footer: "" },
  },
  en: {
    greeting: (name) => (name ? `Hi ${name},` : "Hi,"),
    ignore: "If you were not expecting this email, you can ignore it.",
    fallback: "If the button does not work, paste this link into your browser:",
    verify_email: {
      subject: (d) => `Confirm your email for ${d.brand}`,
      lines: () => ["Tap the button to confirm your email and open your calendar."],
      action: "Confirm email",
      footer: "The link works once.",
    },
    access_recovery: {
      subject: (d) => `Get back into ${d.brand}`,
      lines: () => ["We received a request to set a new password. The link expires in 1 hour."],
      action: "Set a new password",
      footer: "If this was not you, ignore this email: your password stays the same.",
    },
    login_link: {
      subject: (d) => `Your link to sign in to ${d.brand}`,
      lines: () => ["Tap the button to sign in. The link works once and expires in 1 hour."],
      action: "Sign in",
      footer: "Nobody from our team will ever ask you for this link.",
    },
    account_invite: {
      subject: (d) => `You have access to ${d.brand}`,
      lines: (d) => [d.inviterName ? `${d.inviterName} gave you access to ${d.brand}.` : `You were given access to ${d.brand}.`, "Tap the button to create your password and sign in."],
      action: "Accept invitation",
      footer: "The invitation works once.",
    },
    staff_invite: {
      subject: (d) => `${d.salonName} invited you to their calendar`,
      lines: (d) => [
        `${d.inviterName || d.salonName} invited you to ${d.salonName} on ${d.brand} as ${d.roleLabel}.`,
        "Tap the button to accept and create your access.",
      ],
      action: "Accept invitation",
      footer: "If you do not know this salon, ignore this email.",
      roles: { specialist: "a specialist", manager: "a manager" },
    },
    notice: { subject: (d) => d.title, lines: (d) => [d.body], action: "Open", footer: "" },
  },
  pt: {
    greeting: (name) => (name ? `Oi, ${name}:` : "Oi:"),
    ignore: "Se você não esperava este e-mail, pode ignorá-lo.",
    fallback: "Se o botão não funcionar, copie este link no seu navegador:",
    verify_email: {
      subject: (d) => `Confirme seu e-mail no ${d.brand}`,
      lines: () => ["Toque no botão para confirmar seu e-mail e abrir sua agenda."],
      action: "Confirmar e-mail",
      footer: "O link funciona uma única vez.",
    },
    access_recovery: {
      subject: (d) => `Recupere o acesso ao ${d.brand}`,
      lines: () => ["Recebemos um pedido para criar uma senha nova. O link vence em 1 hora."],
      action: "Criar uma senha nova",
      footer: "Se não foi você, ignore este e-mail: sua senha não muda.",
    },
    login_link: {
      subject: (d) => `Seu link para entrar no ${d.brand}`,
      lines: () => ["Toque no botão para entrar. O link funciona uma única vez e vence em 1 hora."],
      action: "Entrar",
      footer: "Ninguém da nossa equipe vai pedir este link.",
    },
    account_invite: {
      subject: (d) => `Você recebeu acesso ao ${d.brand}`,
      lines: (d) => [d.inviterName ? `${d.inviterName} deu acesso a você ao ${d.brand}.` : `Você recebeu acesso ao ${d.brand}.`, "Toque no botão para criar sua senha e entrar."],
      action: "Aceitar convite",
      footer: "O convite funciona uma única vez.",
    },
    staff_invite: {
      subject: (d) => `${d.salonName} convidou você para a agenda`,
      lines: (d) => [
        `${d.inviterName || d.salonName} convidou você para ${d.salonName} no ${d.brand} como ${d.roleLabel}.`,
        "Toque no botão para aceitar e criar seu acesso.",
      ],
      action: "Aceitar convite",
      footer: "Se você não conhece este salão, ignore este e-mail.",
      roles: { specialist: "especialista", manager: "gerente" },
    },
    notice: { subject: (d) => d.title, lines: (d) => [d.body], action: "Abrir", footer: "" },
  },
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** Only an https link may become a button; anything else is a bug upstream. */
const safeLink = (value) => {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost" ? url.toString() : null;
  } catch {
    return null;
  }
};

/**
 * A greeting is the one place a stranger's words could reach somebody else's
 * inbox in our name: the signup form takes a name before the address behind it
 * is verified. Only something shaped like a name survives — letters, spaces, a
 * hyphen or an apostrophe, at most two words — so a "name" carrying a phone
 * number, a link or a warning simply becomes "Hola:".
 */
const personalName = (value) => {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw || raw.length > 60) return "";
  if (!/^[\p{L}][\p{L}\p{M}'\u2019\- ]*$/u.test(raw)) return "";
  return raw.split(" ").slice(0, 2).join(" ").slice(0, 40);
};

/** One line of somebody's own words: no links, no markup, nothing long. */
const plainField = (value, max = 60) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/(?:https?:\/\/|www\.)\S*/gi, "")
    .replace(/[<>{}]/g, "")
    .trim()
    .slice(0, max);

export const mailLocale = (value) => {
  const code = String(value ?? "").trim().toLowerCase();
  if (code.startsWith("pt")) return "pt";
  if (code.startsWith("en")) return "en";
  return "es";
};

/**
 * `{ subject, text, html }` for one email. `data.link` is required for every
 * template but `notice`; a template that needs a link and has none is refused
 * rather than sent with a dead button.
 */
export function renderMail(template, locale, data = {}) {
  if (!MAIL_TEMPLATES.includes(template)) throw new Error(`Unknown mail template: ${template}`);
  const t = COPY[mailLocale(locale)];
  const copy = t[template];
  const brand = String(data.brand ?? "OwnYourProduct").trim() || "OwnYourProduct";
  const roleLabel = copy.roles ? copy.roles[data.role] ?? copy.roles.specialist : "";
  const fields = {
    ...data,
    brand,
    roleLabel,
    // A salon's own name and its manager's, written by them and read in a
    // subject line: one line, no links, no room for a message of their own.
    ...(data.salonName === undefined ? {} : { salonName: plainField(data.salonName) }),
    ...(data.inviterName === undefined ? {} : { inviterName: plainField(data.inviterName) }),
  };
  const link = safeLink(data.link);
  if (template !== "notice" && !link) throw new Error(`Mail template ${template} needs an https link`);
  const subject = String(copy.subject(fields) ?? brand).slice(0, 200);
  const lines = copy.lines(fields).filter(Boolean);
  const greeting = t.greeting(personalName(data.name));
  const text = [
    greeting,
    "",
    ...lines,
    ...(link ? ["", `${copy.action}: ${link}`] : []),
    ...(copy.footer ? ["", copy.footer] : []),
    "",
    t.ignore,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f5fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2233">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #ece6f3">
<p style="margin:0 0 16px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8e3cda">${escapeHtml(brand)}</p>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${escapeHtml(greeting)}</p>
${lines.map((line) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${escapeHtml(line)}</p>`).join("\n")}
${link ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 22px;border-radius:12px;background:#8e3cda;color:#ffffff;font-weight:700;text-decoration:none">${escapeHtml(copy.action)}</a></p>
<p style="margin:0 0 6px;font-size:13px;color:#6f6380">${escapeHtml(t.fallback)}</p>
<p style="margin:0 0 16px;font-size:13px;word-break:break-all"><a href="${escapeHtml(link)}" style="color:#8e3cda">${escapeHtml(link)}</a></p>` : ""}
${copy.footer ? `<p style="margin:16px 0 0;font-size:13px;color:#6f6380">${escapeHtml(copy.footer)}</p>` : ""}
<p style="margin:8px 0 0;font-size:13px;color:#6f6380">${escapeHtml(t.ignore)}</p>
</div></body></html>`;
  return { subject, text, html };
}
