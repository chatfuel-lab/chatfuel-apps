/**
* Set-up: a salon set up in one sitting. Business, specialities, services
 * with anchored prices, hours, review — then one save that writes the
 * Knowledge Base and Bookings through ~api. The logic, the presets and the
 * copy are the product's own files; only the screen and the writes are new.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  ModuleRoot,
  PageBody,
  PageHeader,
  SegmentedControl,
  Select,
  Spinner,
  Switch,
  Tag,
  ToastProvider,
  useToast,
} from "~ui";
import type { ModuleAppProps } from "../types";
import { WRITE_ORDER, type WriteStep } from "./confirmation";
import { buildSalonDraft, type DraftService, type DraftSpecialist, type SalonDraft } from "./draft-build";
import { APP_LANGUAGES, copy, countryLanguage, useAppLanguage, type AppLanguage } from "./language";
import { setupFormState } from "./login-setup";
import type { PriceTier } from "./price-anchors";
import { PREPARE_COPY } from "./prepare-copy";
import {
  SETUP_STEPS,
  SETUP_TIME_OPTIONS,
  forceSolo,
  normalizedSetupPhone,
  repairSetupSchedule,
  retierServices,
  selectSetupCategories,
  setupIssues,
  updateSetupDayTime,
  type SetupIssue,
  type SetupStep,
} from "./prepare-logic";
import { readPrepareState, savePrepareProgress, savePrepareState, type PrepareState } from "./prepare-store";
import { runPublish, type PublishReport } from "./publish";
import { COUNTRY_LOCALES, formatMoney, parseMoneyInput, supportedCountries } from "./salon-locale";
import { PRESET_RUBROS, type PresetRubro } from "./service-presets";
import { deviceZone } from "./timezone";
import { WEEKDAY_KEYS, type WeekdayKey } from "./schema";

const DISPLAY_DAYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const LANGUAGE_LABELS: Record<AppLanguage, string> = { es: "Español", pt: "Português", en: "English" };
const CANCELLATION_OPTIONS = [6, 12, 24, 48];

type Copy = ReturnType<typeof copy<typeof PREPARE_COPY.es>>;

function stepOfIssue(issues: SetupIssue[], step: SetupStep): SetupIssue[] {
  return issues.filter((issue) => issue.step === step);
}

function SalonOnboardingBody({ botId, client, navigate }: ModuleAppProps) {
  const language = useAppLanguage();
  const t = copy(PREPARE_COPY, language) as Copy;
  const toast = useToast();

  const [state, setState] = useState<PrepareState>(() => readPrepareState(botId));
  const [step, setStep] = useState<SetupStep>(() => readPrepareState(botId).step ?? "business");
  const [country, setCountry] = useState(() => readPrepareState(botId).draft?.country ?? "cl");
  const [businessName, setBusinessName] = useState(() => readPrepareState(botId).draft?.businessName ?? "");
  const [zoneChoice, setZoneChoice] = useState(() => readPrepareState(botId).draft?.timezone ?? "");
  const [categories, setCategories] = useState<PresetRubro[]>(() => readPrepareState(botId).draft?.categories ?? []);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [saving, setSaving] = useState<WriteStep | null>(null);
  const [report, setReport] = useState<PublishReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const draft = state.draft;
  const locale = COUNTRY_LOCALES[country] ?? COUNTRY_LOCALES.cl!;
  const form = useMemo(
    () => setupFormState({ businessName, country, zoneChoice, device: deviceZone() }),
    [businessName, country, zoneChoice],
  );
  const timezone = form.zone ?? draft?.timezone ?? "";
  const issues = useMemo(() => (draft ? setupIssues(draft, state.phone, state.address) : []), [draft, state.phone, state.address]);

  const persist = useCallback(
    (next: PrepareState) => {
      setState(next);
      savePrepareProgress(botId, next);
    },
    [botId],
  );
  const patchDraft = (fn: (d: SalonDraft) => SalonDraft) => {
    if (!draft) return;
    persist({ ...state, draft: fn(draft) });
  };

  useEffect(() => {
    savePrepareProgress(botId, { ...state, step });
  }, [botId, state, step]);

  // ---- step transitions ---------------------------------------------------
  const goNext = () => {
    if (step === "business") {
      if (!form.ready) return;
      const identity = form.identity!;
      if (draft) {
        patchDraft((d) => ({ ...d, businessName: identity.businessName, country: identity.country, timezone: identity.timezone }));
      }
      setStep("categories");
      return;
    }
    if (step === "categories") {
      if (!categories.length) return;
      const identity = form.identity ?? { businessName, country, timezone };
      const next = draft
        ? selectSetupCategories({ ...draft, businessName: identity.businessName, country: identity.country, timezone: identity.timezone }, categories)
        : buildSalonDraft({ businessName: identity.businessName, country: identity.country, timezone: identity.timezone, rubros: categories, tier: "standard", solo: true, ownerName: identity.businessName });
      persist({ ...state, draft: next });
      setStep("services");
      return;
    }
    const index = SETUP_STEPS.indexOf(step);
    setStep(SETUP_STEPS[Math.min(index + 1, SETUP_STEPS.length - 1)]);
  };
  const goBack = () => {
    const index = SETUP_STEPS.indexOf(step);
    setStep(SETUP_STEPS[Math.max(index - 1, 0)]);
  };

  // ---- services ------------------------------------------------------------
  const updateService = (key: string, patch: Partial<DraftService>) =>
    patchDraft((d) => ({ ...d, services: d.services.map((s) => (s.key === key ? { ...s, ...patch, priceEdited: patch.price !== undefined ? true : s.priceEdited } : s)) }));
  const removeService = (key: string) =>
    patchDraft((d) => ({
      ...d,
      services: d.services.filter((s) => s.key !== key),
      specialists: d.specialists.map((p) => ({ ...p, serviceKeys: p.serviceKeys.filter((k) => k !== key) })),
    }));
  const addService = () =>
    patchDraft((d) => {
      const key = `custom-${Date.now().toString(36)}`;
      const service: DraftService = { key, name: "", price: 0, durationMinutes: 45, rubro: d.categories?.[0] ?? "uñas", approximate: false, priceSource: "none", priceEdited: true, currency: locale.currency };
      return { ...d, services: [...d.services, service], specialists: d.specialists.map((p) => ({ ...p, serviceKeys: [...p.serviceKeys, key] })) };
    });

  // ---- team ----------------------------------------------------------------
  const setSolo = (solo: boolean) =>
    patchDraft((d) => {
      if (solo) return forceSolo(d, d.businessName);
      const owner: DraftSpecialist = d.specialists.find((p) => p.role === "owner") ?? { draftId: "owner", role: "owner", name: d.businessName, schedule: d.schedule, serviceKeys: d.services.map((s) => s.key) };
      const team = teamNames.filter(Boolean).map((name, i): DraftSpecialist => ({ draftId: `team-${i + 1}`, role: "team", name, schedule: d.schedule, serviceKeys: d.services.map((s) => s.key) }));
      return { ...d, teamMode: "team", ownerServes: true, specialists: [owner, ...team] };
    });
  const setTeam = (names: string[]) => {
    setTeamNames(names);
    patchDraft((d) => {
      const owner = d.specialists.find((p) => p.role === "owner") ?? { draftId: "owner", role: "owner" as const, name: d.businessName, schedule: d.schedule, serviceKeys: d.services.map((s) => s.key) };
      const team = names.map((name, i): DraftSpecialist => ({ draftId: `team-${i + 1}`, role: "team", name, schedule: d.schedule, serviceKeys: d.services.map((s) => s.key) }));
      return { ...d, teamMode: "team", specialists: [owner, ...team] };
    });
  };

  // ---- schedule ------------------------------------------------------------
  const setDay = (key: WeekdayKey, patch: { enabled?: boolean; start?: string; end?: string }) =>
    patchDraft((d) => {
      const current = d.schedule[key] ?? { enabled: false, start: "10:00", end: "19:00", break: null };
      const day = patch.enabled === undefined ? updateSetupDayTime(current, patch) : { ...current, enabled: patch.enabled };
      const schedule = repairSetupSchedule({ ...d.schedule, [key]: day, enabled: true });
      return { ...d, schedule, specialists: d.specialists.map((p) => ({ ...p, schedule })) };
    });
  const copyMonday = () =>
    patchDraft((d) => {
      const monday = d.schedule.mon;
      if (!monday) return d;
      const schedule = { ...d.schedule };
      for (const key of WEEKDAY_KEYS) if (schedule[key]?.enabled) schedule[key] = { ...schedule[key]!, start: monday.start, end: monday.end };
      return { ...d, schedule, specialists: d.specialists.map((p) => ({ ...p, schedule })) };
    });

  // ---- save ----------------------------------------------------------------
  const save = async () => {
    if (!draft || issues.length || saving) return;
    setFailure(null);
    setSaving(WRITE_ORDER[0]);
    try {
      const result = await runPublish(client, { botId, draft, phone: normalizedSetupPhone(state.phone, draft.country) ?? state.phone, address: state.address, language: draft.language ?? countryLanguage(draft.country) }, setSaving);
      setReport(result);
      const done = { ...state, published: true, savedToProvider: true };
      setState(done);
      savePrepareState(botId, done);
      toast.show({ title: t.ready, tone: "success" });
    } catch (err: unknown) {
      setFailure(err instanceof Error ? err.message : String(err));
      toast.show({ title: t.failed, tone: "danger" });
    } finally {
      setSaving(null);
    }
  };

  const stepIndex = SETUP_STEPS.indexOf(step);
  const stepIssues = stepOfIssue(issues, step);

  // ---- render --------------------------------------------------------------
  const header = (
    <PageHeader
      title={t.titles[stepIndex]}
      meta={<Tag tone="neutral">{`${stepIndex + 1}/${SETUP_STEPS.length} · ${t.steps[stepIndex]}`}</Tag>}
      actions={
        <SegmentedControl<AppLanguage>
          size="sm"
          aria-label={t.assistantLanguage}
          value={language}
          onChange={(next) => import("./language").then((m) => m.setAppLanguage(next))}
          options={APP_LANGUAGES.map((value) => ({ value, label: value.toUpperCase() }))}
        />
      }
    />
  );

  if (state.published && report) {
    return (
      <>
        {header}
        <PageBody>
          <div className="flex flex-col gap-4" style={{ maxWidth: "44rem" }}>
            <Alert tone="success" title={t.ready}>
              {`${report.created.services + report.reused.services} ${t.reviewServices.toLowerCase()} · ${report.created.specialists + report.reused.specialists} ${t.people.toLowerCase()}`}
            </Alert>
            <div className="flex gap-3 flex-wrap">
              <Button variant="primary" onClick={() => navigate("/bookings")}>{t.reviewSchedule}</Button>
              <Button variant="secondary" onClick={() => navigate("/knowledge-base")}>{t.reviewBusiness}</Button>
              <Button variant="ghost" onClick={() => { const fresh = { ...state, published: false, savedToProvider: false }; setReport(null); setState(fresh); savePrepareState(botId, fresh); setStep("review"); }}>{t.back}</Button>
            </div>
          </div>
        </PageBody>
      </>
    );
  }

  return (
    <>
      {header}
      <PageBody>
        <div className="flex flex-col gap-4" style={{ maxWidth: "44rem" }}>
          {t.subtitles[stepIndex] ? <p className="text-text-muted">{t.subtitles[stepIndex]}</p> : null}

          {step === "business" ? (
            <Card title={t.reviewBusiness}>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm"><span>{t.name}</span><Input value={businessName} onChange={(e) => setBusinessName(e.currentTarget.value)} maxLength={80} /></label>
                <label className="flex flex-col gap-1 text-sm"><span>{t.country}</span>
                  <Select value={country} onChange={(value) => { setCountry(value); setZoneChoice(""); }} options={supportedCountries().map((c) => ({ value: c.code, label: c.locale.name }))} />
                </label>
                {form.zoneOptions.length > 1 ? (
                  <label className="flex flex-col gap-1 text-sm"><span>{t.zone}</span>
                    <Select value={zoneChoice} onChange={setZoneChoice} options={form.zoneOptions.map((z) => ({ value: z, label: z }))} placeholder={t.zone} />
                  </label>
                ) : timezone ? <p className="text-sm text-text-muted">{t.zone}: {timezone}</p> : null}
                <label className="flex flex-col gap-1 text-sm"><span>{t.phone}</span>
                  <Input value={state.phone} placeholder={locale.dialCode} onChange={(e) => persist({ ...state, phone: e.currentTarget.value })} invalid={!!state.phone && !normalizedSetupPhone(state.phone, country)} />
                </label>
                <label className="flex flex-col gap-1 text-sm"><span>{t.address}</span>
                  <Input value={state.address} placeholder={t.addressPlaceholder} onChange={(e) => persist({ ...state, address: e.currentTarget.value })} />
                </label>
                <label className="flex flex-col gap-1 text-sm"><span>{t.city} <span className="text-text-muted">({t.optional})</span></span>
                  <Input value={state.city ?? ""} onChange={(e) => persist({ ...state, city: e.currentTarget.value })} />
                </label>
              </div>
            </Card>
          ) : null}

          {step === "categories" ? (
            <Card title={t.category}>
              <div className="flex flex-wrap gap-2">
                {PRESET_RUBROS.map((rubro, i) => {
                  const on = categories.includes(rubro);
                  return (
                    <Button key={rubro} size="sm" variant={on ? "primary" : "outline"} aria-pressed={on} onClick={() => setCategories(on ? categories.filter((c) => c !== rubro) : [...categories, rubro])}>
                      {t.categoryLabels[i] ?? rubro}
                    </Button>
                  );
                })}
              </div>
              {!categories.length ? <p className="text-sm text-danger mt-3">{t.categoryError}</p> : null}
            </Card>
          ) : null}

          {step === "services" && draft ? (
            <>
              <Card title={t.tier} description={t.suggestion}>
                <SegmentedControl<PriceTier>
                  aria-label={t.tier}
                  value={draft.tier}
                  onChange={(tier) => patchDraft((d) => retierServices(d, tier))}
                  options={[{ value: "budget", label: t.budget }, { value: "standard", label: t.standard }, { value: "premium", label: t.premium }]}
                />
              </Card>
              <Card title={t.reviewServices} actions={<Button size="sm" variant="outline" onClick={addService}>{t.add}</Button>}>
                <div className="flex flex-col gap-2">
                  {draft.services.map((s) => (
                    <div key={s.key} className="grid gap-2 items-center" style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr) minmax(0,.8fr) auto" }}>
                      <Input aria-label={t.service} value={s.name} onChange={(e) => updateService(s.key, { name: e.currentTarget.value })} invalid={!s.name.trim()} />
                      <Input aria-label={t.price} inputMode="decimal" value={s.price ? formatMoney(s.price, locale) : ""} placeholder={locale.symbol} onChange={(e) => { const v = parseMoneyInput(e.currentTarget.value, locale); if (v !== null) updateService(s.key, { price: v, priceSource: "none", approximate: false }); else if (!e.currentTarget.value.trim()) updateService(s.key, { price: 0 }); }} />
                      <Input aria-label={t.duration} inputMode="numeric" value={String(s.durationMinutes)} onChange={(e) => updateService(s.key, { durationMinutes: Math.max(5, Number(e.currentTarget.value) || 0), detailsEdited: true })} />
                      <Button size="sm" variant="ghost" aria-label={t.remove} onClick={() => removeService(s.key)}>×</Button>
                    </div>
                  ))}
                  {!draft.services.length ? <p className="text-sm text-danger">{t.categoryError}</p> : null}
                  {draft.hasFallbackPrices ? <p className="text-sm text-text-muted">{t.suggestion}</p> : null}
                </div>
              </Card>
            </>
          ) : null}

          {step === "schedule" && draft ? (
            <>
              <Card title={t.hours} actions={<Button size="sm" variant="ghost" onClick={copyMonday}>{t.copyHours}</Button>}>
                <div className="flex flex-col gap-2">
                  {DISPLAY_DAYS.map((key, i) => {
                    const d = draft.schedule[key] ?? { enabled: false, start: "10:00", end: "19:00", break: null };
                    return (
                      <div key={key} className="grid gap-2 items-center" style={{ gridTemplateColumns: "minmax(0,.7fr) auto minmax(0,1fr) minmax(0,1fr)" }}>
                        <span className="text-sm">{t.days[i]}</span>
                        <Switch checked={d.enabled} onChange={(enabled) => setDay(key, { enabled })} label={d.enabled ? "" : t.closed} />
                        <Select value={d.start} onChange={(start) => setDay(key, { start })} options={SETUP_TIME_OPTIONS.map((v) => ({ value: v, label: v }))} disabled={!d.enabled} />
                        <Select value={d.end} onChange={(end) => setDay(key, { end })} options={SETUP_TIME_OPTIONS.map((v) => ({ value: v, label: v }))} disabled={!d.enabled} />
                      </div>
                    );
                  })}
                  {stepIssues.some((i) => i.reason === "hours") ? <p className="text-sm text-danger">{t.hoursError}</p> : null}
                </div>
              </Card>
              <Card title={t.people}>
                <div className="flex flex-col gap-3">
                  <SegmentedControl<"solo" | "team">
                    aria-label={t.people}
                    value={draft.teamMode}
                    onChange={(mode) => setSolo(mode === "solo")}
                    options={[{ value: "solo", label: t.solo }, { value: "team", label: t.team }]}
                  />
                  {draft.teamMode === "team" ? (
                    <div className="flex flex-col gap-2">
                      {draft.specialists.filter((p) => p.role === "team").map((p, i) => (
                        <div key={p.draftId} className="flex gap-2 items-center">
                          <Input aria-label={t.member} value={p.name} onChange={(e) => { const names = draft.specialists.filter((x) => x.role === "team").map((x) => x.name); names[i] = e.currentTarget.value; setTeam(names); }} />
                          <Button size="sm" variant="ghost" aria-label={t.remove} onClick={() => setTeam(draft.specialists.filter((x) => x.role === "team").map((x) => x.name).filter((_, j) => j !== i))}>×</Button>
                        </div>
                      ))}
                      <div><Button size="sm" variant="outline" onClick={() => setTeam([...draft.specialists.filter((x) => x.role === "team").map((x) => x.name), ""])}>{t.addMember}</Button></div>
                    </div>
                  ) : null}
                </div>
              </Card>
            </>
          ) : null}

          {step === "review" && draft ? (
            <>
              <Card title={t.reviewBusiness}>
                <p className="text-sm">{draft.businessName} · {locale.name} · {draft.timezone}</p>
                <p className="text-sm text-text-muted">{state.phone} · {state.address}</p>
              </Card>
              <Card title={t.reviewServices}>
                <ul className="text-sm flex flex-col gap-1">
                  {draft.services.map((s) => <li key={s.key} className="flex justify-between gap-3"><span>{s.name}</span><span className="text-text-muted">{formatMoney(s.price, locale)} · {s.durationMinutes} min</span></li>)}
                </ul>
              </Card>
              <Card title={t.reviewSchedule}>
                <p className="text-sm">{DISPLAY_DAYS.map((key, i) => { const d = draft.schedule[key]; return d?.enabled ? `${t.days[i]} ${d.start}–${d.end}` : null; }).filter(Boolean).join(" · ")}</p>
                <p className="text-sm text-text-muted">{t.people}: {draft.specialists.map((p) => p.name).join(", ")}</p>
              </Card>
              <Card title={t.rules}>
                <div className="flex flex-col gap-3">
                  <Switch checked={draft.policies.depositEnabled} onChange={(depositEnabled) => patchDraft((d) => ({ ...d, policies: { ...d.policies, depositEnabled } }))} label={t.deposit} />
                  {draft.policies.depositEnabled ? (
                    <label className="flex flex-col gap-1 text-sm"><span>{t.depositAmount}</span>
                      <Input inputMode="decimal" value={draft.policies.depositAmount ? formatMoney(draft.policies.depositAmount, locale) : ""} onChange={(e) => { const v = parseMoneyInput(e.currentTarget.value, locale); if (v !== null) patchDraft((d) => ({ ...d, policies: { ...d.policies, depositAmount: v } })); }} />
                      <span className="text-text-muted">{t.depositHint}</span>
                    </label>
                  ) : null}
                  <label className="flex flex-col gap-1 text-sm"><span>{t.notice}</span>
                    <Select value={String(draft.policies.cancellationHours)} onChange={(v) => patchDraft((d) => ({ ...d, policies: { ...d.policies, cancellationHours: Number(v) } }))} options={CANCELLATION_OPTIONS.map((h) => ({ value: String(h), label: `${h} ${t.hourUnit}` }))} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm"><span>{t.assistantLanguage}</span>
                    <Select value={draft.language ?? countryLanguage(draft.country)} onChange={(v) => patchDraft((d) => ({ ...d, language: v as AppLanguage }))} options={APP_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))} />
                  </label>
                </div>
              </Card>
              {issues.length ? (
                <Alert tone="warning">{issues.map((i) => `${t.steps[SETUP_STEPS.indexOf(i.step)]}: ${i.field}`).join(" · ")}</Alert>
              ) : null}
              {failure ? <Alert tone="danger" title={t.failed}>{failure}</Alert> : null}
              {saving ? (
                <Alert tone="info" title={t.saving}>
                  <div className="flex items-center gap-2"><Spinner /> {t.savingSteps[WRITE_ORDER.indexOf(saving)] ?? t.savingHint}</div>
                </Alert>
              ) : null}
            </>
          ) : null}

          <div className="flex gap-3 items-center pt-2">
            {stepIndex > 0 ? <Button variant="secondary" onClick={goBack} disabled={!!saving}>{t.back}</Button> : null}
            {step !== "review" ? (
              <Button variant="primary" onClick={goNext} disabled={(step === "business" && !form.ready) || (step === "categories" && !categories.length) || (step === "services" && !!draft && (!draft.services.length || draft.services.some((s) => !s.name.trim()))) || (step === "schedule" && stepIssues.length > 0)}>
                {t.next}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => void save()} loading={!!saving} disabled={!!saving || issues.length > 0}>{t.save}</Button>
            )}
          </div>
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
export function SalonOnboardingApp(props: ModuleAppProps) {
  return (
    <ModuleRoot>
      <ToastProvider>
        <SalonOnboardingBody {...props} />
      </ToastProvider>
    </ModuleRoot>
  );
}
