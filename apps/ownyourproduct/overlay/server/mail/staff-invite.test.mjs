import { describe, expect, it } from "vitest";
import { createStaffInviteMailer } from "./staff-invite.mjs";

const fakeMailer = () => {
  const sent = [];
  return { sent, mailer: { delivers: true, describe: () => ({ provider: "fake" }), async send(message) { sent.push(message); return { id: `m-${sent.length}` }; } } };
};
const base = { link: "https://app.example.com/invite?token=abc", role: "specialist", salonName: "Studio Aurora", inviterName: "Camila", locale: "es", appOrigin: "https://app.example.com", client: { key: "c1", shared: false } };

describe("the staff invitation e-mail", () => {
  it("sends the staff_invite template in the salon's language with the link untouched", async () => {
    const { sent, mailer } = fakeMailer();
    const invites = createStaffInviteMailer({ mailer });
    await invites.send({ ...base, to: " Ana@Salon.CL ", name: "Ana" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "ana@salon.cl", template: "staff_invite", locale: "es", data: { link: base.link, name: "Ana", role: "specialist", salonName: "Studio Aurora", inviterName: "Camila" } });
    expect(sent[0].idempotencyKey).toContain("abc");
  });

  it("refuses a bad address, a link to another site, and the sixth mail to one address", async () => {
    const { sent, mailer } = fakeMailer();
    const invites = createStaffInviteMailer({ mailer });
    await expect(invites.send({ ...base, to: "not-an-address" })).rejects.toMatchObject({ code: "MailRecipientInvalid" });
    await expect(invites.send({ ...base, to: "ana@salon.cl", link: "https://evil.example/invite?token=abc" })).rejects.toMatchObject({ code: "MailLinkForeign" });
    for (let i = 0; i < 5; i += 1) await invites.send({ ...base, to: "bea@salon.cl", link: `${base.link}${i}` });
    await expect(invites.send({ ...base, to: "bea@salon.cl", link: `${base.link}9` })).rejects.toMatchObject({ code: "MailThrottled" });
    expect(sent).toHaveLength(5);
  });

  it("says whether it can deliver at all, so the screen falls back to the link", () => {
    const { mailer } = fakeMailer();
    expect(createStaffInviteMailer({ mailer }).delivers).toBe(true);
    expect(createStaffInviteMailer({ mailer: { ...mailer, delivers: false } }).delivers).toBe(false);
  });
});
