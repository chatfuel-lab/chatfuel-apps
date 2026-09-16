/**
 * Comment Studio: a salon's Instagram comments answered with a fixed public
 * reply and a fixed Direct with her prices — the product's "lite" mode, on the
 * scaffold's automations, knowledge base and channels.
 *
 * The bot is the source of truth for the switches and for the chosen posts;
 * the generated texts are the source of truth for the words until she edits
 * them (see the model). Writes go through `apply.ts`; the screen never touches
 * a mutation itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  ChipInput,
  ModuleRoot,
  PageBody,
  PageHeader,
  SegmentedControl,
  Spinner,
  Switch,
  Tag,
  Textarea,
  ToastProvider,
  useToast,
} from "~ui";
import { nestedErrorCodes } from "~api";
import { FuelyAutomationUpdatedDocument } from "~api/generated/automations/graphql";
import { BotChannelsDocument } from "~api/generated/core/graphql";
import { GoodsCatalogDocument, KnowledgeBaseDocument } from "~api/generated/knowledge-base/graphql";
import type { ModuleAppProps } from "../types";
import { CommentStudioUnavailable, applyCommentStudio, canPlanCommentStudio, loadAutomations } from "./apply";
import {
  KEYWORD_MAX_COUNT,
  KEYWORD_MAX_LENGTH,
  REPLY_TEXT_MAX,
  clearCommentStudioDraft,
  commentStudioAction,
  commentStudioActivation,
  commentStudioFromAutomations,
  commentStudioProblems,
  commentStudioStatus,
  defaultCommentStudioSettings,
  normalizeKeyword,
  readCommentStudioDraft,
  saveCommentStudioDraft,
  sameCommentStudio,
  COMMENT_STUDIO_KEYWORDS,
  type CommentStudioSettings,
} from "./comment-studio-model";
import type { FuelyAutomation } from "./lib/fuely";
import { APP_LANGUAGES, copy, setAppLanguage, useAppLanguage, type AppLanguage } from "./lib/language";
import { EMPTY_FACTS, generatedTexts, type SalonFacts } from "./prefill";
import { SCREEN, type ScreenCopy } from "./screen-copy";

const LANGUAGE_LABELS: Record<AppLanguage, string> = { es: "ES", pt: "PT", en: "EN" };

interface BotFacts extends SalonFacts {
  /** null = no Instagram account connected; undefined = could not be read. */
  instagram: { username: string } | null | undefined;
}

const UNKNOWN_FACTS: BotFacts = { ...EMPTY_FACTS, instagram: undefined };

/** The draft keeps her words and switches; the posts are always the bot's. */
type DraftPatch = Partial<Omit<CommentStudioSettings, "postTarget" | "postIds">>;

async function loadFacts(client: ModuleAppProps["client"], botId: string): Promise<BotFacts> {
  const [channels, kb, goods] = await Promise.all([
    client.query(BotChannelsDocument, { botID: botId }),
    client.query(KnowledgeBaseDocument, { botID: botId }),
    client.query(GoodsCatalogDocument, { botID: botId }),
  ]);
  let instagram: { username: string } | null = null;
  for (const scope of channels.bot?.contactScopes ?? []) {
    if (scope.__typename === "InstagramAccountContactScope") {
      instagram = { username: scope.instagramAccount.username };
      break;
    }
  }
  const base = kb.bot?.fuelyConfig?.knowledgeBase;
  const days = (base?.businessHoursSchedule.workingHours ?? []).filter((d) => d.enabled && d.start && d.end);
  const hours = days.length
    ? {
        open: days.map((d) => d.start).sort()[0]!,
        close: days.map((d) => d.end).sort().at(-1)!,
      }
    : null;
  const services = (goods.bot?.goodsCatalog ?? []).flatMap((item) =>
    item.__typename === "GoodsService" && item.isAvailable
      ? [{ title: item.title, price: item.price ? { amount: item.price.amount, currency: item.price.currency } : null }]
      : [],
  );
  return {
    handle: instagram?.username ?? "",
    salonName: base?.companyName ?? "",
    services,
    hours,
    instagram,
  };
}

