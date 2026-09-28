import type { AsanaBoard } from './asana.js';

interface Request {
  method: string;
  admin: boolean;
  sameOrigin: boolean;
  refresh?: boolean;
  body?: unknown;
}
interface Result { status: number; body: unknown }

/** Called only after the HTTP session has been authenticated. */
export async function asanaRequest(board: AsanaBoard | undefined, req: Request): Promise<Result> {
  const error = (status: number, error: string): Result => ({ status, body: { error } });
  if (!board) return error(404, 'No such floor');
  if (req.refresh ? req.method !== 'POST' : !['GET', 'POST', 'DELETE'].includes(req.method)) return error(405, 'Method not allowed');
  if (req.method !== 'GET' && !req.sameOrigin) return error(403, 'Forbidden');
  if (req.method !== 'GET' && !req.refresh && !req.admin) return error(403, 'Only office admins can change the Asana connection.');
  try {
    if (req.method === 'GET' || req.refresh) await board.refresh(!!req.refresh);
    else if (req.method === 'DELETE') board.disconnect();
    else {
      const body = req.body as { project?: unknown; token?: unknown } | null;
      if (!body || typeof body.project !== 'string' || body.project.length > 2048 || typeof body.token !== 'string' || body.token.length > 4096) return error(400, 'Enter a project URL and a personal access token.');
      await board.configure(body.project, body.token);
    }
    return { status: 200, body: board.state() };
  } catch (err) {
    // configure uses fixed, sanitized errors; filesystem failures must not disclose server details.
    return error(400, req.method === 'DELETE' ? 'Could not remove the saved Asana connection.' : (err as Error).message);
  }
}
