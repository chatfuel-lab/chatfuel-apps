/**
 * The writes Comment Studio makes, as a plan first and mutations second.
 *
 * Order matters and is the product's, proven in production: disarm every
 * Instagram runner before touching a setting it could execute, then shape the
 * keyword rule, then enable it. The plan is pure so a test can read it; the
 * runner retries only Chatfuel's edit lock and re-reads the bot at the end so
 * the caller can tell whether the bot really ended up in shape.
 *
 * One deliberate deviation from the product: its lite activation also rewrote
 * the light preset onto the dormant Instagram Direct base (incoming messages,
 * follow-ups, hand-off) and re-asserted the DM and story bases off at the end.
 * That base stays disabled here and nothing reads it, so the port leaves it
 * untouched; `commentStudioStatus` reads the same "running" either way.
 */
import type { ModuleClient } from "~api";
import { nestedErrorCodes } from "~api";
import {
  FuelyAutomationCreateDocument,
  FuelyAutomationListDocument,
  FuelyAutomationScope,
  FuelyAutomationSetEnabledDocument,
  FuelySettingKeywordsReactTo,
  FuelySettingPrivateReplyHowToReply,
  FuelySettingPublicReplyHowToReply,
  FuelySettingSetKeywordsDocument,
  FuelySettingSetListOfPostsDocument,
  FuelySettingSetPrivateReplyDocument,
  FuelySettingSetPublicReplyDocument,
} from "~api/generated/automations/graphql";
import { FUELY_LIMITS, asAutomations, type FuelyAutomation } from "./lib/fuely";
import { baseOf } from "./data";
import { COMMENT_SCOPES, DM_SCOPES, KEYWORD_RULE_NAME, keywordRuleOf, keywordRulesOf, type ModeOptions } from "./modes";
import type { AsistenteTexts } from "./prefill";

export interface Activation {
  mode: "lite";
  options: ModeOptions;
  texts: AsistenteTexts;
}

/** `id: null` names the rule this same plan creates. */
export type WriteStep =
  | { kind: "disable"; id: string; what: string }
  | { kind: "create"; name: string }
  | { kind: "keywords"; id: string | null; keywords: string[] }
  | { kind: "posts"; id: string | null; postIds: string[] }
  | { kind: "publicReply"; id: string | null; on: boolean; text: string; prompt: string }
  | { kind: "privateReply"; id: string | null; text: string; prompt: string }
  | { kind: "enable"; id: string | null };

/** The bot has no Instagram comment surface: nothing to write on until Instagram is connected. */
export class CommentStudioUnavailable extends Error {
  readonly code = "InstagramNotConnected" as const;
  constructor() {
    super("Instagram comment automations are unavailable: connect Instagram to the bot first");
    this.name = "CommentStudioUnavailable";
  }
}

/** Can a plan be written at all? The same check `planCommentStudio` enforces. */
export function canPlanCommentStudio(all: readonly FuelyAutomation[]): boolean {
  return !!keywordRuleOf(all, "InstagramPostComments") || !!baseOf(all, "InstagramPostComments");
}

/** Trimmed, single-spaced, lower-case, unique, within Chatfuel's limits — whatever fed the plan. */
export function normalizeKeywords(values: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, " ").toLowerCase();
    if (value && value.length <= FUELY_LIMITS.keywordMaxLength) seen.add(value);
    if (seen.size >= FUELY_LIMITS.keywordsMax) break;
  }
  return [...seen];
}

export function normalizePostIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, FUELY_LIMITS.postsMax);
}

export function planCommentStudio(all: readonly FuelyAutomation[], activation: Activation): WriteStep[] {
  if (!canPlanCommentStudio(all)) throw new CommentStudioUnavailable();

  const steps: WriteStep[] = [];
  const disable = (a: FuelyAutomation | null, what: string) => {
    if (a?.enabled) steps.push({ kind: "disable", id: a.id, what });
  };
  for (const scope of DM_SCOPES) disable(baseOf(all, scope), scope);
  for (const scope of COMMENT_SCOPES) {
    for (const rule of keywordRulesOf(all, scope)) disable(rule, `${scope} rule`);
    disable(baseOf(all, scope), scope);
  }
  disable(baseOf(all, "InstagramStoryReplies"), "InstagramStoryReplies");

  const existing = keywordRuleOf(all, "InstagramPostComments");
  const id = existing?.id ?? null;
  if (!existing) steps.push({ kind: "create", name: KEYWORD_RULE_NAME });

  const { options, texts } = activation;
  steps.push({ kind: "keywords", id, keywords: normalizeKeywords(options.keywords ?? []) });
  steps.push({ kind: "posts", id, postIds: normalizePostIds(options.postIds ?? []) });
  steps.push({
    kind: "publicReply",
    id,
    on: options.publicReplyMode === "fixed" || (options.publicReplyMode === undefined && options.publicOn),
    text: texts.publicFixedText,
    prompt: texts.publicPrompt,
  });
  steps.push({ kind: "privateReply", id, text: texts.dmFixedText, prompt: texts.dmPrompt });
  steps.push({ kind: "enable", id });
  return steps;
}

