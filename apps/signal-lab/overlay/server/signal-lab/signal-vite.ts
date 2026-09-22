import { loadEnv, type Plugin } from 'vite';
import { createSignalRoutes } from './signal-routes.js';

export const signalLabPlugin = (): Plugin => {
  let routes: ReturnType<typeof createSignalRoutes> | undefined;
  return {
    name: 'signal-lab',
    apply: 'serve',
    configResolved: config => { routes = createSignalRoutes({ ...loadEnv(config.mode, config.envDir, ''), ...process.env }, config.base); },
    configureServer: server => {
      server.middlewares.use((req, res, next) => { if (!routes?.handleRequest(req, res)) next(); });
      server.httpServer?.once('close', () => routes?.close());
    },
  };
};
