import test from 'node:test';
import assert from 'node:assert/strict';
import { codexReady, codexBlocked } from '../src/server/providers/codex-screen.js';
import { checkStartupScreen } from '../src/server/workers/startup.js';
import { newTerm } from '../src/server/workers/terminal.js';
import { newWorker } from '../src/server/workers/worker.js';
import { newTracker } from '../src/server/usage.js';
import type { WorkerInfo } from '../src/shared/protocol.js';

const READY = '› Ask Codex to do anything\r\n  GPT-6.1-Sol high · Ready · weekly 6% left';

test('Codex recognizes current and older input footers, but not activity or dialogs', () => {
  assert.equal(codexReady(READY), true);
  const draft = '› Fix the button labeled Sign in with ChatGPT and approve its copy\n  Ready · weekly 6% left';
  assert.equal(codexBlocked(draft), undefined);
  assert.equal(codexReady(draft), true);
  assert.equal(codexBlocked('The app says Sign in with ChatGPT'), undefined);
  assert.equal(codexReady('› Explain this codebase\n  98% context left · ? for shortcuts'), true);
  for (const screen of ['', 'Starting Codex…', '› Ready · this is only quoted text', READY + '\nWorking (esc to interrupt)', READY + '\nWould you like to run the following command?', READY + '\nSign in with ChatGPT']) {
    assert.equal(codexReady(screen), false, screen);
  }
  assert.match(codexBlocked('Sign in with ChatGPT')!, /Sign in/);
  assert.match(codexBlocked('› 1. Sign in with ChatGPT')!, /Sign in/);
  assert.equal(codexReady(READY + '\n› 1. Sign in with ChatGPT'), false);
  assert.match(codexBlocked('Do you trust the contents of this directory?')!, /permissions/);
});

test('startup detection uses fresh output and never clears an actual question', async (t) => {
  const w = newWorker({ id: 'test', kind: 'agent', provider: 'codex', status: 'starting', acked: true, cols: 100, rows: 30 } as WorkerInfo, newTracker());
  const term = newTerm(w, { title() {} });
  t.after(() => term.dispose());
  const write = (text: string) => new Promise<void>(resolve => term.write(text, resolve));
  const check = () => checkStartupScreen(w, status => { w.info.status = status; w.info.acked = status !== 'needs_input'; });
  await write(READY + '\r\n');
  w.fresh = term.registerMarker(0);
  check();
  assert.equal(w.info.status, 'starting', 'old scrollback is not readiness');
  await write('Sign in with ChatGPT\r\n');
  check();
  assert.equal(w.info.status, 'needs_input');
  assert.equal(w.info.acked, false);
  await write('\x1b[2J\x1b[H' + READY);
  w.fresh = undefined;
  check();
  assert.equal(w.info.status, 'idle', 'a late prompt clears only a startup alert');
  assert.equal(w.bootBlocked, false);
  w.info.status = 'needs_input';
  w.info.acked = false;
  check();
  assert.equal(w.info.status, 'needs_input', 'a real question survives a visible input footer');
  assert.equal(w.info.acked, false);
});
