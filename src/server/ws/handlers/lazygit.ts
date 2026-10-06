import type { ClientMsg } from '../../../shared/protocol.js';
import { openProjectLazygit } from '../../lazygit.js';
import { resolveCommand } from '../../workers.js';
import { here } from './common.js';
import type { HandlerMap } from './types.js';

export const lazygitHandlers = {
  'lazygit.open'(ctx, c) {
    const floor = here(ctx, c);
    if (!floor) return;
    if (!resolveCommand('lazygit')) {
      ctx.warn(c, 'Lazygit is not installed on the office server. Install lazygit and restart the office.');
      return;
    }
    const result = openProjectLazygit(floor.workers, c.peer.name, floor.plan.wing, c.accountId);
    if (typeof result === 'string') ctx.warn(c, result);
    else {
      ctx.sendTo(c, { t: 'worker.update', worker: result });
      ctx.sendTo(c, { t: 'lazygit.opened', floorId: floor.id, workerId: result.id });
    }
  },
} satisfies HandlerMap<Extract<ClientMsg, { t: 'lazygit.open' }>>;
