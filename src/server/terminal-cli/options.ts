export interface TerminalRow {
  id: string; name: string; floor: string; floorId: string;
  kind?: string; provider?: string; status?: string;
}
export function parseArgs(args: string[]) {
  const [command, ...rest] = args;
  if (command !== 'terminals' && command !== 'attach') throw new Error('Use terminals or attach.');
  let url = process.env.AGENT_OFFICE_URL || 'http://127.0.0.1:4600';
  let name: string | undefined, floor: string | undefined, worker: string | undefined;
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--json' && command === 'terminals') { json = true; continue; }
    if (['--url', '--name', '--floor'].includes(arg)) {
      const value = rest[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      if (arg === '--url') url = value;
      else if (arg === '--name') name = value;
      else floor = value;
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (command === 'attach' && !worker) worker = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (command === 'attach' && !worker) throw new Error('attach needs a worker ID or unique name (see terminals).');
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Office URL must use HTTP or HTTPS.');
  if (parsed.username || parsed.password) throw new Error('Do not put credentials in the URL.');
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Use the office origin without a path, query or fragment.');
  return { command, url: parsed.origin, name, floor, worker, json };
}
export function selectTerminal(rows: TerminalRow[], query: string): TerminalRow {
  const exact = rows.find(r => r.id === query);
  if (exact) return exact;
  const matches = rows.filter(r => r.name.toLowerCase() === query.toLowerCase());
  if (!matches.length) throw new Error(`No terminal matches ${query}. Run agent-office terminals.`);
  if (matches.length > 1) throw new Error(`Ambiguous terminal name: ${query}. Use its ID or --floor.`);
  return matches[0];
}
/** Names come from projects and workers; never let them inject terminal control sequences. */
export function label(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
}
