import { readFile, writeFile, access } from 'node:fs/promises';

/** @type {Map<string, string>} */
const changes = new Map();
/** @param {string} file @param {(text: string) => string} apply */
const edit = async (file, apply) => changes.set(file, apply(await readFile(file, 'utf8')));
/** @param {string} text @param {RegExp} pattern @param {string} value @param {string} name */
const replace = (text, pattern, value, name) => {
  if (!pattern.test(text)) throw new Error(`Unsupported scaffold: ${name}. Follow playbook.md to register it manually.`);
  return text.replace(pattern, value);
};
await access('src/vendor/api/generated/livechat/graphql.ts');
await edit('src/modules/index.ts', text => text.includes("as signalLab }") ? text : "import { moduleDescriptor as signalLab } from './signal-lab';\n" + replace(text, /(export const MODULES[^=]*=\s*\[)/, '$1signalLab, ', 'module registry'));
await edit('src/modules/navGroups.tsx', text => {
  if (text.includes("items: ['signal-lab']")) return text;
  return "import { IconLayoutGrid as SignalLabIcon } from '~ui';\n" + replace(text, /(export const NAV_GROUPS[^=]*=\s*\[)/, "$1\n  { id: 'signal', title: 'Signal Lab', icon: <SignalLabIcon />, items: ['signal-lab'] },", 'navigation groups');
});
await edit('src/operationDocs.ts', text => text.includes('signalInbox') ? text : "import { ChatListDocument, ConversationMessagesDocument } from './vendor/api/generated/livechat/graphql.js';\nconst signalInbox = { ChatListDocument, ConversationMessagesDocument };\n" + replace(text, /(export const operations\s*=\s*\[)/, '$1signalInbox, ', 'operation registry'));
await edit('vite.config.ts', text => text.includes('signalLabPlugin') ? text : "import { signalLabPlugin } from './server/signal-lab/signal-vite.js';\n" + replace(text, /(plugins:\s*\[)/, '$1signalLabPlugin(), ', 'Vite plugins'));
await edit('server/entry.ts', text => text.includes('attachSignalRoutes') ? text : "import { attachSignalRoutes } from './signal-lab/signal-routes.js';\n" + replace(text, /(const app = createChatfuelServer\([\s\S]*?\n\}\);)/, "$1\nattachSignalRoutes(app.server, process.env, process.env.BASE_PATH || '');", 'production server'));
await edit('vercel.json', text => {
  /** @type {{rewrites: {source: string, destination: string}[], functions?: Record<string, {maxDuration: number}>, headers: {source: string, headers: {key: string, value: string}[]}[]}} */
  const config = JSON.parse(text);
  config.rewrites = [{ source: '/chatfuel/signal/:signalAction', destination: '/api/signal' }, ...config.rewrites.filter(rule => rule.source !== '/chatfuel/signal/:signalAction')];
  config.functions = { ...config.functions, 'api/signal.ts': { maxDuration: 120 } };
  for (const rule of config.headers || []) {
    if (rule.source === '/(.*)') rule.source = '/((?!signal-lab/).*)';
  }
  if (!config.headers.some(rule => rule.source === '/signal-lab/(.*)')) config.headers.push({ source: '/signal-lab/(.*)', headers: [
    { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
  ] });
  return JSON.stringify(config, null, 2) + '\n';
});
for (const [file, text] of changes) await writeFile(file, text);
console.log('Signal Lab registered for Vite, Node and Vercel. Demo needs no keys. Follow playbook.md for optional live setup.');
