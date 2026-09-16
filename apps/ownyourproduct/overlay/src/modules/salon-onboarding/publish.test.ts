import { describe, expect, it } from "vitest";
import { getDocMeta, type ModuleClient } from "~api";
import { buildSalonDraft } from "./draft-build";
import { amountOf, planPublish, runPublish, scheduleInput, stepOf } from "./publish";
import { WRITE_ORDER } from "./confirmation";

const draftFor = (country = "cl") =>
  buildSalonDraft({ businessName: "Studio Aurora", country, timezone: "America/Santiago", rubros: ["uñas", "pestañas"], tier: "standard", solo: true, ownerName: "Camila" });

describe("the publish plan", () => {
  it("follows the product's write order and carries anchored prices", () => {
    const draft = draftFor();
    const steps = planPublish({ botId: "bot-1", draft, phone: "+56912345678", address: "Providencia 123", language: "es" });
    const phases = steps.map(stepOf);
    const firstIndex = (p: string) => phases.indexOf(p as (typeof WRITE_ORDER)[number]);
    expect(firstIndex("profile")).toBeLessThan(firstIndex("services"));
    expect(firstIndex("services")).toBeLessThan(firstIndex("specialists"));
    expect(firstIndex("specialists")).toBeLessThan(firstIndex("schedule"));
    expect(steps.filter((s) => s.kind === "service").length).toBe(draft.services.length);
    expect(steps.filter((s) => s.kind === "service").every((s) => s.kind === "service" && s.currency === "CLP" && /^\d+$/.test(s.amount))).toBe(true);
    expect(steps.find((s) => s.kind === "specialist")).toMatchObject({ firstName: "Camila" });
    expect(steps.find((s) => s.kind === "confirmation")).toMatchObject({ enabled: true });
  });

  it("writes money the way the currency counts it", () => {
    expect(amountOf(12000, "CLP")).toBe("12000");
    expect(amountOf(149.9, "MXN")).toBe("149.90");
    expect(amountOf(80, "BRL")).toBe("80.00");
  });

  it("turns the draft schedule into the seven-day wire shape", () => {
    const input = scheduleInput(draftFor().schedule);
    expect(input.enabled).toBe(true);
    expect(input.mon).toMatchObject({ enabled: true, start: "10:00", end: "20:00", break: null });
    expect(input.sun).toMatchObject({ enabled: false });
  });
});

function fakeClient(seed: { services?: { id: string; title: string }[]; specialists?: { id: string; firstName: string }[] } = {}) {
  const calls: { name: string; variables: Record<string, unknown> }[] = [];
  const services = [...(seed.services ?? [])];
  const specialists = [...(seed.specialists ?? [])];
  let n = 0;
  const catalog = () => services.map((s) => ({ __typename: "GoodsService", id: s.id, title: s.title, description: "", durationSeconds: 3600, isAvailable: true, price: null, images: [] }));
  const people = () => specialists.map((p) => ({ __typename: "Specialist", id: p.id, profile: { firstName: p.firstName, lastName: null }, schedule: null, goodsServiceIDs: [] }));
  const client = {
    query: async (doc: Parameters<ModuleClient["query"]>[0]) => {
      const name = getDocMeta(doc).name ?? "";
      if (name === "BookingServices") return { bot: { id: "bot-1", goodsCatalog: catalog() } };
      if (name === "BookingSpecialists") return { bot: { id: "bot-1", specialists: people() } };
      return {};
    },
    mutate: async (doc: Parameters<ModuleClient["mutate"]>[0], variables: Record<string, unknown>) => {
      const name = getDocMeta(doc).name ?? "";
      calls.push({ name, variables });
      if (name === "BookingServiceCreate") { const s = variables.service as { title: string }; services.push({ id: `svc-${++n}`, title: s.title }); return { goodsServiceCreate: { id: "bot-1", goodsCatalog: catalog() } }; }
      if (name === "BookingSpecialistCreate") { const i = variables.info as { profile: { firstName: string } }; specialists.push({ id: `spec-${++n}`, firstName: i.profile.firstName }); return { specialistCreate: { id: "bot-1", specialists: people() } }; }
      return { bot: { id: "bot-1" } };
    },
    subscribe: () => () => undefined,
    onReconnect: () => () => undefined,
  } as unknown as ModuleClient;
  return { client, calls };
}

describe("running the publish", () => {
  it("creates every service, links them to the owner, then writes hours and rules", async () => {
    const draft = draftFor();
    const { client, calls } = fakeClient();
    const phases: string[] = [];
    const report = await runPublish(client, { botId: "bot-1", draft, phone: "+56912345678", address: "Providencia 123", language: "es" }, (p) => phases.push(p));
    expect(report.created.services).toBe(draft.services.length);
    expect(report.created.specialists).toBe(1);
    const spec = calls.find((c) => c.name === "BookingSpecialistCreate")!.variables.info as { goodsServices: string[] };
    expect(spec.goodsServices.length).toBe(draft.services.length);
    expect(calls.map((c) => c.name)).toContain("KBSetBusinessHours");
    expect(calls.map((c) => c.name)).toContain("KBSetAdditionalInstructions");
    expect(calls.map((c) => c.name)).toContain("BookingConfigSetConfirmation");
    expect(calls[0]!.name).toBe("KBSetCompanyName");
    expect(phases).toEqual(["profile", "services", "specialists", "schedule", "rules", "knowledge"]);
  });

  it("reuses what the bot already has instead of duplicating it", async () => {
    const draft = draftFor();
    const first = draft.services[0]!;
    const { client, calls } = fakeClient({ services: [{ id: "svc-old", title: first.name.toUpperCase() + " " }], specialists: [{ id: "spec-old", firstName: "Camila" }] });
    const report = await runPublish(client, { botId: "bot-1", draft, phone: "", address: "", language: "es" });
    expect(report.reused.services).toBe(1);
    expect(report.serviceIds[first.key]).toBe("svc-old");
    expect(report.reused.specialists).toBe(1);
    expect(calls.filter((c) => c.name === "BookingSpecialistCreate")).toHaveLength(0);
    expect(calls.filter((c) => c.name === "BookingServiceCreate")).toHaveLength(draft.services.length - 1);
    expect(calls.find((c) => c.name === "KBSetPhone")).toBeUndefined();
  });
});
