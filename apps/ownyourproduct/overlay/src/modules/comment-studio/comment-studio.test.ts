import { describe, expect, it } from "vitest";
import { getDocMeta, type ModuleClient } from "~api";
import {
  CommentStudioUnavailable,
  normalizeKeywords,
  planCommentStudio,
  runCommentStudioPlan,
  type Activation,
  type WriteStep,
} from "./apply";
import { commentStudioFromAutomations, commentStudioStatus } from "./comment-studio-model";
import type { FuelyAutomation } from "./lib/fuely";
import { copy, defineCopy, live } from "./lib/language";
import { KEYWORD_RULE_NAME, readMode } from "./modes";
import { generatedTexts } from "./prefill";

type Setting = FuelyAutomation["settings"][number];

const setting = (value: Record<string, unknown>): Setting =>
  ({ inheritsFrom: null, canInheritFrom: [], ...value }) as unknown as Setting;

const automation = (
  scope: FuelyAutomation["scope"],
  patch: Partial<FuelyAutomation> & { settings?: Setting[] },
): FuelyAutomation =>
  ({
    __typename: "FuelyAutomation",
    id: `${scope}-${patch.isBase === false ? "rule" : "base"}`,
    isBase: true,
    name: null,
    enabled: false,
    scope,
    updatedAt: "2026-09-15T00:00:00Z",
    settings: [],
    ...patch,
  }) as FuelyAutomation;

/** A bot straight out of Chatfuel: every base on, AI everywhere. */
const factoryBot = (): FuelyAutomation[] => [
  automation("All", { enabled: true, settings: [setting({ __typename: "FuelySettingBookingRules", autonomyLevel: "BookWithFullAutonomy" })] }),
  automation("InstagramDirectMessages", { enabled: true }),
  automation("InstagramIgMeLinks", { enabled: true }),
  automation("InstagramStoryReplies", { enabled: true }),
  automation("InstagramPostComments", {
    enabled: true,
    settings: [
      setting({ __typename: "FuelySettingPublicReply", publicReplyHowToReply: "UsingAI", exactTextReply: "", messagePrompt: "", likeContactComment: false }),
      setting({ __typename: "FuelySettingPrivateReply", privateReplyHowToReply: "UsingAI", exactTextReply: "", messagePrompt: "" }),
    ],
  }),
];

const rule = (enabled: boolean, keywords = ["precio"], postIds: string[] = []): FuelyAutomation =>
  automation("InstagramPostComments", {
    id: "rule-1",
    isBase: false,
    name: KEYWORD_RULE_NAME,
    enabled,
    settings: [
      setting({ __typename: "FuelySettingKeywords", reactTo: "CommentThatContains", keywords }),
      setting({ __typename: "FuelySettingListOfPosts", posts: postIds.map((postID) => ({ postID, contactScopeID: "ig-1" })) }),
      setting({ __typename: "FuelySettingPublicReply", publicReplyHowToReply: "ExactText", exactTextReply: "¡Hola! Te escribí al Direct 💜", messagePrompt: "p", likeContactComment: false }),
      setting({ __typename: "FuelySettingPrivateReply", privateReplyHowToReply: "ExactText", exactTextReply: "Hola, precios…", messagePrompt: "d" }),
    ],
  });

/** The shape Comment Studio leaves behind: DM surfaces off, the rule on. */
const studioBot = (): FuelyAutomation[] =>
  factoryBot().map((a) => (a.scope === "All" ? a : { ...a, enabled: false })).concat(rule(true));

const activation: Activation = {
  mode: "lite",
  options: { publicOn: true, storiesOn: false, keywordsOn: true, keywords: ["precio", "hora"], postIds: [], publicReplyMode: "fixed", privateReplyMode: "fixed" },
  texts: { dmFixedText: "Hola", dmPrompt: "d", publicPrompt: "p", publicFixedText: "¡Hola! Te escribí al Direct 💜" },
};

