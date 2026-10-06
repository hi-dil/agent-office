import { send } from '../util.js';
import type { Route } from '../router.js';

export const gitSummaryRoute = {
  path: '/api/git-summary', auth: 'session',
  async handle(ctx, { req, res, url }) {
    const floor = ctx.floors.get(url.searchParams.get('floor') ?? '');
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    if (!floor) return send(res, 404, { error: 'No such floor' });
    return send(res, 200, await floor.gitSummary.read(), { 'cache-control': 'no-store' });
  },
} satisfies Route;
