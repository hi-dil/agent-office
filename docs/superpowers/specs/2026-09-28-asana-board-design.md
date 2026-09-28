# Asana tasks on project floors

The user wants the SHRM Asana project visible in Agent Office and tasks handed to Codex workers. SHRM project: https://app.asana.com/1/1199167967865157/project/1217014847874353/board/1217015368847447.

Extend the existing board, prompt and queue flows. Add an Asana menu action on project floors. The board shows incomplete tasks grouped by Asana section, with assignee, due date, description and an Asana link. Task details offer editable worker handoff and queue handoff. Keep Asana unchanged; prompts explicitly require separate authorization for Asana writes.

Each floor owns a persisted connection in its ignored .agent-office/asana.json, permissions 0600. Admins configure a project URL/ID and a personal access token through a password field; blank token preserves an existing token. A project may be saved before a token is supplied. Responses never include the token. Disconnect removes credentials and cached tasks. Use only the fixed Asana API origin, deny redirects, bound pagination to 1000 tasks, and report partial results explicitly. Normalize IDs as strings, including modern and legacy Asana URLs.

Authenticated REST endpoints scoped by floor serve state, refresh, configure and disconnect. Configuration changes require admin and same-origin requests. Refresh and cached state are available to signed-in members. Requests coalesce and cache for 90 seconds; connection changes cannot be overwritten by stale requests. API errors have actionable, sanitized messages. No external writes, webhooks, OAuth, or new dependencies.

Reuse current board styling, modal lifecycle, sendToWorker and queue.add. Close the board when switching floors. Fetch only while open. Do not modify GitHub issue semantics. Verify API pagination, stale requests, failed replacement credentials, secrets, per-floor isolation, HTTP auth and browser flows. Deploy after checks while preserving existing PTY workers.