describe("reading the bot", () => {
  it("a factory bot is the AI assistant, not Comment Studio", () => {
    expect(readMode(factoryBot()).mode).toBe("full");
    expect(commentStudioStatus(factoryBot())).toBe("aiBooking");
  });

  it("the studio shape reads as running; a hand-enabled DM surface as drifted", () => {
    expect(commentStudioStatus(studioBot())).toBe("running");
    // The Direct base decides the mode: on again means the AI assistant is back.
    const dmBack = studioBot().map((a) => (a.scope === "InstagramDirectMessages" ? { ...a, enabled: true } : a));
    expect(readMode(dmBack).mode).toBe("full");
    expect(commentStudioStatus(dmBack)).toBe("aiBooking");
    // A link in bio switched on by hand is an AI conversation Comment Studio does not own.
    const linkOnly = studioBot().map((a) => (a.scope === "InstagramIgMeLinks" ? { ...a, enabled: true } : a));
    expect(readMode(linkOnly).drifted).toBe(true);
    expect(commentStudioStatus(linkOnly)).toBe("drifted");
  });

  it("her own words and her chosen posts survive a read-back; the generated draft does not", () => {
    const generated = generatedTexts("es", { handle: "salon", salonName: "", services: [], hours: null });
    const bot = factoryBot().map((a) => (a.scope === "All" ? a : { ...a, enabled: false })).concat(rule(true, ["precio"], ["post-1", "post-2"]));
    const settings = commentStudioFromAutomations(bot, generated, "es");
    expect(settings?.keywords).toEqual(["precio"]);
    expect(settings?.postTarget).toBe("selected");
    expect(settings?.postIds).toEqual(["post-1", "post-2"]);
    expect(settings?.publicText).toBeNull(); // equals the generated public reply
    expect(settings?.directText).toBe("Hola, precios…");
  });
});

describe("planning the writes", () => {
  it("disarms every runner, creates the rule once, shapes it, then enables it", () => {
    const steps = planCommentStudio(factoryBot(), activation);
    expect(steps.map((s) => s.kind)).toEqual([
      "disable", "disable", "disable", "disable",
      "create", "keywords", "posts", "publicReply", "privateReply", "enable",
    ]);
    const disabled = steps.flatMap((s) => (s.kind === "disable" ? [s.id] : []));
    expect(disabled).toEqual([
      "InstagramDirectMessages-base",
      "InstagramIgMeLinks-base",
      "InstagramPostComments-base",
      "InstagramStoryReplies-base",
    ]);
    expect(steps.find((s) => s.kind === "keywords")).toMatchObject({ id: null, keywords: ["precio", "hora"] });
  });

  it("re-uses the existing rule and skips what is already off", () => {
    const steps = planCommentStudio(studioBot(), activation);
    expect(steps.filter((s) => s.kind === "create")).toHaveLength(0);
    // Only the running rule itself needs disarming before it is rewritten.
    expect(steps.flatMap((s) => (s.kind === "disable" ? [s.id] : []))).toEqual(["rule-1"]);
    expect(steps.at(-1)).toEqual({ kind: "enable", id: "rule-1" });
  });

  it("public off writes DontReply but keeps the text for later", () => {
    const off: Activation = { ...activation, options: { ...activation.options, publicOn: false, publicReplyMode: "off" } };
    const step = planCommentStudio(studioBot(), off).find((s) => s.kind === "publicReply");
    expect(step).toMatchObject({ on: false, text: "¡Hola! Te escribí al Direct 💜" });
  });

  it("normalizes whatever fed it: case, spaces, duplicates, limits", () => {
    expect(normalizeKeywords(["Precio", "precio ", "  cuánto   sale ", "", "x".repeat(51)])).toEqual(["precio", "cuánto sale"]);
    expect(normalizeKeywords(Array.from({ length: 60 }, (_, i) => `k${i}`))).toHaveLength(50);
    const messy: Activation = { ...activation, options: { ...activation.options, keywords: ["Precio", "precio "], postIds: [" p1 ", "p1", ""] } };
    const steps = planCommentStudio(studioBot(), messy);
    expect(steps.find((s) => s.kind === "keywords")).toMatchObject({ keywords: ["precio"] });
    expect(steps.find((s) => s.kind === "posts")).toMatchObject({ postIds: ["p1"] });
  });

  it("refuses a bot without an Instagram comment surface before touching anything", () => {
    const noInstagram = factoryBot().filter((a) => !a.scope.startsWith("Instagram"));
    expect(() => planCommentStudio(noInstagram, activation)).toThrow(CommentStudioUnavailable);
  });
});

