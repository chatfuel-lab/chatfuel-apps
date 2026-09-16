/**
* Team: who has access and at what level. A manager runs the whole salon; a
 * specialist sees only her own calendar. The levels live in the auth schema
 * (0019_staff_access.sql, an app migration over the wizard's auth module);
 * the calendars come from Bookings; the auth module's adapter signs the calls.
 */
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Input, ModuleRoot, PageBody, PageHeader, Select, Spinner, Tag, ToastProvider, useToast } from "~ui";
import { BookingSpecialistsDocument } from "~api/generated/bookings/graphql";
import { AuthContext } from "../auth/AuthContext";
import { inviteUrl } from "../auth/lib/authRoutes";
import type { ModuleAppProps } from "../types";
import { EQUIPO_COPY } from "./copy";
import { copy, useAppLanguage } from "./language";
import {
  VALID_EMAIL,
  changeLevelArgs,
  freeSpecialists,
  inviteArgs,
  levelOf,
  type InviteRow,
  type MemberRow,
  type Specialist,
  type StaffLevel,
} from "./model";
import { rpc, type RpcError } from "./rpc";

const EXTRA = {
  es: { copyLink: "Copiar enlace", copied: "Enlace copiado", signIn: "Inicia sesión para ver el equipo.", refresh: "Actualizar" },
  pt: { copyLink: "Copiar link", copied: "Link copiado", signIn: "Entre para ver a equipe.", refresh: "Atualizar" },
  en: { copyLink: "Copy link", copied: "Link copied", signIn: "Sign in to see the team.", refresh: "Refresh" },
};

const describe = (err: unknown): string => {
  const e = err as Partial<RpcError>;
  const msg = err instanceof Error ? err.message : String(err);
  return e.hint ? `${msg} (${e.hint})` : msg;
};

