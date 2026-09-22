import { createHash } from 'node:crypto';
import { validateConfig, buildQuestions, configSignature, normalizeAnswers } from './signal-core.mjs';

export function validateAnalysis(body) {
  const config = validateConfig(body?.config);
  if (body?.consent?.confirmed !== true || body.consent.provider !== 'TypeSafe' || body.consent.messageCount !== body?.messages?.length) throw new Error('Confirm the selected messages and TypeSafe destination before analysis.');
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 5) throw new Error('Analyze 1–5 messages per request.');
  const messages = body.messages.map(m => {
    if (!m || typeof m.id !== 'string' || m.id.length > 120 || typeof m.text !== 'string' || m.text.trim().length < 3 || m.text.length > 3000 || typeof m.context !== 'string' || m.context.length > 3000 || typeof m.channel !== 'string' || m.channel.length > 80) throw new Error('Invalid message. Use 3–3,000 characters.');
    return { id: m.id, text: m.text.trim(), context: m.context, channel: m.channel };
  });
  return { config, messages };
}
export async function analyzeMessage(message, config, provider, { fetchImpl = fetch } = {}) {
  const started = performance.now();
  const response = await fetchImpl(provider.endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
    body: JSON.stringify({ model: provider.name === 'TypeSafe' ? 'jev-latest' : provider.model, state: { business: config.context, conversation: message.context, channel: message.channel, message: message.text }, questions: buildQuestions(config) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Jev returned HTTP ${response.status}. Try again later.`);
  const result = await response.json();
  return { id: message.id, source: 'live', model: result.model || provider.model, answers: normalizeAnswers(result, config), durationMs: Math.round(performance.now() - started), usage: { inputTokens: result.usage?.input_tokens ?? 0, outputTokens: result.usage?.output_tokens ?? 0 }, evaluatedAt: new Date().toISOString() };
}
export function createAnalyzer(provider, options = {}) {
  const cache = new Map(); let count = 0, windowAt = Date.now(), running = 0;
  return async body => {
    if (!provider) return { status: 503, body: { error: 'Add a server-side TYPESAFE_API_KEY to analyze new messages. The recorded demo works without a key.' } };
    let validated;
    try { validated = validateAnalysis(body); } catch (e) { return { status: 400, body: { error: e.message } }; }
    const { config, messages } = validated;
    if (Date.now() - windowAt > 60000) { count = 0; windowAt = Date.now(); }
    if (count + messages.length > 120 || running >= 2) return { status: 429, body: { error: 'Analysis is busy. Wait a minute before trying again.' } };
    count += messages.length; running++;
    try {
      const results = []; let index = 0;
      await Promise.all(Array.from({ length: Math.min(3, messages.length) }, async () => {
        while (index < messages.length) {
          const m = messages[index++];
          const key = createHash('sha256').update(configSignature(config) + JSON.stringify([m.text, m.context, m.channel])).digest('hex');
          try {
            if (!cache.has(key)) {
              if (cache.size >= 2500) cache.delete(cache.keys().next().value);
              cache.set(key, analyzeMessage(m, config, provider, options).catch(error => { cache.delete(key); throw error; }));
            }
            results.push({ ...await cache.get(key), id: m.id });
          } catch (error) { results.push({ id: m.id, error: error.message }); }
        }
      }));
      return { status: 200, body: { results, signature: configSignature(config) } };
    } finally { running--; }
  };
}
export function originAllowed(origin, host, configuredOrigin = '') {
  if (!origin) return true;
  try { const u = new URL(origin); return u.origin === configuredOrigin || ((u.protocol === 'http:' || u.protocol === 'https:') && u.host === host); } catch { return false; }
}
