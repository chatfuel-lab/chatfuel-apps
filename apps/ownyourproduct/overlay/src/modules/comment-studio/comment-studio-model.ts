// Comment Studio — the free Instagram product, as data.
//
// A comment that contains one of her keywords gets a fixed public reply and one
// fixed Direct with her services, prices and hours. No AI at send time, no
// booking, no stories, no follow-up: after the Direct she carries on herself.
//
// ONE MODEL FOR BOTH SURFACES. The first-run screen and Asistente's settings
// edit the same `CommentStudioSettings`, and the only way either of them writes
// the bot is `commentStudioActivation` below, which always produces the lite
// shape. There is no option in this type that could turn AI on.

import type { FuelyAutomation } from "./lib/fuely";
import { FUELY_LIMITS } from "./lib/fuely";
import type { AppLanguage } from "./lib/language";
import { baseOf, settingOf } from "./data";
import { keywordRuleOf, readMode, type ModeOptions } from "./modes";
import type { AsistenteTexts } from "./prefill";

export type CommentStudioSettings = {
  postTarget: "all" | "selected";
  /** Used only when `postTarget` is "selected". */
  postIds: string[];
  keywords: string[];
  publicOn: boolean;
  /** null = the text generated from her catalogue, kept live until she edits it. */
  publicText: string | null;
  directText: string | null;
};

/**
 * The words a comment must contain, per client language.
 *
 * `CommentThatContains` is a case-insensitive SUBSTRING match (see
 * `keywordMatches` in the simulator), so a word that hides inside an everyday
 * word fires on it. Those are written as phrases instead: "hora" alone matches
 * "ahora", "interesa" matches "interesante", PT "quanto" matches "enquanto",
 * "marcar" is how people tag a friend, EN "book" is inside "Facebook", and
 * "quiero"/"quero" are inside "te quiero". Accents are listed both ways because
 * the match is literal.
 *
 * ONE KNOWN TRADE-OFF, kept on purpose: "precio" is inside "precioso/preciosa",
 * the most common compliment under a nail post. Dropping it would miss the most
 * common question of all — a bare "Precio" — and one rule cannot say "contains
 * X but not Y". A compliment that gets a friendly Direct with prices costs her
 * nothing; a lost "precio" costs a clienta. She can remove it in Personalizar.
 */
export const COMMENT_STUDIO_KEYWORDS: Record<AppLanguage, readonly string[]> = {
  es: [
    "precio", "precios", "cuanto", "cuánto", "valor", "hora?", "horas",
    "horario", "horarios", "tienes hora", "tiene hora", "hay hora", "pedir hora",
    "hora para", "cupo", "cupos", "agenda", "agendar", "reserva", "reservar",
    "disponible", "disponibilidad", "info", "me interesa", "💰", "❓",
  ],
  pt: [
    "preço", "preços", "preco", "precos", "quanto custa", "quanto é",
    "quanto fica", "quanto sai", "quanto?", "valor", "horário", "horários",
    "horario", "vaga", "vagas", "agenda", "agendar", "agendamento",
    "marcar horário", "quero marcar", "disponível", "disponivel", "info",
    "interesse", "interessada", "💰", "❓",
  ],
  en: [
    "price", "prices", "how much", "cost", "appointment", "appointments",
    "available", "availability", "booking", "book an", "book me", "schedule",
    "info", "interested", "💰", "❓",
  ],
};

/** Fuely's own limits (FuelyKeywordsTooMany / FuelyKeywordTooLong). */
export const KEYWORD_MAX_COUNT = 50;
export const KEYWORD_MAX_LENGTH = 50;
export const REPLY_TEXT_MAX = FUELY_LIMITS.replyExactTextMax;

export function defaultCommentStudioSettings(language: AppLanguage): CommentStudioSettings {
  return {
    postTarget: "all",
    postIds: [],
    keywords: [...COMMENT_STUDIO_KEYWORDS[language]],
    publicOn: true,
    publicText: null,
    directText: null,
  };
}

export const normalizeKeyword = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export type KeywordRejection = "empty" | "tooLong" | "duplicate" | "tooMany";

export function addKeyword(
  settings: CommentStudioSettings,
  raw: string,
): { settings: CommentStudioSettings } | { rejected: KeywordRejection } {
  const value = normalizeKeyword(raw);
  if (!value) return { rejected: "empty" };
  if (value.length > KEYWORD_MAX_LENGTH) return { rejected: "tooLong" };
  if (settings.keywords.includes(value)) return { rejected: "duplicate" };
  if (settings.keywords.length >= KEYWORD_MAX_COUNT) return { rejected: "tooMany" };
  return { settings: { ...settings, keywords: [...settings.keywords, value] } };
}

/** Edit one keyword in place, with the same rules as adding one. */
export function renameKeyword(
  settings: CommentStudioSettings,
  from: string,
  raw: string,
): { settings: CommentStudioSettings } | { rejected: KeywordRejection } {
  const value = normalizeKeyword(raw);
  if (!value) return { rejected: "empty" };
  if (value.length > KEYWORD_MAX_LENGTH) return { rejected: "tooLong" };
  if (value !== from && settings.keywords.includes(value)) return { rejected: "duplicate" };
  return {
    settings: {
      ...settings,
      keywords: settings.keywords.map((keyword) => (keyword === from ? value : keyword)),
    },
  };
}

