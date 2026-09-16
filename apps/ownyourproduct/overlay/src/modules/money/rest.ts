/**
 * The two tables this module adds (0030_money.sql), read and written through
 * PostgREST with the signed-in user's token. The auth module's adapter owns the
 * Supabase client and does not lend it out; the anon key and URL are the same
 * VITE_* values it uses. Row-level security decides who sees what.
 */
export interface RestError extends Error {
  status: number;
  hint: string | null;
  code: string | null;
}

const url = (): string => (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
const anon = (): string => import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

async function call<T>(method: "GET" | "POST" | "PATCH", path: string, token: string | undefined, body?: unknown, fetchImpl: typeof fetch = fetch): Promise<T> {
  if (!url() || !anon()) throw Object.assign(new Error("Supabase is not configured for this app"), { status: 0, hint: null, code: null }) as RestError;
  const res = await fetchImpl(`${url()}/rest/v1/${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      apikey: anon(),
      authorization: `Bearer ${token ?? anon()}`,
      prefer: method === "GET" ? "count=none" : "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    const b = (parsed && typeof parsed === "object" ? parsed : {}) as { message?: string; hint?: string; code?: string };
    const err = new Error(b.message || `${method} ${path} failed (${res.status})`) as RestError;
    err.status = res.status; err.hint = b.hint ?? null; err.code = b.code ?? null;
    throw err;
  }
  return parsed as T;
}

export interface ExpenseRow { id: string; tenant_id: string; bot_id: string; occurred_on: string; concept: string; amount: string | number; currency: string; note: string | null; created_at: string; deleted_at: string | null }
export interface SupplyRow { id: string; tenant_id: string; bot_id: string; occurred_on: string; item: string; quantity: string | number; cost: string | number; currency: string; created_at: string; deleted_at: string | null }

export interface Period { fromDay: string; toDay: string }

const dayFilter = (p: Period) => `&occurred_on=gte.${p.fromDay}&occurred_on=lte.${p.toDay}`;

export const listExpenses = (tenantId: string, p: Period, token?: string) =>
  call<ExpenseRow[]>("GET", `cf_oyp_expenses?select=*&tenant_id=eq.${tenantId}&deleted_at=is.null${dayFilter(p)}&order=occurred_on.desc,created_at.desc`, token);
export const listSupplies = (tenantId: string, p: Period, token?: string) =>
  call<SupplyRow[]>("GET", `cf_oyp_supplies?select=*&tenant_id=eq.${tenantId}&deleted_at=is.null${dayFilter(p)}&order=occurred_on.desc,created_at.desc`, token);

export const addExpense = (row: { tenant_id: string; bot_id: string; occurred_on: string; concept: string; amount: number; currency: string; note?: string | null; created_by: string }, token?: string) =>
  call<ExpenseRow[]>("POST", "cf_oyp_expenses", token, row).then((rows) => rows[0]!);
export const addSupply = (row: { tenant_id: string; bot_id: string; occurred_on: string; item: string; quantity: number; cost: number; currency: string; created_by: string }, token?: string) =>
  call<SupplyRow[]>("POST", "cf_oyp_supplies", token, row).then((rows) => rows[0]!);

/** Rows are never deleted: a tombstone keeps the history honest. */
export const removeExpense = (id: string, token?: string) =>
  call<ExpenseRow[]>("PATCH", `cf_oyp_expenses?id=eq.${id}`, token, { deleted_at: new Date().toISOString() });
export const removeSupply = (id: string, token?: string) =>
  call<SupplyRow[]>("PATCH", `cf_oyp_supplies?id=eq.${id}`, token, { deleted_at: new Date().toISOString() });
