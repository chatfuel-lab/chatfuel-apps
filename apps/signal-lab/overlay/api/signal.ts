import type { IncomingMessage, ServerResponse } from 'node:http';
import { createSignalRoutes } from '../server/signal-lab/signal-routes.js';

const routes = createSignalRoutes(process.env);
export default (req: IncomingMessage, res: ServerResponse) => {
  if (!routes.handleRequest(req, res)) { res.statusCode = 404; res.end(); }
};
