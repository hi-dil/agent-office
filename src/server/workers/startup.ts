// Startup evidence belongs to the current terminal run; old scrollback is never a readiness signal.
import type { WorkerStatus } from '../../shared/protocol.js';
import { providerAdapter } from '../providers/index.js';
import { screenText } from './terminal.js';
import type { Worker } from './types.js';

export function checkStartupScreen(w: Worker, setStatus: (status: WorkerStatus) => void) {
  const screen = w.info.kind === 'agent' ? providerAdapter(w.info.provider)?.screen : undefined;
  if (!w.term || !screen) return;
  const status = w.info.status;
  if (status !== 'starting' && status !== 'idle' && !(w.bootBlocked && status === 'needs_input')) return;
  const text = screenText(w.term, w.term.buffer.active.type === 'normal' ? Math.max(0, w.fresh?.line ?? 0) : 0);
  const blocked = screen.blocked?.(text, status === 'starting' || !!w.bootBlocked);
  if (blocked) {
    w.bootBlocked = true;
    w.info.activity = blocked;
    setStatus('needs_input');
  } else if (screen.ready ? screen.ready(text) : w.bootBlocked && status === 'needs_input') {
    w.bootBlocked = false;
    w.info.activity = undefined;
    setStatus('idle');
  }
}