export function removeKeyword(
  settings: CommentStudioSettings,
  value: string,
): CommentStudioSettings {
  return { ...settings, keywords: settings.keywords.filter((keyword) => keyword !== value) };
}

/**
 * The four strings the bot will carry. Her edits win; untouched fields follow
 * the draft built from her catalogue. Fuely validates BOTH `exactTextReply` and
 * `messagePrompt` as non-empty on every write whatever the mode, so a public
 * reply she switched off and emptied still ships the generated sentence — it is
 * never sent, it only keeps the write valid.
 */
export function commentStudioTexts(
  settings: CommentStudioSettings,
  generated: AsistenteTexts,
): AsistenteTexts {
  const own = (value: string | null, fallback: string): string => {
    const text = (value ?? "").trim();
    return (text || fallback).slice(0, REPLY_TEXT_MAX);
  };
  return {
    dmFixedText: own(settings.directText, generated.dmFixedText),
    publicFixedText: own(settings.publicText, generated.publicFixedText),
    dmPrompt: generated.dmPrompt,
    publicPrompt: generated.publicPrompt,
  };
}

/**
 * Her Comment Studio as the provider holds it — the keyword rule's own
 * settings, read whether it is running or switched off (turning it off leaves
 * the rule's texts in place). null when the bot never had one.
 *
 * A text equal to what her catalogue would produce today is reported as null,
 * i.e. "follow the catalogue": that is our draft, not her wording, and freezing
 * it would keep quoting yesterday's prices.
 */
export function commentStudioFromAutomations(
  all: readonly FuelyAutomation[],
  generated: AsistenteTexts,
  language: AppLanguage,
): CommentStudioSettings | null {
  // Whatever answers comments NOW comes first: our keyword rule when it runs,
  // or — for an older lite set-up that answers EVERY comment — the comment
  // base. Only then a switched-off rule, which is where a Comment Studio she
  // turned off keeps her words. The base counts only while this app's lite
  // mode runs it: a bot straight out of Chatfuel also has it on, carrying the
  // factory defaults next to an enabled Direct, and those are not her words.
  const base = baseOf(all, "InstagramPostComments");
  const keywordRule = keywordRuleOf(all, "InstagramPostComments");
  const legacyLite = !!base?.enabled && readMode(all).mode === "lite";
  const rule = keywordRule?.enabled ? keywordRule : legacyLite ? base : keywordRule;
  if (!rule) return null;
  const keywordSetting = settingOf(rule, "FuelySettingKeywords");
  const keywords =
    keywordSetting?.reactTo === "CommentThatContains"
      ? [...new Set((keywordSetting.keywords ?? []).map(normalizeKeyword).filter(Boolean))]
      : [];
  const postIds = settingOf(rule, "FuelySettingListOfPosts")?.posts.map((post) => post.postID) ?? [];
  const pub = settingOf(rule, "FuelySettingPublicReply");
  const priv = settingOf(rule, "FuelySettingPrivateReply");
  const own = (stored: string | null | undefined, draft: string): string | null => {
    const text = (stored ?? "").trim();
    return !text || text === draft.trim() ? null : text;
  };
  return {
    postTarget: postIds.length ? "selected" : "all",
    postIds,
    keywords: keywords.length ? keywords : [...COMMENT_STUDIO_KEYWORDS[language]],
    publicOn: (pub?.publicReplyHowToReply ?? "ExactText") !== "DontReply",
    publicText: own(pub?.exactTextReply, generated.publicFixedText),
    directText: own(priv?.exactTextReply, generated.dmFixedText),
  };
}

/**
 * Two settings that would write the same bot. Texts compare after the same
 * trim the write applies, so a trailing space is not "a change".
 */
export function sameCommentStudio(
  a: CommentStudioSettings,
  b: CommentStudioSettings,
  generated: AsistenteTexts,
): boolean {
  // Sets, not lists: ticking a post off and on again, or removing and re-adding
  // a word, is not a change worth a rewrite of the bot.
  const set = (values: readonly string[]) => [...new Set(values)].sort().join("\n");
  const posts = (s: CommentStudioSettings) => (s.postTarget === "selected" ? set(s.postIds) : "");
  const ta = commentStudioTexts(a, generated);
  const tb = commentStudioTexts(b, generated);
  return (
    a.postTarget === b.postTarget &&
    posts(a) === posts(b) &&
    set(a.keywords) === set(b.keywords) &&
    a.publicOn === b.publicOn &&
    (!a.publicOn || ta.publicFixedText === tb.publicFixedText) &&
    ta.dmFixedText === tb.dmFixedText
  );
}

