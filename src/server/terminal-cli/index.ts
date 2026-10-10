import { Office } from '../tunnel/office.js';
import { authenticate } from './auth.js';
import { attach } from './attach.js';
import { label, parseArgs, selectTerminal, type TerminalRow } from './options.js';

export async function terminalCommand(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: agent-office terminals [--floor <name-or-id>] [--json]
       agent-office attach <worker-id-or-name> [--floor <name-or-id>]

Options: --url <office-url> (default http://127.0.0.1:4600), --name <account>
Password: hidden prompt or AGENT_OFFICE_PASSWORD. URL: AGENT_OFFICE_URL.
Ctrl+] detaches without stopping the worker. Ctrl+C goes to the worker.
For a project shell in the browser, press B at an empty desk.`);
    return 0;
  }
  let office: Office | undefined;
  try {
    const opts = parseArgs(args);
    if (opts.command === 'attach' && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new Error('attach needs an interactive terminal. Over SSH, use ssh -t.');
    office = new Office(new URL(opts.url));
    await authenticate(office, opts.name);
    const response = await fetch(new URL('/api/terminals', opts.url), {
      headers: { Cookie: office.cookie() }, signal: AbortSignal.timeout(10_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Cannot list terminals (HTTP ${response.status}).`);
    const body = await response.json();
    if (!Array.isArray(body.terminals)) throw new Error('This office does not support terminal access yet. Update and restart it.');
    let rows: TerminalRow[] = body.terminals;
    if (opts.floor) {
      rows = rows.filter(r => r.floorId === opts.floor || r.floor === opts.floor);
      if (!rows.length) throw new Error(`No terminals on floor ${opts.floor}.`);
    }
    if (opts.command === 'terminals') {
      if (opts.json) console.log(JSON.stringify(rows, null, 2));
      else {
        console.log('ID\tPROJECT\tNAME\tTYPE\tSTATUS');
        for (const r of rows) console.log([r.id, r.floor, r.name, r.provider || r.kind || '', r.status || ''].map(label).join('\t'));
        if (!rows.length) console.log('No terminals. Open a shell with B at an empty desk, or hire an agent.');
      }
    } else {
      const row = selectTerminal(rows, opts.worker!);
      console.error(`Attaching to ${label(row.name)} (${label(row.floor)}). Ctrl+] detaches; Ctrl+C goes to the worker.`);
      await attach(office, row.id, opts.name || 'SSH terminal');
      console.error('Detached. The worker keeps running.');
    }
    return 0;
  } catch (error) {
    console.error(`agent-office: ${label(error instanceof Error ? error.message : String(error))}`);
    return 1;
  } finally { office?.close(); }
}
