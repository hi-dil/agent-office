import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import os from 'node:os';
import type {ProviderPlanLimits, PlanWindow} from '../shared/protocol.js';

/** Uses the window's reported duration: a weekly window can be primary or secondary. */
export function parseCodexLimits(answer: any, now = Date.now()): ProviderPlanLimits {
  const bucket = answer?.rateLimitsByLimitId?.codex ?? answer?.rateLimits;
  const windows: PlanWindow[] = [];
  for (const key of ['primary', 'secondary']) {
    const w = bucket?.[key];
    if (!w || typeof w.usedPercent !== 'number' || !Number.isFinite(w.usedPercent)) continue;
    const minutes = w.windowDurationMins;
    const label = minutes === 10080 ? 'Week' : minutes === 300 ? '5h session' : typeof minutes === 'number' && minutes > 0 ? `${minutes}m window` : key === 'primary' ? 'Primary' : 'Secondary';
    windows.push({label, pct: Math.max(0, Math.min(100, w.usedPercent)), resetsAt: typeof w.resetsAt === 'number' && Number.isFinite(w.resetsAt) ? w.resetsAt * 1000 : undefined});
  }
  return {plan: typeof bucket?.planType === 'string' ? bucket.planType.slice(0, 32) : undefined, windows, at: now};
}

/** Reads account metadata only. No thread, prompt, or model turn is created. */
export class CodexLimitsReader {
  private value: ProviderPlanLimits = {windows: [], at: 0};
  private timer?: NodeJS.Timeout;
  private child?: ChildProcessWithoutNullStreams;
  private closed = false;
  private lastRead = 0;
  constructor(private command: string | null, private env: Record<string,string>, private wanted: () => boolean, private onChange: () => void) { this.schedule(0); }
  get state(): ProviderPlanLimits { return this.command ? this.value : {...this.value, error: 'Codex is not installed'}; }
  refresh() { if (!this.child && Date.now() - this.lastRead > 20_000) this.schedule(0); }
  close() { this.closed = true; clearTimeout(this.timer); this.child?.kill(); }
  private schedule(ms: number) {
    if (this.closed || !this.command) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.read(), ms);
    this.timer.unref();
  }
  private read() {
    if (!this.wanted()) return this.schedule(120_000);
    const child = spawn(this.command!, ['app-server', '--listen', 'stdio://'], {cwd: os.tmpdir(), env: this.env, stdio: 'pipe'});
    this.child = child;
    let buffer = '', done = false;
    const finish = (answer?: unknown) => {
      if (done) return;
      done = true; clearTimeout(timeout);
      this.child = undefined; this.lastRead = Date.now();
      child.stdin.end(); child.kill();
      setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 3000).unref();
      if (this.closed) return;
      this.value = answer ? parseCodexLimits(answer) : {...this.value, error: 'Could not read Codex limits; check Codex sign-in on the server'};
      this.onChange(); this.schedule(answer ? 120_000 : 300_000);
    };
    const timeout = setTimeout(() => finish(), 15_000);
    const send = (message: unknown) => { if (!done) child.stdin.write(JSON.stringify(message) + '\n'); };
    child.on('error', () => finish()); child.on('exit', () => finish());
    child.stdin.on('error', () => finish());
    child.stderr.resume();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (text: string) => {
      buffer += text;
      if (buffer.length > 1024 * 1024) return finish();
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let message: any;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1) {
          if (message.error) return finish();
          send({method:'initialized',params:{}});
          send({id:2,method:'account/rateLimits/read',params:{}});
        } else if (message.id === 2) finish(message.error ? undefined : message.result);
      }
    });
    send({id:1,method:'initialize',params:{clientInfo:{name:'agent-office-usage',version:'0.1.0'}}});
  }
}