/** Chatfuel nests the real code under a generic outer message; say the code's sentence when we have one. */
function describeError(err: unknown, t: ScreenCopy): string {
  if (err instanceof CommentStudioUnavailable) return t.errors[err.code] ?? t.instagram.missingHint;
  const codes = nestedErrorCodes(err);
  const known = codes.find((code) => code in t.errors);
  if (known) return t.errors[known]!;
  const message = err instanceof Error ? err.message : String(err);
  return codes.length ? `${message} (${codes.join(", ")})` : message;
}

function CommentStudioBody({ botId, client, navigate }: ModuleAppProps) {
  const language = useAppLanguage();
  const t = copy(SCREEN, language);
  const toast = useToast();

  const [all, setAll] = useState<FuelyAutomation[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [facts, setFacts] = useState<BotFacts | null>(null);
  const [factsFailed, setFactsFailed] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [draft, setDraft] = useState<CommentStudioSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [keywordNote, setKeywordNote] = useState<string | null>(null);
  // Which read of the bot is current: a list that lands after a newer one, or
  // after the plan's own re-read, is dropped instead of showing a stale bot.
  const generation = useRef(0);
  const busyRef = useRef(false);

  const refetch = useCallback(() => setEpoch((n) => n + 1), []);

  // The bot: the one read the screen cannot do without.
  useEffect(() => {
    const gen = ++generation.current;
    setLoadError(null);
    loadAutomations(client, botId)
      .then((automations) => {
        if (gen === generation.current) setAll(automations);
      })
      .catch((err: unknown) => {
        if (gen === generation.current) setLoadError(err);
      });
  }, [client, botId, epoch]);

  // The salon's facts: best effort; without them the texts are the generic ones.
  useEffect(() => {
    let cancelled = false;
    loadFacts(client, botId)
      .then((loaded) => {
        if (cancelled) return;
        setFacts(loaded);
        setFactsFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFacts(UNKNOWN_FACTS);
        setFactsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client, botId, epoch]);

  // Someone edits the rule in Automations, or another tab: re-read, do not
  // guess. Our own writes fire the same events; while a plan runs, its final
  // re-read is the one that counts.
  useEffect(() => {
    const quietRefetch = () => {
      if (!busyRef.current) refetch();
    };
    const off = client.subscribe(
      FuelyAutomationUpdatedDocument,
      { botID: botId },
      { next: quietRefetch, error: () => undefined },
    );
    const offReconnect = client.onReconnect(quietRefetch);
    return () => {
      off();
      offReconnect();
    };
  }, [client, botId, refetch]);

  const generated = useMemo(() => generatedTexts(language, facts ?? EMPTY_FACTS), [language, facts]);
  const stored = useMemo(
    () => (all ? commentStudioFromAutomations(all, generated, language) : null),
    [all, generated, language],
  );

  // The unfinished edits of this browser first, then the bot, then the defaults.
  useEffect(() => {
    if (!all || draft) return;
    setDraft(readCommentStudioDraft(botId) ?? stored ?? defaultCommentStudioSettings(language));
  }, [all, stored, draft, botId, language]);

  // Posts are the bot's: the only picker is the rule in Automations, so a
  // browser draft must never shadow what she chose there.
  const settings = useMemo<CommentStudioSettings | null>(
    () =>
      draft
        ? { ...draft, postTarget: stored?.postTarget ?? "all", postIds: stored?.postIds ?? [] }
        : null,
    [draft, stored],
  );

  const status = all ? commentStudioStatus(all) : null;
  const dirty = !settings || !stored ? true : !sameCommentStudio(stored, settings, generated);
  const action = status ? commentStudioAction(status, dirty) : null;
  const problems = settings ? commentStudioProblems(settings, generated) : [];
  const instagramMissing = facts?.instagram === null;
  const canPlan = !!all && canPlanCommentStudio(all);
  const blocked = !all || !settings || busy || instagramMissing || !canPlan || problems.length > 0;

  const update = (patch: DraftPatch) => {
    setDraft((prev) => {
      const next = { ...(prev ?? defaultCommentStudioSettings(language)), ...patch };
      saveCommentStudioDraft(botId, next);
      return next;
    });
  };

  const apply = async () => {
    if (!all || !settings || busy) return;
    setBusy(true);
    busyRef.current = true;
    try {
      const fresh = await applyCommentStudio(client, botId, all, commentStudioActivation(settings, generated));
      generation.current += 1; // any list read still in flight is stale now
      clearCommentStudioDraft(botId);
      setAll(fresh);
      setDraft(null); // re-seeded from the bot on the next render
      const ok = commentStudioStatus(fresh) === "running";
      toast.show({
        title: ok ? t.toast.saved : t.toast.readback,
        tone: ok ? "success" : "warning",
      });
    } catch (err: unknown) {
      toast.show({ title: t.toast.failed, description: describeError(err, t), tone: "danger" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const validateKeyword = (raw: string): string | null => {
    const value = normalizeKeyword(raw);
    if (!value) return t.keywords.rejected.empty;
    if (value.length > KEYWORD_MAX_LENGTH) return t.keywords.rejected.tooLong;
    if (settings?.keywords.includes(value)) return t.keywords.rejected.duplicate;
    if ((settings?.keywords.length ?? 0) >= KEYWORD_MAX_COUNT) return t.keywords.rejected.tooMany;
    return null;
  };

  const languagePicker = (
    <SegmentedControl<AppLanguage>
      size="sm"
      aria-label={t.language}
      value={language}
      onChange={(next) => setAppLanguage(next)}
      options={APP_LANGUAGES.map((value) => ({ value, label: LANGUAGE_LABELS[value] }))}
    />
  );

  const statusTone =
    status === "running" ? "success" : status === "off" || status === null ? "neutral" : "warning";

  const actionLabel =
    action === "turnOn"
      ? t.action.turnOn
      : action === "save"
        ? t.action.save
        : action === "repair"
          ? t.action.repair
          : action === "switch"
            ? t.action.switch
            : null;

  return (
    <>
      <PageHeader
        title={t.title}
        meta={<Tag tone={statusTone}>{status ? t.status[status] : t.status.loading}</Tag>}
        actions={
          <div className="flex items-center gap-3">
            {languagePicker}
            {actionLabel ? (
              <Button variant="primary" loading={busy} disabled={blocked} onClick={() => void apply()}>
                {busy ? t.action.working : actionLabel}
              </Button>
            ) : null}
          </div>
        }
      />
      <PageBody>
        <div className="flex flex-col gap-4" style={{ maxWidth: "48rem" }}>
          <p className="text-text-muted">{t.subtitle}</p>

          {loadError ? (
            <Alert
              tone="danger"
              title={t.loadFailed}
              action={
                <Button size="sm" variant="secondary" onClick={refetch}>
                  {t.retry}
                </Button>
              }
            >
              {describeError(loadError, t)}
            </Alert>
          ) : null}

          {!all && !loadError ? (
            <div className="flex items-center gap-2 text-text-muted">
              <Spinner /> {t.loading}
            </div>
          ) : null}

          {status ? (
            <Alert tone={status === "running" ? "success" : status === "off" ? "info" : "warning"}>
              {t.statusHint[status]}
            </Alert>
          ) : null}

          {instagramMissing || (all && !canPlan) ? (
            <Alert
              tone="warning"
              title={t.instagram.missing}
              action={
                <Button size="sm" variant="secondary" onClick={() => navigate("/channels")}>
                  {t.instagram.connect}
                </Button>
              }
            >
              {t.instagram.missingHint}
            </Alert>
          ) : null}
          {facts?.instagram ? (
            <p className="text-text-muted text-sm">{t.instagram.connected(facts.instagram.username)}</p>
          ) : null}
          {factsFailed ? <p className="text-text-muted text-sm">{t.facts.unavailable}</p> : null}

          {settings ? (
            <>
              <Card
                title={t.posts.title}
                description={t.posts.description}
                actions={
                  <Button size="sm" variant="outline" onClick={() => navigate("/automations")}>
                    {t.posts.open}
                  </Button>
                }
              >
                <div className="flex flex-col gap-1 text-sm text-text-muted">
                  <span>
                    {settings.postTarget === "selected" ? t.posts.selectedHint(settings.postIds.length) : t.posts.all}
                  </span>
                  <span>{t.posts.pick}</span>
                  {problems.includes("posts") ? <span className="text-danger">{t.problems.posts}</span> : null}
                </div>
              </Card>

              <Card
                title={t.keywords.title}
                description={t.keywords.description}
                actions={
                  <span className="text-sm text-text-muted">
                    {t.keywords.count(settings.keywords.length, KEYWORD_MAX_COUNT)}
                  </span>
                }
              >
                <div className="flex flex-col gap-2">
                  <ChipInput
                    value={settings.keywords}
                    placeholder={t.keywords.placeholder}
                    maxItems={KEYWORD_MAX_COUNT}
                    maxLength={KEYWORD_MAX_LENGTH}
                    normalize={normalizeKeyword}
                    dedupe
                    validate={(item) => {
                      const note = validateKeyword(item);
                      setKeywordNote(note);
                      return note;
                    }}
                    onChange={(keywords) => {
                      setKeywordNote(null);
                      update({ keywords: [...new Set(keywords.map(normalizeKeyword).filter(Boolean))] });
                    }}
                  />
                  {keywordNote ? <span className="text-sm text-danger">{keywordNote}</span> : null}
                  {problems.includes("keywords") ? (
                    <span className="text-sm text-danger">{t.problems.keywords}</span>
                  ) : null}
                  <div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => update({ keywords: [...COMMENT_STUDIO_KEYWORDS[language]] })}
                    >
                      {t.keywords.reset}
                    </Button>
                  </div>
                </div>
              </Card>

              <Card title={t.publicReply.title} description={t.publicReply.description}>
                <div className="flex flex-col gap-3">
                  <Switch
                    checked={settings.publicOn}
                    onChange={(publicOn) => update({ publicOn })}
                    label={t.publicReply.switch}
                  />
                  {settings.publicOn ? (
                    <Textarea
                      value={settings.publicText ?? generated.publicFixedText}
                      onChange={(event) => {
                        const text = event.currentTarget.value;
                        update({ publicText: text.trim() === generated.publicFixedText.trim() ? null : text });
                      }}
                      maxLength={REPLY_TEXT_MAX}
                      showCount
                      autoGrow
                      rows={2}
                      invalid={problems.includes("public")}
                    />
                  ) : null}
                  {problems.includes("public") ? (
                    <span className="text-sm text-danger">{t.problems.public}</span>
                  ) : null}
                </div>
              </Card>

              <Card
                title={t.direct.title}
                description={t.direct.description}
                actions={
                  settings.directText !== null ? (
                    <Button size="sm" variant="ghost" onClick={() => update({ directText: null })}>
                      {t.direct.useGenerated}
                    </Button>
                  ) : null
                }
              >
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={settings.directText ?? generated.dmFixedText}
                    onChange={(event) => {
                      const text = event.currentTarget.value;
                      update({ directText: text.trim() === generated.dmFixedText.trim() ? null : text });
                    }}
                    maxLength={REPLY_TEXT_MAX}
                    showCount
                    autoGrow
                    rows={4}
                    invalid={problems.includes("direct")}
                  />
                  {problems.includes("direct") ? (
                    <span className="text-sm text-danger">{t.problems.direct}</span>
                  ) : null}
                </div>
              </Card>
            </>
          ) : null}
        </div>
      </PageBody>
    </>
  );
}


/**
 * The module's root: the frame and the providers, and nothing else. `useToast`
 * is called in the body, which is a CHILD of the provider — a hook of its own
 * that consumed it here would run while the provider is still just a return
 * value, and the module would white-screen on its first render.
 */
export function CommentStudioApp(props: ModuleAppProps) {
  return (
    <ModuleRoot>
      <ToastProvider>
        <CommentStudioBody {...props} />
      </ToastProvider>
    </ModuleRoot>
  );
}
