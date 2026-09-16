/**
* Money: what the salon earned, spent and bought, by period. Earnings come
 * from Bookings in Chatfuel (service prices of bookings that were not
 * cancelled); expenses and supply purchases are the app's own two tables
 * (0030_money.sql), managers only. Nothing here changes a booking.
 */
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Input, ModuleRoot, PageBody, PageHeader, SegmentedControl, Select, Spinner, ToastProvider, useToast } from "~ui";
import { BookingConfigDocument, BookingsRangeDocument } from "~api/generated/bookings/graphql";
import { AuthContext } from "../auth/AuthContext";
import type { ModuleAppProps } from "../types";
import { MONEY_COPY } from "./copy";
import { copy, useAppLanguage } from "./language";
import { PERIODS, apiTimes, money, periodRange, summarize, toCsv, todayKey, type BookingLike, type PeriodPreset, type Ranked } from "./model";
import { addExpense, addSupply, listExpenses, listSupplies, removeExpense, removeSupply, type ExpenseRow, type SupplyRow } from "./rest";

type Tab = "report" | "expenses" | "supplies";

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

const describe = (err: unknown): string => {
  const e = err as { hint?: string | null };
  const msg = err instanceof Error ? err.message : String(err);
  return e?.hint ? `${msg} (${e.hint})` : msg;
};