/**
 * What the bot is doing right now, as the settings screen reads it.
 *   running   Comment Studio is on and in shape
 *   off       nothing answers comments
 *   drifted   comments are answered, but not the Comment Studio way: a Direct
 *             conversation switched on, an AI-written reply, every comment
 *             instead of keywords, or stories answered. The lite mode used to
 *             allow the last three, so bots set up before Comment Studio land
 *             here — the screen offers to put them back in shape.
 *   aiBooking the AI assistant is running — a paid add-on
 */
export type CommentStudioStatus = "running" | "off" | "drifted" | "aiBooking";

export function commentStudioStatus(all: readonly FuelyAutomation[]): CommentStudioStatus {
  const view = readMode(all);
  if (view.mode === "full") return "aiBooking";
  if (view.mode === null) return "off";
  const inShape =
    !view.drifted &&
    view.keywordsOn &&
    !view.storiesOn &&
    view.privateReplyMode === "fixed" &&
    view.publicReplyMode !== "ai";
  return inShape ? "running" : "drifted";
}

/**
 * The settings screen's one button. A running Comment Studio with nothing
 * changed has nothing to save — the button is not offered at all, so a tap can
 * never run a disable-and-rewrite cycle for no reason.
 */
export function commentStudioAction(
  status: CommentStudioStatus,
  dirty: boolean,
): "turnOn" | "save" | "repair" | "switch" | null {
  if (status === "off") return "turnOn";
  if (status === "drifted") return "repair";
  // Moving an AI Booking bot to Comment Studio is its own labelled button, not
  // something she has to trigger by making an unrelated edit first.
  if (status === "aiBooking") return "switch";
  return dirty ? "save" : null;
}

export type CommentStudioProblem = "posts" | "keywords" | "public" | "direct";

/** What still blocks turning it on, in the order the cards are shown. */
export function commentStudioProblems(
  settings: CommentStudioSettings,
  generated: AsistenteTexts,
): CommentStudioProblem[] {
  const problems: CommentStudioProblem[] = [];
  if (settings.postTarget === "selected" && settings.postIds.length === 0) problems.push("posts");
  if (settings.keywords.length === 0) problems.push("keywords");
  if (settings.publicOn && !(settings.publicText ?? generated.publicFixedText).trim()) {
    problems.push("public");
  }
  if (!(settings.directText ?? generated.dmFixedText).trim()) problems.push("direct");
  return problems;
}

/**
 * The only write shape Comment Studio has: lite mode, fixed texts, keyword
 * filter always on, stories off. Advertising comments are not in it — the
 * comment scope it writes is `InstagramPostComments` alone (see modes.ts).
 */
export function commentStudioActivation(
  settings: CommentStudioSettings,
  generated: AsistenteTexts,
): { mode: "lite"; options: ModeOptions; texts: AsistenteTexts } {
  return {
    mode: "lite",
    options: {
      publicOn: settings.publicOn,
      storiesOn: false,
      keywordsOn: true,
      keywords: settings.keywords,
      postIds: settings.postTarget === "selected" ? settings.postIds : [],
      publicReplyMode: settings.publicOn ? "fixed" : "off",
      privateReplyMode: "fixed",
    },
    texts: commentStudioTexts(settings, generated),
  };
}

// ---------------------------------------------------------------------------
// the unfinished first-run edits, per bot
// ---------------------------------------------------------------------------
//
// A phone discards a background tab. She picks posts, switches to Instagram to
// check one, comes back to a reload — and must find her choices, not defaults.

const draftKey = (botId: string): string => `agenda.instagram.comment-studio:${botId}`;

const stringList = (value: unknown, max: number, maxLength: number): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...new Set((value as string[]).map((item) => item.trim()).filter((item) => item && item.length <= maxLength))].slice(0, max)
    : null;

const textOrNull = (value: unknown): string | null | undefined =>
  value === null ? null : typeof value === "string" ? value.slice(0, REPLY_TEXT_MAX) : undefined;

export function readCommentStudioDraft(botId: string): CommentStudioSettings | null {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(draftKey(botId)) ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const draft = value as Record<string, unknown>;
    const postIds = stringList(draft.postIds, 50, 60);
    const keywords = stringList(draft.keywords, KEYWORD_MAX_COUNT, KEYWORD_MAX_LENGTH);
    const publicText = textOrNull(draft.publicText);
    const directText = textOrNull(draft.directText);
    if (
      (draft.postTarget !== "all" && draft.postTarget !== "selected") ||
      postIds === null ||
      keywords === null ||
      typeof draft.publicOn !== "boolean" ||
      publicText === undefined ||
      directText === undefined
    ) {
      globalThis.localStorage?.removeItem(draftKey(botId));
      return null;
    }
    return {
      postTarget: draft.postTarget,
      postIds,
      keywords: keywords.map(normalizeKeyword),
      publicOn: draft.publicOn,
      publicText,
      directText,
    };
  } catch {
    return null;
  }
}

export function saveCommentStudioDraft(botId: string, settings: CommentStudioSettings): void {
  try {
    globalThis.localStorage?.setItem(draftKey(botId), JSON.stringify(settings));
  } catch {}
}

export function clearCommentStudioDraft(botId: string): void {
  try {
    globalThis.localStorage?.removeItem(draftKey(botId));
  } catch {}
}
