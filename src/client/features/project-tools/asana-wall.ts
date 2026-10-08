import { store } from '../../state';
import { setIssueBoardSource } from '../../shared/issue-board';
import { onAsanaChanged } from '../../shared/asana-events';
import { AsanaWallState, asanaBoardMode } from './asana-state';
import { AsanaBoardCanvas } from './asana-board';

export function watchAsanaWall(open: () => void) {
  const texture = new AsanaBoardCanvas();
  const wall = new AsanaWallState(async (floor, signal) => {
    const response = await fetch(`/api/asana?${new URLSearchParams({ floor, cached: '1' })}`, { signal, cache: 'no-store' });
    if (!response.ok) throw Error('Could not load the Asana board');
    return response.json();
  }, () => {
    const state = wall.state;
    const mode = asanaBoardMode(state);
    if (mode === 'github') return setIssueBoardSource();
    if (mode === 'pending') {
      texture.render(state ?? { hasToken: false, items: [], fetchedAt: 0, loading: true, truncated: false });
      setIssueBoardSource({ title: state?.error ? 'Task board unavailable · E to retry' : 'Loading task board…', canvas: texture.canvas, count: 0, open: () => { void wall.load(store.floor, true); } });
      return;
    }
    texture.render(state!);
    setIssueBoardSource({ title: `Asana · ${state!.project!.name}`, canvas: texture.canvas, count: state!.items.length, open });
  });
  store.on('floor', () => void wall.load(store.floor));
  onAsanaChanged(() => void wall.load(store.floor, true));
  setInterval(() => { if (!document.hidden) void wall.load(store.floor); }, 30_000);
  void wall.load(store.floor);
}
