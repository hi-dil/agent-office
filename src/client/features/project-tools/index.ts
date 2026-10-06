/** Local project integrations, installed alongside the upstream office features. */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { boardHint, onE } from '../../core/hint';
import { watchGitSummary } from '../../git-summary';
import { repoChoices } from '../../shared/hiring';
import { store } from '../../state';
import { openAsanaBoard } from '../../ui/asana';
import { openAsk } from '../../ui/ask';
import { toast } from '../../ui/dom';
import { openPlanLimits } from '../../ui/limits';
import { PlanLimitsTexture } from '../../world/plan-limits';
import { isAsleep } from '../../../shared/status';
import { LazygitBoardTexture } from './git-board';

declare module '../../world/types' {
  interface InteractKinds {
    lazygit: true;
    limits: true;
  }
}

export function installProjectTools(ctx: Ctx, parts: Pick<Parts, 'actions' | 'waiting'>) {
  const { net, office } = ctx;
  const limits = new PlanLimitsTexture();
  const git = new LazygitBoardTexture();
  for (const [mesh, texture] of [[office.boardMeshes.limits, limits.texture], [office.boardMeshes.lazygit, git.texture]] as const) {
    mesh.material = new THREE.MeshBasicMaterial({ map: texture });
  }
  const drawLimits = () => limits.render(store.limits);
  store.on('limits', drawLimits);
  drawLimits();
  setInterval(drawLimits, 30_000);
  watchGitSummary(state => git.render(state));
  ctx.interactions.define('limits', {
    reach: 10,
    hint: () => boardHint('📊 Weekly limits'),
    use: onE(() => openPlanLimits(net)),
  });
  ctx.interactions.define('lazygit', {
    reach: 7,
    hint: () => boardHint('🌿 Lazygit'),
    use: onE(() => net.send({ t: 'lazygit.open' })),
  });
  ctx.messages.on('lazygit.opened', msg => {
    if (store.floor === msg.floorId) parts.waiting.openWorkerTerminal(msg.workerId);
  });
  ctx.hud.addActions([
    { id: 'asana', icon: '🔴', label: 'Asana tasks', section: 'Open', shown: () => !!store.project, run: () => {
      const floor = store.floor;
      openAsanaBoard({
        assign: (prompt, title, stillValid) => {
          if (store.floor !== floor) return;
          const desk = parts.actions.firstFreeSeat();
          const awake = [...store.workers.values()].filter(w => w.kind === 'agent' && !isAsleep(w.status));
          if (!desk && !awake.length) return toast('Every desk and bean bag is taken — send a worker home first', 'warn');
          openAsk({
            title: `Asana: ${title}`, initial: prompt,
            newDesk: desk ? ctx.plan().byId.get(desk)?.label : undefined,
            workers: awake.map(w => ({ id: w.id, name: w.name, color: w.color, status: w.status })),
            worktreeOption: !!store.project?.branch, providerOption: true, repoOptions: repoChoices(),
            onSubmit: (text, to, worktree, provider, model, effort, repos) => {
              if (store.floor !== floor || !stillValid()) return toast('The Asana connection or task changed. Reopen the task before sending it.', 'warn');
              if (to) net.send({ t: 'worker.prompt', workerId: to, prompt: text });
              else if (desk) parts.actions.hire(desk, text, worktree, provider, model, effort, undefined, repos);
            },
          });
        },
        queue: (prompt, title, provider, model, effort) => { if (store.floor === floor) net.send({ t: 'queue.add', prompt, title, provider, model, effort }); },
      });
    } },
    { id: 'lazygit', icon: '🌿', label: 'Lazygit', section: 'Open', shown: () => !!store.project, title: () => 'Shared Git terminal for this project', run: () => net.send({ t: 'lazygit.open' }) },
  ]);
}
