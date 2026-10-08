import type { AsanaState } from '../../../shared/asana';
import { wrap } from '../boards/world';

/** A read-only overview: the full board opens with E, with task details and handoff actions. */
export class AsanaBoardCanvas {
  readonly canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  constructor() {
    this.canvas.width = 1200; this.canvas.height = 600;
    this.g = this.canvas.getContext('2d')!;
  }
  render(state: AsanaState) {
    const g = this.g;
    g.fillStyle = '#d8a86a'; g.fillRect(0, 0, 1200, 600);
    g.textAlign = 'left'; g.fillStyle = '#28283f';
    g.font = '900 38px Nunito, system-ui';
    g.fillText(state.project ? 'Asana · ' + short(state.project.name, 43) : 'Issues · Checking task source', 30, 49);
    if (!state.hasToken || !state.items.length) {
      g.font = '800 30px Nunito, system-ui';
      g.fillText(!state.project ? state.error ? 'Could not reach the office — E to retry' : 'Loading task board…' : !state.hasToken ? 'Open the board to connect Asana' : state.loading ? 'Loading Asana tasks…' : state.error ? 'Could not load tasks — open the board to retry' : 'No incomplete tasks', 50, 260);
    } else {
      const sections = new Map<string, typeof state.items>();
      for (const task of state.items) {
        const tasks = sections.get(task.section) ?? [];
        tasks.push(task); sections.set(task.section, tasks);
      }
      [...sections].slice(0, 3).forEach(([section, tasks], col) => {
        const x = 30 + col * 390;
        g.fillStyle = '#28283f'; g.font = '800 24px Nunito, system-ui';
        g.fillText(short(section, 23) + ` (${tasks.length})`, x, 95);
        tasks.slice(0, 3).forEach((task, row) => {
          const y = 115 + row * 135;
          g.fillStyle = ['#fff7b0', '#ffd6e0', '#caffbf'][col];
          g.fillRect(x, y, 360, 120);
          g.fillStyle = '#28283f'; g.font = '800 23px Nunito, system-ui';
          wrap(g, task.name, 330, 2).forEach((line, n) => g.fillText(line, x + 14, y + 30 + n * 27));
          g.font = '600 18px Nunito, system-ui';
          g.fillText(short([task.assignee ?? 'Unassigned', task.dueOn].filter(Boolean).join(' · '), 35), x + 14, y + 99);
        });
      });
    }
    g.fillStyle = '#28283f'; g.font = '800 22px Nunito, system-ui';
    g.fillText(!state.project ? 'Waiting for this floor’s task source' : state.error ? 'Asana unavailable · showing saved tasks · E to retry' : `E  Open Asana board · ${state.items.length}${state.truncated ? '+' : ''} tasks · view details, hand to a worker or queue`, 30, 573);
  }
}
function short(text: string, max: number) { return text.length > max ? text.slice(0, max - 1) + '…' : text; }
