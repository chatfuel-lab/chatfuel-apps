/**
 * One PostgREST call, for the functions this module adds to the auth schema
 * (0019_staff_access.sql). The auth module's adapter owns the Supabase
 * client and does not lend it out, so this goes through fetch with the same
 * anon key and the signed-in user's token. Errors keep PostgREST's message and
 * hint, which is what the migration writes for a refusal.
 */
export interface RpcError extends Error {
  status: number;
  hint: string | null;
  code: string | null;
}

export const supabaseUrl = (): string => (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
export const supabaseAnonKey = (): string => import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export async function rpc<T>(fn: string, args: Record<string, unknown>, token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<T> {
  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) throw Object.assign(new Error("Supabase is not configured for this app"), { status: 0, hint: null, code: null }) as RpcError;
  const res = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anon,
      authorization: `Bearer ${token ?? anon}`,
      prefer: "return=representation",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const b = (body && typeof body === "object" ? body : {}) as { message?: string; hint?: string; code?: string };
    const err = new Error(b.message || `${fn} failed (${res.status})`) as RpcError;
    err.status = res.status; err.hint = b.hint ?? null; err.code = b.code ?? null;
    throw err;
  }
  return body as T;
}
