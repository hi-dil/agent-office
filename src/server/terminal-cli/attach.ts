import WebSocket from 'ws';
import { ROOF } from '../../shared/rooftop.js';
import type { Office } from '../tunnel/office.js';

/** Join through the office, never its private PTY host. Closing this socket only detaches. */
export function attach(office: Office, workerId: string, name: string): Promise<void> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('attach needs an interactive terminal. Over SSH, use ssh -t.');
  const url = new URL('/ws', office.origin);
  url.protocol = office.secure ? 'wss:' : 'ws:';
  // Stay on the roof: entering a project floor would wake its sleeping agents.
  url.search = new URLSearchParams({ floor: ROOF, lite: '1', name }).toString();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { Cookie: office.cookie(), Origin: office.origin }, handshakeTimeout: 10_000 });
    let finished = false, ready = false, raw = false, alive = true;
    const wasRaw = !!stdin.isRaw;
    const oldEncoding = stdin.readableEncoding;
    const timeout = setTimeout(() => done(new Error('No terminal snapshot received. The worker may be stopped or gone.')), 10_000);
    const heartbeat = setInterval(() => {
      if (!alive) return done(new Error('Office connection lost. The agent was not stopped.'));
      alive = false;
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 15_000);
    const send = (msg: object) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
    const resize = () => send({ t: 'term.resize', workerId, cols: stdout.columns || 80, rows: stdout.rows || 24 });
    function done(error?: Error) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout); clearInterval(heartbeat);
      stdin.off('data', input); stdout.off('resize', resize);
      process.off('SIGTERM', interrupted); process.off('SIGINT', interrupted); process.off('SIGHUP', interrupted);
      if (raw) {
        stdin.setRawMode(wasRaw); stdin.pause(); stdin.setEncoding(oldEncoding ?? undefined);
        stdout.write('\x1b[?2004l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[0m\x1b[?25h\x1b[?1049l');
      }
      send({ t: 'worker.detach', workerId });
      ws.close();
      const closeTimer = setTimeout(() => ws.terminate(), 1000); closeTimer.unref();
      ws.once('close', () => clearTimeout(closeTimer));
      if (error) reject(error); else resolve();
    }
    function interrupted() { done(); }
    function input(chunk: string) {
      const at = chunk.indexOf('\x1d'); // Ctrl+] is consumed locally, never sent to the agent.
      const data = at < 0 ? chunk : chunk.slice(0, at);
      if (data) {
        send({ t: 'term.typing', workerId });
        // The server caps input at 64 KiB; avoid truncating large pastes.
        for (const part of inputChunks(data)) send({ t: 'term.input', workerId, data: part });
      }
      if (at >= 0) done();
    }
    process.on('SIGTERM', interrupted); process.on('SIGINT', interrupted); process.on('SIGHUP', interrupted);
    ws.on('pong', () => { alive = true; });
    ws.on('error', err => done(err));
    ws.on('close', () => done(new Error('Office connection closed. Run attach again to reconnect.')));
    ws.on('message', data => {
      if (finished) return;
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return done(new Error('Invalid office response.')); }
      if (msg.t === 'welcome') send({ t: 'worker.attach', workerId });
      if (msg.workerId !== workerId) return;
      if (msg.t === 'worker.remove') return done(new Error('The worker was removed.'));
      if (msg.t === 'term.snapshot') {
        if (!ready) {
          ready = true; clearTimeout(timeout);
          raw = true; stdin.setRawMode(true); stdin.setEncoding('utf8');
          stdout.write('\x1b[?1049h\x1b[2J\x1b[H');
          stdin.on('data', input); stdout.on('resize', resize); stdin.resume();
          resize();
        } else stdout.write('\x1b[2J\x1b[H');
        stdout.write(msg.data);
      } else if (msg.t === 'term.data' && ready) stdout.write(msg.data);
    });
  });
}

/** Keep Unicode code points intact when splitting a paste across separate PTY writes. */
export function* inputChunks(data: string): Generator<string> {
  let part = '';
  for (const char of data) {
    part += char;
    if (part.length >= 16000) { yield part; part = ''; }
  }
  if (part) yield part;
}
