import type { AsanaState } from '../../../shared/asana';

/** Floor-scoped reads. A slow response from a previous floor can never replace the current board. */
export class AsanaWallState {
  floor: string | null = null;
  state?: AsanaState;
  private active?: AbortController;
  constructor(private read: (floor: string, signal: AbortSignal) => Promise<AsanaState>, private changed: () => void) {}

  async load(floor: string | null, force = false): Promise<void> {
    if (!force && floor === this.floor && this.active) return;
    this.active?.abort();
    if (floor !== this.floor) { this.floor = floor; this.state = undefined; this.changed(); }
    if (!floor) { this.active = undefined; return; }
    const request = new AbortController();
    this.active = request;
    const timeout = setTimeout(() => request.abort(), 12_000);
    try {
      const state = await this.read(floor, request.signal);
      if (this.active !== request || this.floor !== floor) return;
      this.state = state;
      this.changed();
    } catch (error) {
      if (this.active !== request || this.floor !== floor) return;
      this.state = { ...this.state, items: this.state?.items ?? [], hasToken: this.state?.hasToken ?? false,
        fetchedAt: this.state?.fetchedAt ?? 0, loading: false, truncated: this.state?.truncated ?? false,
        error: error instanceof Error ? error.message : 'Could not load Asana' };
      this.changed();
    } finally {
      clearTimeout(timeout);
      if (this.active === request) this.active = undefined;
    }
  }
}

/** A failed or pending metadata read must never masquerade as a confirmed GitHub floor. */
export function asanaBoardMode(state?: AsanaState): 'pending' | 'asana' | 'github' {
  return state?.project ? 'asana' : !state || state.error ? 'pending' : 'github';
}
