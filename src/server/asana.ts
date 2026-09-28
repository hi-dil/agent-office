import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseAsanaProject, type AsanaProject, type AsanaState, type AsanaTask } from '../shared/asana.js';

const API = 'https://app.asana.com/api/1.0/';
const CACHE_MS = 90_000;
const MAX_PAGES = 10;
interface Connection { project: string; token: string; name?: string }
class AsanaError extends Error {}
const text = (v: unknown, max = 200): string => typeof v === 'string' ? v.slice(0, max) : '';
const projectOf = (c: Connection): AsanaProject => ({ gid: c.project, name: c.name || 'Asana project', url: `https://app.asana.com/0/${c.project}/list` });
const empty = (): AsanaState => ({ hasToken: false, items: [], fetchedAt: 0, loading: false, truncated: false });
const message = (err: unknown) => err instanceof AsanaError ? err.message : 'Could not reach Asana. Check the connection and try again.';

/** A floor's read-only Asana board. Tokens are confined to its private connection file. */
export class AsanaBoard {
  private file: string;
  private connection?: Connection;
  private current: AsanaState = empty();
  private generation = 0;
  private pending?: Promise<void>;
  private retryAt = 0;

  constructor(dataDir: string, private fetcher: typeof fetch = fetch) {
    this.file = path.join(dataDir, 'asana.json');
    if (!existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8'));
      const project = typeof saved.project === 'string' ? parseAsanaProject(saved.project) : undefined;
      if (!project) throw new Error('Invalid project');
      this.connection = { project, token: text(saved.token, 4096), name: text(saved.name) };
      chmodSync(this.file, 0o600);
      this.current = { ...empty(), project: projectOf(this.connection), hasToken: !!this.connection.token };
    } catch {
      this.current.error = 'The saved Asana connection could not be read. Reconnect this floor.';
    }
  }

  state(): AsanaState { return this.current; }

  async configure(rawProject: string, rawToken: string): Promise<void> {
    const project = parseAsanaProject(rawProject);
    if (!project) throw new AsanaError('Enter an Asana project URL or numeric project ID.');
    if (rawToken.length > 4096 || /[\r\n]/.test(rawToken)) throw new AsanaError('Enter a valid personal access token.');
    const token = rawToken.trim() || this.connection?.token || '';
    const candidate: Connection = { project, token };
    const version = ++this.generation;
    this.pending = undefined;
    this.current = { ...this.current, loading: false };
    try {
      const loaded = token ? await this.load(candidate) : { ...empty(), project: projectOf(candidate) };
      if (version !== this.generation) throw new AsanaError('The Asana connection changed. Try again.');
      candidate.name = loaded.project?.name;
      // Write before replacing the working connection; failed credentials and disk errors preserve it.
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(candidate, null, 2), { mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, this.file);
      this.generation++;
      this.pending = undefined;
      this.connection = candidate;
      this.current = loaded;
      this.retryAt = 0;
    } catch (err) {
      if (err instanceof AsanaError) throw err;
      throw new AsanaError('Could not connect to Asana or save the connection. Check access and try again.');
    }
  }

  disconnect(): void {
    // If removal fails, keep showing the connection instead of claiming the secret was removed.
    rmSync(this.file, { force: true });
    this.generation++;
    this.pending = undefined;
    this.connection = undefined;
    this.current = empty();
    this.retryAt = 0;
  }

  refresh(force = false): Promise<void> {
    if (this.pending) return this.pending;
    if (!this.connection?.token || Date.now() < this.retryAt || (!force && Date.now() - this.current.fetchedAt < CACHE_MS)) return Promise.resolve();
    const version = this.generation;
    const connection = this.connection;
    this.current = { ...this.current, loading: true };
    const pending = this.load(connection).then(state => {
      if (version === this.generation) this.current = state;
    }).catch(err => {
      if (version === this.generation) {
        this.current = { ...this.current, error: message(err), loading: false };
        this.retryAt = Date.now() + CACHE_MS;
      }
    }).finally(() => { if (this.pending === pending) this.pending = undefined; });
    this.pending = pending;
    return pending;
  }

  private async get(endpoint: string, token: string, signal: AbortSignal): Promise<any> {
    const res = await this.fetcher(API + endpoint, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, redirect: 'error', signal });
    if (!res.ok) {
      await res.body?.cancel();
      const msg = res.status === 401 ? 'Asana rejected the token. Reconnect with a valid personal access token.'
        : res.status === 403 || res.status === 404 ? 'This token cannot access that Asana project. Check the project and permissions.'
        : res.status === 429 ? 'Asana rate limit reached. Wait 90 seconds before refreshing.'
        : 'Asana is unavailable. Try refreshing later.';
      throw new AsanaError(msg);
    }
    return res.json();
  }

  private async load(connection: Connection): Promise<AsanaState> {
    const { project, token } = connection;
    // One deadline bounds the entire paginated refresh, not each individual page.
    const signal = AbortSignal.timeout(20_000);
    const result = await this.get(`projects/${project}?opt_fields=name`, token, signal);
    if (result?.data?.gid !== project || typeof result.data.name !== 'string') throw new AsanaError('Asana returned an invalid project. Try reconnecting.');
    const info = { ...projectOf(connection), name: text(result.data.name) };
    const items: AsanaTask[] = [];
    const seen = new Set<string>();
    const offsets = new Set<string>();
    let offset: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ limit: '100', completed_since: 'now', opt_fields: 'gid,name,notes,completed,due_on,assignee.name,memberships.project.gid,memberships.section.name' });
      if (offset) params.set('offset', offset);
      const response = await this.get(`projects/${project}/tasks?${params}`, token, signal);
      if (!Array.isArray(response?.data)) throw new AsanaError('Asana returned an invalid task list. Try refreshing.');
      for (const raw of response.data.slice(0, 100)) {
        if (typeof raw?.gid !== 'string' || !/^[1-9]\d{0,39}$/.test(raw.gid) || typeof raw.name !== 'string' || raw.completed || seen.has(raw.gid)) continue;
        seen.add(raw.gid);
        const membership = Array.isArray(raw.memberships) ? raw.memberships.find((m: any) => m?.project?.gid === project) : undefined;
        items.push({ gid: raw.gid, name: text(raw.name, 1000), notes: text(raw.notes, 14000), url: `https://app.asana.com/0/${project}/${raw.gid}`, section: text(membership?.section?.name) || 'Unsectioned', assignee: text(raw.assignee?.name) || undefined, dueOn: /^\d{4}-\d{2}-\d{2}$/.test(raw.due_on) ? raw.due_on : undefined });
      }
      offset = typeof response.next_page?.offset === 'string' && response.next_page.offset.length <= 4096 ? response.next_page.offset : undefined;
      if (!offset) break;
      if (offsets.has(offset)) throw new AsanaError('Asana pagination stalled. Try refreshing.');
      offsets.add(offset);
    }
    return { project: info, hasToken: true, items, fetchedAt: Date.now(), loading: false, truncated: !!offset };
  }
}
