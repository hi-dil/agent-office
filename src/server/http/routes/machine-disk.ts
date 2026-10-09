import { DiskSampler } from '../../disk.js';
import type { Route } from '../router.js';
import { send } from '../util.js';

const sampler = new DiskSampler();
export const machineDiskRoute = {
  path: '/api/machine-disk', auth: 'session',
  async handle(ctx, { req, res }) {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    return send(res, 200, { disk: await sampler.read(ctx.cfg.dataDir) }, { 'cache-control': 'no-store' });
  },
} satisfies Route;