function EquipoBody({ botId, client }: ModuleAppProps) {
  const language = useAppLanguage();
  const t = copy(EQUIPO_COPY, language);
  const x = EXTRA[language] ?? EXTRA.es;
  const toast = useToast();
  const auth = useContext(AuthContext);

  const signedIn = auth?.state.kind === "signedIn" ? auth.state : null;
  const membership = signedIn?.membership ?? null;
  const tenantId = membership?.tenant.id ?? null;
  const me = signedIn?.user.id ?? null;
  const isManager = membership?.role === "owner" || membership?.role === "admin";

  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingSpecialist, setPendingSpecialist] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [level, setLevel] = useState<StaffLevel>("specialist");
  const [inviteSpecialist, setInviteSpecialist] = useState("");
  const [lastLink, setLastLink] = useState<string | null>(null);

  const token = useCallback(() => auth?.adapter.getAccessToken(), [auth]);
  const refetch = useCallback(() => setEpoch((n) => n + 1), []);

  useEffect(() => {
    if (!tenantId || !auth) return;
    let cancelled = false;
    setLoadError(null);
    (async () => {
      const jwt = await token();
      const [rows, pending, people] = await Promise.all([
        rpc<MemberRow[] | null>("cf_list_members", { p_tenant_id: tenantId }, jwt),
        rpc<InviteRow[] | null>("cf_list_invites", { p_tenant_id: tenantId }, jwt),
        client.query(BookingSpecialistsDocument, { botID: botId }),
      ]);
      if (cancelled) return;
      setMembers(rows ?? []);
      setInvites(pending ?? []);
      setSpecialists((people.bot?.specialists ?? []).map((p) => ({ id: p.id, name: [p.profile.firstName, p.profile.lastName ?? ""].join(" ").trim() })));
    })().catch((err: unknown) => { if (!cancelled) setLoadError(describe(err)); });
    return () => { cancelled = true; };
  }, [auth, tenantId, botId, client, epoch, token]);

  const specialistName = (id: string | null) => specialists.find((s) => s.id === id)?.name ?? null;
  const act = async (key: string, run: () => Promise<void>, done: string) => {
    if (busy) return;
    setBusy(key);
    try { await run(); toast.show({ title: done, tone: "success" }); refetch(); }
    catch (err: unknown) { toast.show({ title: describe(err), tone: "danger" }); }
    finally { setBusy(null); }
  };

  const setMemberLevel = (m: MemberRow, next: StaffLevel, specialistId: string | null) =>
    act(`level:${m.user_id}`, async () => {
      await rpc("cf_change_member_role", changeLevelArgs(tenantId!, m.user_id, next, specialistId), await token());
      setPendingSpecialist(null);
    }, t.saved);
  const setLink = (m: MemberRow, specialistId: string) =>
    act(`link:${m.user_id}`, async () => {
      await rpc("cf_set_member_specialist", { p_tenant_id: tenantId, p_user_id: m.user_id, p_specialist_id: specialistId }, await token());
    }, t.saved);
  const removeMember = (m: MemberRow) => act(`remove:${m.user_id}`, () => auth!.adapter.removeMember(m.user_id), t.removed);
  const revoke = (i: InviteRow) => act(`revoke:${i.id}`, () => auth!.adapter.revokeInvite(i.id), t.revoked);
  const sendInvite = () =>
    act("invite", async () => {
      if (!VALID_EMAIL.test(email.trim())) throw new Error(t.needEmail);
      if (level === "specialist" && !inviteSpecialist) throw new Error(t.needSpecialist);
      const created = await rpc<{ token?: string; id?: string }>("cf_create_invite", inviteArgs(tenantId!, email, level, inviteSpecialist || null, inviteName), await token());
      setLastLink(created?.token ? inviteUrl(created.token) : null);
      setEmail(""); setInviteName(""); setInviteSpecialist("");
    }, t.sent(email.trim()));

  const copyLink = async (link: string) => {
    try { await navigator.clipboard?.writeText(link); toast.show({ title: x.copied, tone: "success" }); } catch { /* the link is on screen */ }
  };

  const rows = useMemo(() => members ?? [], [members]);
  const pendingInvites = invites.filter((i) => i.status === "pending");
  const inviteOptions = freeSpecialists(specialists, rows, invites);

  if (!auth || !signedIn) {
    return (<><PageHeader title={t.title} /><PageBody><Alert tone="info">{x.signIn}</Alert></PageBody></>);
  }
  if (!isManager) {
    return (<><PageHeader title={t.title} /><PageBody><Alert tone="info">{t.managersOnly}</Alert></PageBody></>);
  }

  return (
    <>
      <PageHeader title={t.title} actions={<Button size="sm" variant="ghost" onClick={refetch}>{x.refresh}</Button>} />
      <PageBody>
        <div className="flex flex-col gap-4" style={{ maxWidth: "48rem" }}>
          <p className="text-text-muted">{t.lead}</p>
          {loadError ? <Alert tone="danger" title={t.loadFailed}>{loadError}</Alert> : null}
          {!members && !loadError ? <div className="flex items-center gap-2 text-text-muted"><Spinner /></div> : null}

          {members ? (
            <Card title={t.staff}>
              <div className="flex flex-col gap-3">
                {rows.map((m) => {
                  const lvl = levelOf(m.role);
                  const isMe = m.user_id === me;
                  const options = freeSpecialists(specialists, rows, invites, m.specialist_id);
                  const wantsSpecialist = lvl === "specialist" || pendingSpecialist === m.user_id;
                  return (
                    <div key={m.user_id} className="grid gap-2 items-center" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) auto" }}>
                      <div className="min-w-0">
                        <div className="truncate">{m.display_name || m.full_name || m.email || m.user_id}</div>
                        <div className="text-sm text-text-muted truncate">{m.email ?? ""}{lvl === "specialist" ? ` · ${specialistName(m.specialist_id) ?? (m.specialist_id ? t.missingSpecialist : t.noSpecialist)}` : ""}</div>
                      </div>
                      {lvl === "owner" ? <Tag tone="accent">{t.owner}</Tag> : (
                        <Select
                          value={wantsSpecialist ? "specialist" : "manager"}
                          disabled={isMe || busy !== null}
                          onChange={(next) => {
                            if (next === "specialist" && lvl !== "specialist") { setPendingSpecialist(m.user_id); return; }
                            if (next === "manager") { setPendingSpecialist(null); void setMemberLevel(m, "manager", null); }
                          }}
                          options={[{ value: "manager", label: t.manager }, { value: "specialist", label: t.specialist }]}
                        />
                      )}
                      {lvl !== "owner" && wantsSpecialist ? (
                        <Select
                          value={m.specialist_id ?? ""}
                          placeholder={t.pickSpecialist}
                          disabled={busy !== null}
                          onChange={(chosen) => { if (!chosen) return; if (lvl !== "specialist") void setMemberLevel(m, "specialist", chosen); else void setLink(m, chosen); }}
                          options={[...(m.specialist_id && !options.some((o) => o.id === m.specialist_id) ? [{ value: m.specialist_id, label: specialistName(m.specialist_id) ?? t.missingSpecialist }] : []), ...options.map((s) => ({ value: s.id, label: s.name }))]}
                        />
                      ) : <span className="text-sm text-text-muted">{lvl === "manager" ? t.managerHint : lvl === "owner" ? "" : t.specialistHint}</span>}
                      {lvl !== "owner" && !isMe ? <Button size="sm" variant="dangerGhost" disabled={busy !== null} onClick={() => void removeMember(m)}>{t.remove}</Button> : <span />}
                    </div>
                  );
                })}
                {pendingSpecialist ? <p className="text-sm text-text-muted">{t.pickFirst}</p> : null}
              </div>
            </Card>
          ) : null}

          <Card title={t.invite}>
            <div className="flex flex-col gap-3">
              <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                <Input aria-label={t.name} placeholder={t.name} value={inviteName} onChange={(e) => setInviteName(e.currentTarget.value)} />
                <Input aria-label={t.email} placeholder={t.email} type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} invalid={!!email && !VALID_EMAIL.test(email.trim())} />
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                <Select aria-label={t.level} value={level} onChange={(v) => setLevel(v as StaffLevel)} options={[{ value: "specialist", label: t.specialist }, { value: "manager", label: t.manager }]} />
                {level === "specialist" ? (
                  <Select aria-label={t.whichSpecialist} value={inviteSpecialist} placeholder={t.pickSpecialist} onChange={setInviteSpecialist} options={inviteOptions.map((s) => ({ value: s.id, label: s.name }))} />
                ) : <span className="text-sm text-text-muted">{t.managerHint}</span>}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button variant="primary" loading={busy === "invite"} disabled={busy !== null || !VALID_EMAIL.test(email.trim()) || (level === "specialist" && !inviteSpecialist)} onClick={() => void sendInvite()}>{busy === "invite" ? t.sending : t.send}</Button>
                {level === "specialist" ? <span className="text-sm text-text-muted">{t.specialistHint}</span> : null}
              </div>
              {lastLink ? (
                <Alert tone="info" title={t.notSent} action={<Button size="sm" variant="secondary" onClick={() => void copyLink(lastLink)}>{x.copyLink}</Button>}>
                  <code className="text-xs break-all">{lastLink}</code>
                </Alert>
              ) : null}
            </div>
          </Card>

          <Card title={t.invites}>
            {pendingInvites.length ? (
              <div className="flex flex-col gap-2">
                {pendingInvites.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 flex-wrap">
                    <span className="min-w-0 truncate">{i.display_name || i.email}</span>
                    <Tag tone="neutral">{i.role === "admin" ? t.manager : `${t.specialist}${i.specialist_id ? ` · ${specialistName(i.specialist_id) ?? t.missingSpecialist}` : ""}`}</Tag>
                    <span className="text-sm text-text-muted">{t.status.pending}</span>
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void revoke(i)}>{t.revoke}</Button>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-text-muted">{t.noInvites}</p>}
          </Card>
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
export function EquipoApp(props: ModuleAppProps) {
  return (
    <ModuleRoot>
      <ToastProvider>
        <EquipoBody {...props} />
      </ToastProvider>
    </ModuleRoot>
  );
}
