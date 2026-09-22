import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createServer, request, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createSignalRoutes } from './signal-routes';

const admission = vi.hoisted(() => ({ allow: true, calls: 0 }));
vi.mock('../../vendor/chatfuel-proxy/context.js', () => ({ createProxyContext: () => ({ gate: { clear() {} }, fence: { clear() {} } }) }));
vi.mock('../../vendor/chatfuel-proxy/admission.js', () => ({
  admitRequest: async (_ctx: unknown, _req: unknown, res: import('node:http').ServerResponse) => {
    admission.calls++;
    if (!admission.allow) { res.statusCode = 401; res.end('{}'); return null; }
    return { tenantKey: 'test-workspace', botIds: new Set(['test-bot']) };
  },
  fenceFor: async () => ({ ok: true, ids: new Set(['test-bot']) }),
  botAllowed: (bot: string, ids: Set<string>) => ids.has(bot),
}));
let server: Server, routes: ReturnType<typeof createSignalRoutes>, port: number;
let calls: { body: unknown; url: string }[];
const fixture = JSON.parse(await readFile(new URL('../../public/signal-lab/general-results.json', import.meta.url), 'utf8'));
const config = (await import('./signal-core.mjs')).generalConfig;
const modelRecord = Object.values(fixture.records)[0];
beforeEach(async () => {
  calls = []; admission.allow = true; admission.calls = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { calls.push({ url, body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify(modelRecord), { status: 200 }); });
  routes = createSignalRoutes({ TYPESAFE_API_KEY: 'test-only', CHATFUEL_TOKEN: 'test-only' });
  server = createServer((req, res) => { if (!routes.handleRequest(req, res)) { res.statusCode = 404; res.end(); } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Test server did not bind.'); port = address.port;
});
afterEach(async () => { routes.close(); await new Promise<void>(resolve => server.close(() => resolve())); vi.unstubAllGlobals(); });
const send = (body: unknown, extra: Record<string, string> = {}, path = '/chatfuel/signal/analyze') => new Promise<{ status: number; body: string }>((resolve, reject) => {
  const req = request({ hostname: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json', ...extra } }, res => {
    let content = ''; res.on('data', chunk => content += chunk); res.on('end', () => resolve({ status: res.statusCode || 0, body: content }));
  }); req.on('error', reject); req.end(JSON.stringify(body));
});
const valid = () => ({ botId: 'test-bot', consent: { provider: 'TypeSafe', confirmed: true, messageCount: 1 }, config, messages: [{ id: 'one', text: 'Where can I find the recording?', context: '', channel: 'Manual test' }] });
test('one selected message reaches TypeSafe only after consent and workspace admission', async () => {
  expect((await send(valid())).status).toBe(200);
  expect(admission.calls).toBe(1); expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://api.typesafe.ai/v1/systemone');
});
test('missing consent makes no provider call', async () => { expect((await send({ ...valid(), consent: null })).status).toBe(400); expect(calls).toHaveLength(0); });
test('cross-workspace bot makes no provider call', async () => { expect((await send({ ...valid(), botId: 'other-bot' })).status).toBe(403); expect(calls).toHaveLength(0); });
test('unauthenticated request makes no provider call', async () => { admission.allow = false; expect((await send(valid())).status).toBe(401); expect(calls).toHaveLength(0); });
test('cross-origin request is rejected before admission', async () => { expect((await send(valid(), { origin: 'https://elsewhere.example' })).status).toBe(403); expect(admission.calls).toBe(0); });
test('oversized request is rejected', async () => { expect((await send({ text: 'x'.repeat(70000) })).status).toBe(413); expect(calls).toHaveLength(0); });
test('cached decisions remain scoped to the admitted bot', async () => { await send(valid()); await send(valid()); expect(calls).toHaveLength(1); });

test('malformed request target cannot escape the handler', async () => { expect((await send({}, {}, '//[')).status).toBe(400); expect(calls).toHaveLength(0); });