/** A client that records mutations and answers with the shapes the runner reads. */
function fakeClient(options: { failEnableTimes?: number } = {}) {
  const calls: { name: string; variables: Record<string, unknown> }[] = [];
  let enableFailures = options.failEnableTimes ?? 0;
  const client = {
    query: async () => ({}),
    mutate: async (doc: Parameters<ModuleClient["mutate"]>[0], variables: Record<string, unknown>) => {
      const name = getDocMeta(doc).name ?? "";
      calls.push({ name, variables });
      if (name === "FuelyAutomationCreate") return { fuelyAutomationCreate: { id: "new-1" } };
      if (name === "FuelyAutomationSetEnabled" && variables.enabled === true && enableFailures > 0) {
        enableFailures -= 1;
        throw Object.assign(new Error("locked"), { locked: true });
      }
      return { fuelyAutomationUpdateSetting: { id: variables.automationID } };
    },
    subscribe: () => () => undefined,
    onReconnect: () => () => undefined,
  } as unknown as ModuleClient;
  return { client, calls };
}

describe("running the plan", () => {
  it("shapes and enables the rule it just created, in order", async () => {
    const { client, calls } = fakeClient();
    const steps: WriteStep[] = planCommentStudio(factoryBot(), activation);
    const seen: string[] = [];
    await runCommentStudioPlan(client, "bot-1", steps, { onStep: (s) => seen.push(s.kind), wait: async () => undefined });
    expect(seen).toEqual(steps.map((s) => s.kind));
    const created = calls.findIndex((c) => c.name === "FuelyAutomationCreate");
    expect(created).toBeGreaterThan(0);
    for (const call of calls.slice(created + 1)) expect(call.variables.automationID).toBe("new-1");
    expect(calls.at(-1)).toMatchObject({ name: "FuelyAutomationSetEnabled", variables: { automationID: "new-1", enabled: true } });
    expect(calls.find((c) => c.name === "FuelySettingSetPublicReply")?.variables.update).toMatchObject({ likeContactComment: false });
  });

  it("retries a locked write with back-off and gives up after the last attempt", async () => {
    const waits: number[] = [];
    const { client, calls } = fakeClient({ failEnableTimes: 2 });
    await runCommentStudioPlan(client, "bot-1", [{ kind: "enable", id: "rule-1" }], {
      wait: async (ms) => { waits.push(ms); },
      retryable: (err) => (err as { locked?: boolean }).locked === true,
    });
    expect(waits).toEqual([500, 1500]);
    expect(calls).toHaveLength(3);

    const stubborn = fakeClient({ failEnableTimes: 10 });
    await expect(
      runCommentStudioPlan(stubborn.client, "bot-1", [{ kind: "enable", id: "rule-1" }], {
        wait: async () => undefined,
        retryable: (err) => (err as { locked?: boolean }).locked === true,
      }),
    ).rejects.toThrow("locked");
    expect(stubborn.calls).toHaveLength(4); // one try + three retries
  });
});

describe("generated texts", () => {
  it("quote the catalogue in her language and stay under Chatfuel's limit", () => {
    const texts = generatedTexts("pt", {
      handle: "@studio",
      salonName: "Studio",
      services: [
        { title: "Manicure", price: { amount: "80", currency: "BRL" } },
        { title: "Sem preço", price: null },
      ],
      hours: { open: "09:00", close: "19:00" },
    });
    expect(texts.dmFixedText).toContain("Manicure");
    expect(texts.dmFixedText).toContain("80");
    expect(texts.dmFixedText).toContain("09:00");
    expect(texts.dmPrompt).toContain("@studio");
    expect(texts.dmFixedText.length).toBeLessThanOrEqual(1000);
  });

  it("without a catalogue promise prices by Direct instead of inventing them", () => {
    const texts = generatedTexts("en", { handle: "", salonName: "", services: [], hours: null });
    expect(texts.dmFixedText).toContain("prices");
    expect(texts.dmPrompt).toContain("no prices");
  });
});

describe("language shim", () => {
  it("falls back to Spanish and reads live", () => {
    const table = defineCopy("test.table", { es: { hi: "hola" }, en: { hi: "hi" } });
    expect(copy(table, "pt").hi).toBe("hola");
    expect(copy(table, "en").hi).toBe("hi");
    expect(live(table).hi).toBe(copy(table).hi);
  });
});
