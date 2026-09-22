import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { resolveProxyConfig, type ProxyEnv } from '../../vendor/chatfuel-proxy/core.js';
import { createProxyContext } from '../../vendor/chatfuel-proxy/context.js';
import { admitRequest, fenceFor, botAllowed } from '../../vendor/chatfuel-proxy/admission.js';
import { requestRefusal, SAME_ORIGIN_ONLY } from '../../vendor/chatfuel-proxy/origin.js';
import { readBodyCapped, sendJson } from '../../vendor/chatfuel-proxy/envelope.js';
import { createAnalyzer } from './analysis.mjs';

export const createSignalRoutes = (env: ProxyEnv, basePath = '') => {
  const config = resolveProxyConfig({}, env);
  const context = createProxyContext(config);
  const prefix = `${basePath.replace(/\/$/, '')}/chatfuel/signal/`;
  const provider = env.TYPESAFE_API_KEY ? { name: 'TypeSafe', endpoint: 'https://api.typesafe.ai/v1/systemone', key: env.TYPESAFE_API_KEY, model: 'jev-latest' } : null;
  const analyzers = new Map<string, { run: ReturnType<typeof createAnalyzer>; last: number }>();
  let running = 0;

  const handle = async (req: IncomingMessage, res: ServerResponse, action: string) => {
    res.setHeader('cache-control', 'no-store');
    const refusal = requestRefusal(req, { origin: SAME_ORIGIN_ONLY, host: config.hostPolicy });
    if (refusal) return sendJson(res, 403, { error: refusal.message });
    if (action === 'status' && req.method === 'GET') return sendJson(res, 200, { live: Boolean(provider && env.CHATFUEL_TOKEN), provider: 'TypeSafe' });
    if (action !== 'analyze' || req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST for analysis.' });
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '') && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
    if (!context.gate && !local) return sendJson(res, 503, { error: 'Configure SDK authentication before enabling analysis outside localhost.' });
    const admission = await admitRequest(context, req, res);
    if (!admission) return;
    if (!req.headers['content-type']?.startsWith('application/json')) return sendJson(res, 415, { error: 'Send JSON.' });
    const raw = await readBodyCapped(req, 65536);
    if (!raw) { res.setHeader('connection', 'close'); return sendJson(res, 413, { error: 'Analysis request is too large.' }); }
    let body: unknown;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return sendJson(res, 400, { error: 'Invalid JSON.' }); }
    if (!body || typeof body !== 'object' || !('botId' in body) || typeof body.botId !== 'string' || !body.botId || body.botId.length > 150) return sendJson(res, 400, { error: 'Select a workspace bot.' });
    const fence = await fenceFor(context, admission);
    if (!fence.ok) return sendJson(res, 503, { error: 'Could not verify the workspace.' });
    if (!botAllowed(body.botId, fence.ids)) return sendJson(res, 403, { error: 'This bot is not available to your workspace.' });
    if (running >= 2) return sendJson(res, 429, { error: 'Analysis is busy. Try again shortly.' });
    const now = Date.now();
    for (const [key, item] of analyzers) if (now - item.last > 300000 && running === 0) analyzers.delete(key);
    const tenant = `${admission.tenantKey || 'local'}:${body.botId}`;
    if (!analyzers.has(tenant)) {
      if (analyzers.size >= 32) return sendJson(res, 429, { error: 'Analysis capacity reached. Try again later.' });
      analyzers.set(tenant, { run: createAnalyzer(provider), last: now });
    }
    const analyzer = analyzers.get(tenant)!;
    analyzer.last = now; running++;
    try { const result = await analyzer.run(body); sendJson(res, result.status, result.body); }
    finally { running--; analyzer.last = Date.now(); }
  };
  return {
    handleRequest: (req: IncomingMessage, res: ServerResponse) => {
      let url: URL;
      try { url = new URL(req.url || '/', 'http://localhost'); } catch { sendJson(res, 400, { error: 'Invalid request target.' }); return true; }
      const action = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname === '/api/signal' ? url.searchParams.get('signalAction') : null;
      if (action === null) return false;
      void handle(req, res, action).catch(() => { if (!res.writableEnded) sendJson(res, 500, { error: 'Analysis could not be completed. Try again.' }); });
      return true;
    },
    close: () => { context.gate?.clear(); context.fence?.clear(); context.resourceStore?.close(); analyzers.clear(); },
  };
};

export const attachSignalRoutes = (server: Server, env: ProxyEnv, basePath = '') => {
  const routes = createSignalRoutes(env, basePath);
  const listeners = server.listeners('request');
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    if ((req.url || '').split('?')[0] === `${basePath.replace(/\/$/, '')}/signal-lab/index.html`) {
      const setHeader = res.setHeader.bind(res);
      res.setHeader = (name, value) => setHeader(name, name.toLowerCase() === 'x-frame-options' ? 'SAMEORIGIN' : name.toLowerCase() === 'content-security-policy' && typeof value === 'string' ? value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") : value);
    }
    if (!routes.handleRequest(req, res)) for (const listener of listeners) listener.call(server, req, res);
  });
  server.once('close', routes.close);
};
