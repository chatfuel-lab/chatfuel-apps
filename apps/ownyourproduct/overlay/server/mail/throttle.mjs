/**
 * The brake on the endpoints that send mail to an address somebody typed:
 * "olvidé mi contraseña", "reenviar confirmación", and a staff invitation.
 *
 * Five per address per quarter hour is the real limit — it is what stops a loop
 * or a list of addresses being fed through recovery. The per-client limit only
 * applies where the caller can actually be told apart; behind a proxy every
 * visitor shares one key, and a ceiling there would let anyone close recovery
 * for everybody. Whether a caller SENDS a forwarded-for header is not allowed
 * to decide that — only the deployment's own configuration is
 * (AGENDA_TRUST_FORWARDED_FOR).
 *
 * Keys are bounded, and the bound is never allowed to become the outage:
 * junk addresses share one bucket, and a full map gives up its least recently
 * used counter rather than refusing every address it has not seen. Flushing
 * one counter that way costs an attacker the whole map and buys five more
 * emails to one address; refusing new keys would have cost everyone recovery.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createMailThrottle({
  windowMs = 15 * 60_000,
  perAddress = 5,
  perClient = 20,
  maxKeys = 20_000,
} = {}) {
  const hits = new Map();
  const lastHit = (times) => times[times.length - 1] ?? 0;

  const makeRoom = (now) => {
    if (hits.size < maxKeys) return;
    for (const [candidate, times] of hits) {
      if (now - lastHit(times) >= windowMs) hits.delete(candidate);
    }
    while (hits.size >= maxKeys) {
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const [candidate, times] of hits) {
        const at = lastHit(times);
        if (at < oldestAt) {
          oldestAt = at;
          oldestKey = candidate;
        }
      }
      if (oldestKey === null) return;
      hits.delete(oldestKey);
    }
  };

  const count = (key, max, now) => {
    const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    if (!hits.has(key)) makeRoom(now);
    recent.push(now);
    hits.set(key, recent);
    return true;
  };

  /** One bucket for everything that is not an address, so junk cannot fill the map. */
  const addressKeyOf = (value, scope) => {
    const address = String(value ?? "").trim().toLowerCase();
    return `a:${scope}:${address.length <= 320 && EMAIL_RE.test(address) ? address : "malformed"}`;
  };

  return {
    /**
     * `client` is throttleKey()'s answer: `{ key, shared }`. `scope` separates
     * the buckets of endpoints that must not spend each other's budget — a
     * stranger asking for password recovery cannot stop a manager inviting
     * that same colleague.
     */
    allow(addressKey, client, { scope = "mail", now = Date.now() } = {}) {
      const clientAllowed = client?.shared === true || count(`c:${client?.key ?? "unknown"}`, perClient, now);
      return clientAllowed && count(addressKeyOf(addressKey, scope), perAddress, now);
    },
    get size() {
      return hits.size;
    },
  };
}
