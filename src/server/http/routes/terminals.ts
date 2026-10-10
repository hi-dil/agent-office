import type { Ctx } from '../../office/context.js';
import type { TerminalRow } from '../../terminal-cli/options.js';
import { send } from '../util.js';
import type { Route } from '../router.js';

/** Listing must not join floors, wake workers or acknowledge their alerts. */
export function terminalList(ctx: Ctx): TerminalRow[] {
  return [...ctx.floors.values()].flatMap(floor => floor.workers.list().map(w => ({
    id: w.id, name: w.name, kind: w.kind, provider: w.provider, status: w.status,
    floor: floor.def.name, floorId: floor.id,
  })));
}
export const terminalsRoute = {
  method: 'GET', path: '/api/terminals', auth: 'session',
  handle: (ctx, { res }) => send(res, 200, { terminals: terminalList(ctx) }),
} satisfies Route;
