import { useEffect, useRef } from 'react';
import type { ModuleAppProps } from '../types';
import { readInboxSample } from './inbox';

export const SignalLabApp = ({ client, botId }: ModuleAppProps) => {
  const iframe = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let active = true;
    let importing = false;
    const listener = async (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || !('type' in data) || data.type !== 'signal:request' || !('id' in data) || typeof data.id !== 'string' || data.id.length > 100 || !('path' in data)) return;
      const target = event.source as Window;
      const reply = (value: { body?: unknown; error?: string }) => { if (active) target.postMessage({ type: 'signal:response', id: data.id, ...value }, event.origin); };
      try {
        if (data.path === 'inbox') {
          if (importing) throw new Error('Inbox import is already running.');
          importing = true;
          try { reply({ body: await readInboxSample(client, botId) }); } finally { importing = false; }
          return;
        }
        if (data.path !== 'status' && data.path !== 'analyze') throw new Error('Unknown request.');
        if (!client.proxyFetch) { if (data.path === 'status') { reply({ body: { live: false } }); return; } throw new Error('The host does not provide an authenticated proxy.'); }
        const body = 'body' in data && data.body && typeof data.body === 'object' ? data.body : {};
        const response = await client.proxyFetch(`/signal/${data.path}`, data.path === 'analyze' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, botId }) } : undefined);
        const value: unknown = await response.json();
        if (!response.ok) throw new Error(value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'SDK analysis is unavailable. Check the server configuration.');
        reply({ body: value });
      } catch (error) { reply({ error: error instanceof Error ? error.message : 'The request failed.' }); }
    };
    window.addEventListener('message', listener);
    return () => { active = false; window.removeEventListener('message', listener); };
  }, [client, botId]);
  return <iframe key={botId} ref={iframe} title="Signal Lab message classifier" src={`${import.meta.env.BASE_URL}signal-lab/index.html?sdk=1`} style={{ width: '100%', height: 'calc(100dvh - 58px)', minHeight: 600, border: 0, display: 'block' }} />;
};
