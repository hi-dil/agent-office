import { asanaRequest } from '../../asana-http.js';
import { readBody, sameOrigin, send } from '../util.js';
import type { Route } from '../router.js';

export const asanaRoute = {
  path: ['/api/asana', '/api/asana/refresh'], auth: 'session',
  async handle(ctx, { req, res, url, path: p, session }) {
    const { cfg, meOf } = ctx;
    const floor = ctx.floors.get(url.searchParams.get('floor') ?? '');
    let body: unknown;
    if (req.method === 'POST' && p === '/api/asana') {
      if (!sameOrigin(req, cfg)) return send(res, 403, { error: 'Forbidden' });
      if (!meOf(session.account?.id).admin) return send(res, 403, { error: 'Only office admins can change the Asana connection.' });
      if (Number(req.headers['content-length']) > 8192) return send(res, 413, { error: 'Asana settings are too large (maximum 8 KB).' }, { connection: 'close' });
      try { body = JSON.parse(await readBody(req, 8192)); }
      catch { return send(res, 400, { error: 'Invalid Asana settings (maximum 8 KB).' }); }
    }
    const result = await asanaRequest(floor?.asana, {
      cached: url.searchParams.get('cached') === '1',
      method: req.method ?? '', admin: meOf(session.account?.id).admin,
      sameOrigin: sameOrigin(req, cfg), refresh: p === '/api/asana/refresh', body,
    });
    if (result.status < 300 && (req.method === 'DELETE' || (req.method === 'POST' && p === '/api/asana'))) void floor?.github.refresh();
    return send(res, result.status, result.body, { 'cache-control': 'no-store' });
  },
} satisfies Route;
