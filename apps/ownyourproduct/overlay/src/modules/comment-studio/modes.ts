/**
 * How the bot is wired for Comment Studio, read from the automations alone.
 *
 * Comment Studio is the product's "lite" mode: a comment with buying intent gets
 * one fixed public reply and one fixed Direct, and the AI conversation surfaces
 * (Direct, link in bio, stories) stay off. The read side lives here; the writes
 * are in `apply.ts`.
 */
import type { FuelyAutomation, FuelySettingBookingRulesAutonomyLevel } from "./lib/fuely";
import { baseOf, customsOf, settingOf } from "./data";
import type { AsistenteTexts } from "./prefill";

export type Mode = "full" | "lite";

/** Organic comments owned by Comment Studio. Ad comments belong to Ads. */
export const COMMENT_SCOPES = ["InstagramPostComments"] as const;

type CommentRuleScope = "InstagramPostComments" | "InstagramAdComments";

/**
 * Every surface where a DM conversation starts on its own — not just the inbox.
 * Instagram routes a message to a DIFFERENT scope depending on how the clienta
 * arrived, and Chatfuel ships every base enabled with `howToReply: UsingAI`.
 */
export const DM_SCOPES = ["InstagramDirectMessages", "InstagramIgMeLinks"] as const;

/** Every Instagram scope either mode owns. */
export const ALL_SCOPES = [...COMMENT_SCOPES, ...DM_SCOPES, "InstagramStoryReplies"] as const;

/**
 * The custom automation that carries the keyword filter, found by NAME. Keyed
 * by name and reused, never re-created: a scope holds at most 30 customs and
 * toggling this on and off must not eat that budget.
 */
export const KEYWORD_RULE_NAME = "Comment Studio · preguntas de precio y hora";

function enabledOf(a: FuelyAutomation | null | undefined): boolean {
  return a?.enabled === true;
}

/** The keyword custom on a comment scope, if this app ever created one. */
export function keywordRuleOf(
  all: readonly FuelyAutomation[],
  scope: CommentRuleScope,
): FuelyAutomation | null {
  return keywordRulesOf(all, scope)[0] ?? null;
}

/** Every custom with our exact name, in a deterministic provider-id order. */
export function keywordRulesOf(
  all: readonly FuelyAutomation[],
  scope: CommentRuleScope,
): FuelyAutomation[] {
  return customsOf(all, scope)
    .filter((automation) => automation.name === KEYWORD_RULE_NAME)
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** Which automation answers comments on this scope right now: the filtered
 *  custom when it is running, otherwise the base (= every comment). */
export function commentRunner(
  all: readonly FuelyAutomation[],
  scope: CommentRuleScope,
): FuelyAutomation | null {
  const custom = keywordRuleOf(all, scope);
  if (enabledOf(custom)) return custom;
  return baseOf(all, scope);
}

export interface ModeView {
  /** null = nothing is answering; the assistant is off. */
  mode: Mode | null;
  /** The mode is selected, but the bot is not actually wired that way. */
  drifted: boolean;
  publicOn: boolean;
  storiesOn: boolean;
  keywordsOn: boolean;
  publicReplyMode: "off" | "fixed" | "ai";
  privateReplyMode: "fixed" | "ai";
}

/**
 * What the bot is doing, read from the automations alone. The Direct scope is
 * the discriminator: full mode is "the conversation continues", lite mode is
 * "one message and it stops".
 */
export function readMode(all: readonly FuelyAutomation[]): ModeView {
  const dmOn = enabledOf(baseOf(all, "InstagramDirectMessages"));
  const commentOn = COMMENT_SCOPES.some((s) => enabledOf(commentRunner(all, s)));
  const keywordsOn = COMMENT_SCOPES.some((scope) => {
    const rule = keywordRuleOf(all, scope);
    return (
      enabledOf(rule) &&
      settingOf(rule, "FuelySettingKeywords")?.reactTo === "CommentThatContains"
    );
  });

  const mode: Mode | null = dmOn ? "full" : commentOn ? "lite" : null;

  const runner = commentRunner(all, "InstagramPostComments");
  const priv = settingOf(runner, "FuelySettingPrivateReply")?.privateReplyHowToReply;
  const pub = settingOf(runner, "FuelySettingPublicReply")?.publicReplyHowToReply;
  const level = settingOf(baseOf(all, "All"), "FuelySettingBookingRules")?.autonomyLevel;

  // The other DM surfaces, counted only where the bot actually has them.
  const dmBases = DM_SCOPES.map((s) => baseOf(all, s)).filter(Boolean);

  let drifted = false;
  if (mode === "full") {
    drifted =
      !commentOn ||
      !dmBases.every(enabledOf) ||
      (priv !== "UsingAI" && priv !== "ExactText") ||
      !booksOnItsOwn(level ?? null);
  } else if (mode === "lite") {
    // "Contesta, cierras tú" means no AI conversation on the organic surfaces
    // owned by this module, including a link in bio.
    drifted = (priv !== "ExactText" && priv !== "UsingAI") || dmBases.some(enabledOf);
  }

  return {
    mode,
    drifted,
    publicOn: pub === "UsingAI" || pub === "ExactText",
    storiesOn: enabledOf(baseOf(all, "InstagramStoryReplies")),
    keywordsOn,
    publicReplyMode: pub === "UsingAI" ? "ai" : pub === "ExactText" ? "fixed" : "off",
    privateReplyMode: priv === "UsingAI" ? "ai" : "fixed",
  };
}

/** Does this level put the cita in the calendar without the owner? */
export function booksOnItsOwn(level: FuelySettingBookingRulesAutonomyLevel | null): boolean {
  return level === "BookWithFullAutonomy" || level === "BookWithTeammatesReview";
}

/**
 * The four strings the bot is carrying right now, read off the automation that
 * is actually answering comments (the custom when the filter is on — the
 * dormant base underneath would report a text nobody sends).
 */
export function storedTexts(all: readonly FuelyAutomation[]): Partial<AsistenteTexts> {
  const runner = commentRunner(all, "InstagramPostComments");
  const priv = settingOf(runner, "FuelySettingPrivateReply");
  const pub = settingOf(runner, "FuelySettingPublicReply");
  return {
    dmFixedText: priv?.exactTextReply ?? "",
    dmPrompt: priv?.messagePrompt ?? "",
    publicFixedText: pub?.exactTextReply ?? "",
    publicPrompt: pub?.messagePrompt ?? "",
  };
}

export function textsMatch(stored: Partial<AsistenteTexts>, draft: AsistenteTexts): boolean {
  return (
    stored.dmFixedText === draft.dmFixedText &&
    stored.dmPrompt === draft.dmPrompt &&
    stored.publicPrompt === draft.publicPrompt &&
    stored.publicFixedText === draft.publicFixedText
  );
}

export interface ModeOptions {
  publicOn: boolean;
  /** full mode only */
  storiesOn: boolean;
  /** restrict either mode to commercial-intent comment keywords */
  keywordsOn: boolean;
  /** The commercial-intent words shown and edited in the settings. */
  keywords?: readonly string[];
  /** Empty means every publication. These IDs are applied only to post comments. */
  postIds?: readonly string[];
  /** How the visible reply under the comment is produced. */
  publicReplyMode?: "off" | "fixed" | "ai";
  /** How the first private reply triggered by the comment is produced. */
  privateReplyMode?: "fixed" | "ai";
}
