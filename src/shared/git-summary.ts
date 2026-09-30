export interface GitSummary {
  branch?: string;
  upstream?: string;
  changed: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
  ahead?: number;
  behind?: number;
  fetchedAt?: number;
  at: number;
  error?: string;
}