function MoneyBody({ botId, client, view, setView }: ModuleAppProps) {
  const language = useAppLanguage();
  const t = copy(MONEY_COPY, language);
  const toast = useToast();
  const auth = useContext(AuthContext);
  const signedIn = auth?.state.kind === "signedIn" ? auth.state : null;
  const membership = signedIn?.membership ?? null;
  const tenantId = membership?.tenant.id ?? null;
  const isManager = membership?.role === "owner" || membership?.role === "admin";
  const me = signedIn?.user.id ?? null;

  const tab: Tab = view === "expenses" || view === "supplies" ? view : "report";
  const [period, setPeriod] = useState<PeriodPreset>("THIS_MONTH");
  const [zone, setZone] = useState<string>(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [bookings, setBookings] = useState<BookingLike[] | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [supplies, setSupplies] = useState<SupplyRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ date: "", concept: "", amount: "", note: "", item: "", quantity: "", cost: "" });

  const now = Date.now();
  const range = useMemo(() => periodRange(period, now, zone), [period, now, zone]);
  const refetch = useCallback(() => setEpoch((n) => n + 1), []);
  const token = useCallback(() => auth?.adapter.getAccessToken(), [auth]);

  useEffect(() => {
    client.query(BookingConfigDocument, { botID: botId }).then((c) => { if (c.bot?.timezone) setZone(c.bot.timezone); }).catch(() => undefined);
  }, [client, botId]);

  useEffect(() => {
    if (!tenantId || !isManager) return;
    let cancelled = false;
    setLoadError(null);
    (async () => {
      const jwt = await token();
      const times = apiTimes(range, zone);
      const [b, e, s] = await Promise.all([
        client.query(BookingsRangeDocument, { botID: botId, startTime: times.startTime, endTime: times.endTime }),
        listExpenses(tenantId, range, jwt),
        listSupplies(tenantId, range, jwt),
      ]);
      if (cancelled) return;
      setBookings((b.bot?.bookingsV2 ?? []).filter((x): x is Extract<typeof x, { __typename: "Booking" }> => x.__typename === "Booking") as unknown as BookingLike[]);
      setExpenses(e); setSupplies(s);
    })().catch((err: unknown) => { if (!cancelled) setLoadError(describe(err)); });
    return () => { cancelled = true; };
  }, [client, botId, tenantId, isManager, range, zone, epoch, token]);

  const summary = useMemo(() => summarize(bookings ?? [], expenses, supplies), [bookings, expenses, supplies]);
  const currency = summary.currency ?? expenses[0]?.currency ?? supplies[0]?.currency ?? "USD";
  const fmt = (v: number) => money(v, currency, language);
  const dateValue = form.date || todayKey(now, zone);

  const act = async (run: () => Promise<void>, done: string) => {
    if (busy) return;
    setBusy(true);
    try { await run(); toast.show({ title: done, tone: "success" }); refetch(); }
    catch (err: unknown) { toast.show({ title: describe(err), tone: "danger" }); }
    finally { setBusy(false); }
  };
  const submitExpense = () => act(async () => {
    const amount = Number(form.amount.replace(",", "."));
    if (!form.concept.trim()) throw new Error(t.needConcept);
    if (!Number.isFinite(amount) || amount < 0) throw new Error(t.needAmount);
    await addExpense({ tenant_id: tenantId!, bot_id: botId, occurred_on: dateValue, concept: form.concept.trim().toLowerCase(), amount, currency, note: form.note.trim() || null, created_by: me! }, await token());
    setForm((f) => ({ ...f, concept: "", amount: "", note: "" }));
  }, t.saved);
  const submitSupply = () => act(async () => {
    const quantity = Number(form.quantity.replace(",", ".")); const cost = Number(form.cost.replace(",", "."));
    if (!form.item.trim()) throw new Error(t.needItem);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(t.needQuantity);
    if (!Number.isFinite(cost) || cost < 0) throw new Error(t.needAmount);
    await addSupply({ tenant_id: tenantId!, bot_id: botId, occurred_on: dateValue, item: form.item.trim().toLowerCase(), quantity, cost, currency, created_by: me! }, await token());
    setForm((f) => ({ ...f, item: "", quantity: "", cost: "" }));
  }, t.saved);

  const exportReport = () => {
    const rows = (bookings ?? []).map((b) => [b.startTime, b.status, b.service?.title ?? "", b.specialist ? [b.specialist.profile.firstName, b.specialist.profile.lastName ?? ""].join(" ").trim() : "", b.inlineContact?.name || b.contact?.name || "", b.service?.price?.amount ?? ""]);
    download(`${t.tabs.report.toLowerCase()}-${range.fromDay}-${range.toDay}.csv`, toCsv([t.columns.date, "status", t.columns.name, t.specialists, t.clients, t.columns.amount], rows));
  };
  const exportRows = (kind: "expenses" | "supplies") => {
    const rows = kind === "expenses" ? expenses.map((e) => [e.occurred_on, e.concept, e.amount, e.currency, e.note ?? ""]) : supplies.map((s) => [s.occurred_on, s.item, s.quantity, s.cost, s.currency]);
    const header = kind === "expenses" ? [t.columns.date, t.columns.concept, t.columns.amount, "currency", t.columns.note] : [t.columns.date, t.columns.item, t.columns.quantity, t.columns.cost, "currency"];
    download(`${t.tabs[kind].toLowerCase()}-${range.fromDay}-${range.toDay}.csv`, toCsv(header, rows));
  };

  const ranked = (title: string, rows: Ranked[]) => (
    <Card title={title}>
      {rows.length ? (
        <table className="w-full text-sm"><thead><tr className="text-text-muted text-left"><th>{t.columns.name}</th><th className="text-right">{t.columns.count}</th><th className="text-right">{t.columns.revenue}</th></tr></thead>
          <tbody>{rows.slice(0, 8).map((r) => <tr key={r.name}><td>{r.name}</td><td className="text-right">{r.count}</td><td className="text-right">{fmt(r.revenue)}</td></tr>)}</tbody></table>
      ) : <p className="text-sm text-text-muted">{t.empty}</p>}
    </Card>
  );

  const header = (
    <PageHeader
      title={t.title}
      tabs={<SegmentedControl<Tab> aria-label={t.title} value={tab} onChange={(next) => setView(next === "report" ? "" : next)} options={[{ value: "report", label: t.tabs.report }, { value: "expenses", label: t.tabs.expenses }, { value: "supplies", label: t.tabs.supplies }]} />}
      actions={<Select aria-label={t.summary} value={period} onChange={(v) => setPeriod(v as PeriodPreset)} options={PERIODS.map((p) => ({ value: p, label: t.periods[p] }))} />}
    />
  );

  if (!auth || !signedIn) return (<>{header}<PageBody><Alert tone="info">{t.signIn}</Alert></PageBody></>);
  if (!isManager) return (<>{header}<PageBody><Alert tone="info">{t.managersOnly}</Alert></PageBody></>);

  return (
    <>
      {header}
      <PageBody>
        <div className="flex flex-col gap-4" style={{ maxWidth: "52rem" }}>
          {loadError ? <Alert tone="danger" title={t.loadFailed} action={<Button size="sm" variant="secondary" onClick={refetch}>↻</Button>}>{loadError}</Alert> : null}
          {!bookings && !loadError ? <div className="flex items-center gap-2 text-text-muted"><Spinner /> {t.loading}</div> : null}

          {tab === "report" && bookings ? (
            <>
              <Card title={t.summary} actions={<Button size="sm" variant="outline" onClick={exportReport}>{t.export}</Button>}>
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))" }}>
                  {[[t.revenue, fmt(summary.revenue)], [t.billed, String(summary.billedCount)], [t.lost, String(summary.lostCount)], [t.expenses, fmt(summary.expenses)], [t.supplies, fmt(summary.supplies)], [t.net, fmt(summary.net)]].map(([label, value]) => (
                    <div key={label} className="rounded-lg p-3" style={{ background: "var(--surface-1, rgba(0,0,0,.04))" }}><div className="text-xs text-text-muted">{label}</div><div className="text-lg font-semibold">{value}</div></div>
                  ))}
                </div>
                {summary.withoutPrice ? <p className="text-sm text-text-muted mt-2">{t.withoutPrice(summary.withoutPrice)}</p> : null}
              </Card>
              {ranked(t.topServices, summary.byService)}
              {ranked(t.specialists, summary.bySpecialist)}
              {ranked(t.clients, summary.byClient)}
            </>
          ) : null}

          {tab === "expenses" ? (
            <>
              <Card title={t.add}>
                <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0,.8fr) minmax(0,1.4fr) minmax(0,.8fr) auto" }}>
                  <Input type="date" aria-label={t.columns.date} value={dateValue} onChange={(e) => setForm((f) => ({ ...f, date: e.currentTarget.value }))} />
                  <Input aria-label={t.columns.concept} placeholder={t.columns.concept} value={form.concept} onChange={(e) => setForm((f) => ({ ...f, concept: e.currentTarget.value }))} />
                  <Input aria-label={t.columns.amount} inputMode="decimal" placeholder={`${t.columns.amount} (${currency})`} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.currentTarget.value }))} />
                  <Button variant="primary" loading={busy} disabled={busy} onClick={() => void submitExpense()}>{t.add}</Button>
                </div>
                <Input className="mt-2" aria-label={t.columns.note} placeholder={t.columns.note} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.currentTarget.value }))} />
              </Card>
              <Card title={`${t.tabs.expenses} · ${fmt(summary.expenses)}`} actions={<Button size="sm" variant="outline" onClick={() => exportRows("expenses")}>{t.export}</Button>}>
                {expenses.length ? (
                  <table className="w-full text-sm"><thead><tr className="text-text-muted text-left"><th>{t.columns.date}</th><th>{t.columns.concept}</th><th className="text-right">{t.columns.amount}</th><th /></tr></thead>
                    <tbody>{expenses.map((e) => <tr key={e.id}><td>{e.occurred_on}</td><td>{e.concept}{e.note ? <span className="text-text-muted"> · {e.note}</span> : null}</td><td className="text-right">{money(Number(e.amount), e.currency, language)}</td><td className="text-right"><Button size="xs" variant="ghost" disabled={busy} onClick={() => void act(async () => { await removeExpense(e.id, await token()); }, t.removed)}>{t.remove}</Button></td></tr>)}</tbody></table>
                ) : <p className="text-sm text-text-muted">{t.empty}</p>}
              </Card>
            </>
          ) : null}

          {tab === "supplies" ? (
            <>
              <Card title={t.add}>
                <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0,.8fr) minmax(0,1.2fr) minmax(0,.6fr) minmax(0,.8fr) auto" }}>
                  <Input type="date" aria-label={t.columns.date} value={dateValue} onChange={(e) => setForm((f) => ({ ...f, date: e.currentTarget.value }))} />
                  <Input aria-label={t.columns.item} placeholder={t.columns.item} value={form.item} onChange={(e) => setForm((f) => ({ ...f, item: e.currentTarget.value }))} />
                  <Input aria-label={t.columns.quantity} inputMode="decimal" placeholder={t.columns.quantity} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.currentTarget.value }))} />
                  <Input aria-label={t.columns.cost} inputMode="decimal" placeholder={`${t.columns.cost} (${currency})`} value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.currentTarget.value }))} />
                  <Button variant="primary" loading={busy} disabled={busy} onClick={() => void submitSupply()}>{t.add}</Button>
                </div>
              </Card>
              <Card title={`${t.tabs.supplies} · ${fmt(summary.supplies)}`} actions={<Button size="sm" variant="outline" onClick={() => exportRows("supplies")}>{t.export}</Button>}>
                {supplies.length ? (
                  <table className="w-full text-sm"><thead><tr className="text-text-muted text-left"><th>{t.columns.date}</th><th>{t.columns.item}</th><th className="text-right">{t.columns.quantity}</th><th className="text-right">{t.columns.cost}</th><th /></tr></thead>
                    <tbody>{supplies.map((s) => <tr key={s.id}><td>{s.occurred_on}</td><td>{s.item}</td><td className="text-right">{Number(s.quantity)}</td><td className="text-right">{money(Number(s.cost), s.currency, language)}</td><td className="text-right"><Button size="xs" variant="ghost" disabled={busy} onClick={() => void act(async () => { await removeSupply(s.id, await token()); }, t.removed)}>{t.remove}</Button></td></tr>)}</tbody></table>
                ) : <p className="text-sm text-text-muted">{t.empty}</p>}
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
export function MoneyApp(props: ModuleAppProps) {
  return (
    <ModuleRoot>
      <ToastProvider>
        <MoneyBody {...props} />
      </ToastProvider>
    </ModuleRoot>
  );
}