export async function loadAutomations(client: ModuleClient, botId: string): Promise<FuelyAutomation[]> {
  const data = await client.query(FuelyAutomationListDocument, { botID: botId });
  return asAutomations(data.bot?.fuelyAutomations ?? []);
}

export const LOCK_BACKOFF_MS = [500, 1500, 3000] as const;
export const isEditLock = (err: unknown): boolean => nestedErrorCodes(err).includes("FuelyAutomationBeingEdited");
const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RunOptions {
  onStep?: (step: WriteStep, index: number) => void;
  /** Injectable so a test does not sleep through the back-off. */
  wait?: (ms: number) => Promise<void>;
  /** Which failures are worth another attempt; Chatfuel's edit lock by default. */
  retryable?: (err: unknown) => boolean;
}

async function withLockRetry<T>(
  run: () => Promise<T>,
  wait: (ms: number) => Promise<void>,
  retryable: (err: unknown) => boolean,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      if (!retryable(err) || attempt >= LOCK_BACKOFF_MS.length) throw err;
      await wait(LOCK_BACKOFF_MS[attempt]!);
    }
  }
}

export async function runCommentStudioPlan(
  client: ModuleClient,
  botId: string,
  steps: readonly WriteStep[],
  { onStep, wait = defaultWait, retryable = isEditLock }: RunOptions = {},
): Promise<void> {
  let createdId: string | null = null;
  const idOf = (id: string | null): string => {
    const resolved = id ?? createdId;
    if (!resolved) throw new Error("Comment Studio plan refers to a rule it has not created");
    return resolved;
  };
  const botID = botId;
  for (const [index, step] of steps.entries()) {
    onStep?.(step, index);
    await withLockRetry(async () => {
      switch (step.kind) {
        case "disable":
          await client.mutate(FuelyAutomationSetEnabledDocument, { botID, automationID: step.id, enabled: false });
          return;
        case "create": {
          const data = await client.mutate(FuelyAutomationCreateDocument, {
            botID,
            scope: FuelyAutomationScope.InstagramPostComments,
            name: step.name,
          });
          createdId = data.fuelyAutomationCreate.id;
          return;
        }
        case "keywords":
          await client.mutate(FuelySettingSetKeywordsDocument, {
            botID,
            automationID: idOf(step.id),
            update: { keywords: step.keywords, reactTo: FuelySettingKeywordsReactTo.CommentThatContains },
          });
          return;
        case "posts":
          await client.mutate(FuelySettingSetListOfPostsDocument, {
            botID,
            automationID: idOf(step.id),
            update: { postIDs: step.postIds },
          });
          return;
        case "publicReply":
          await client.mutate(FuelySettingSetPublicReplyDocument, {
            botID,
            automationID: idOf(step.id),
            update: {
              publicReplyHowToReply: step.on
                ? FuelySettingPublicReplyHowToReply.ExactText
                : FuelySettingPublicReplyHowToReply.DontReply,
              exactTextReply: step.text,
              messagePrompt: step.prompt,
              // Instagram rejects a true here (FuelyLikeContactCommentNotAllowed).
              likeContactComment: false,
            },
          });
          return;
        case "privateReply":
          await client.mutate(FuelySettingSetPrivateReplyDocument, {
            botID,
            automationID: idOf(step.id),
            update: {
              privateReplyHowToReply: FuelySettingPrivateReplyHowToReply.ExactText,
              exactTextReply: step.text,
              messagePrompt: step.prompt,
            },
          });
          return;
        case "enable":
          await client.mutate(FuelyAutomationSetEnabledDocument, { botID, automationID: idOf(step.id), enabled: true });
          return;
      }
    }, wait, retryable);
  }
}

/** Plan, write, re-read. The fresh list is what the screen shows next. */
export async function applyCommentStudio(
  client: ModuleClient,
  botId: string,
  all: readonly FuelyAutomation[],
  activation: Activation,
  options: RunOptions = {},
): Promise<FuelyAutomation[]> {
  await runCommentStudioPlan(client, botId, planCommentStudio(all, activation), options);
  return loadAutomations(client, botId);
}
