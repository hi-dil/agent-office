import { IMAGE_BODY_LIMIT, saveTerminalImage } from '../../terminal-images.js';
import { readBody, sameOrigin, send } from '../util.js';
import type { Route } from '../router.js';

export const terminalImageRoute = {
  path: '/api/terminal/image', auth: 'session',
  async handle(ctx, { req, res, url }) {
    const { cfg } = ctx;
    const floor = ctx.floors.get(url.searchParams.get('floor') ?? '');
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!sameOrigin(req, cfg)) return send(res, 403, { error: 'Forbidden' });
    if (!floor || !floor.workers.get(url.searchParams.get('worker') ?? '')) return send(res, 404, { error: 'No such worker' });
    if (Number(req.headers['content-length']) > IMAGE_BODY_LIMIT) return send(res, 413, { error: 'Images must be under 10 MB' }, { connection: 'close' });
    let body: unknown;
    try { body = JSON.parse(await readBody(req, IMAGE_BODY_LIMIT)); }
    catch { return send(res, 400, { error: 'Invalid image upload (maximum 10 MB)' }); }
    try {
      const file = await saveTerminalImage(floor.def.dir, body);
      return send(res, 200, { path: file }, { 'cache-control': 'no-store' });
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      return send(res, error.code ? 500 : 400, { error: error.code ? 'Could not save the image' : error.message });
    }
  },
} satisfies Route;
