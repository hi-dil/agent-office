import { DESK_BY_ID, deskBuilt } from '../shared/layout.js';
import { isAsleep } from '../shared/status.js';
import type { WorkerManager } from './workers.js';

/** One shared Git terminal per floor; it never sends commands to an agent's terminal. */
export function openProjectLazygit(workers: Pick<WorkerManager, 'list' | 'resume' | 'spawn'>, by: string, wing = 0, owner?: string) {
  const all = workers.list();
  const existing = all.find(w => w.kind === 'shell' && w.tool === 'lazygit');
  if (existing) {
    if (isAsleep(existing.status)) {
      const error = workers.resume(existing.id);
      if (error) return error;
    }
    return existing;
  }
  const desk = [...DESK_BY_ID.values()].find(d => !d.station && !d.room && deskBuilt(d, wing) && !all.some(w => w.deskId === d.id));
  if (!desk) return 'Lazygit needs a free desk. Send an unused worker home, then try again.';
  return workers.spawn(desk.id, by, undefined, false, 'shell', undefined, undefined, undefined, undefined, owner, [], undefined, 'lazygit');
}
