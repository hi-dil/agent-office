# Asana board implementation plan

Spec: ../specs/2026-09-28-asana-board-design.md

1. Implement shared Asana types and server adapter with tests first.
   Files: src/shared/asana.ts, src/server/asana.ts, tests/asana.test.ts.
   Exports: parseAsanaProject(input): string | undefined; asanaTaskPrompt(task): string; AsanaBoard(dataDir, fetcher = fetch), state(), configure(project, token), refresh(force?), disconnect(). State contains configured/project/hasToken/items/fetchedAt/loading/error/truncated, never credentials.
   Tests: real temp files and HTTP fixtures at fetch boundary; URL forms, huge IDs, pagination, membership section, empty data, auth/rate errors, invalid replacement preserving state, stale refresh on disconnect/reconfigure, cache and bounds. Run node --import tsx --test tests/asana.test.ts RED then GREEN.
2. Connect authenticated HTTP endpoints to each Floor.
   Files: src/server/asana-http.ts, src/server/server.ts, src/server/floor.ts, tests/asana-http.test.ts.
   Export handler taking method/body/authorization context with board dependency, returning HTTP result. GET reads cached/refreshed state; POST configures (admin), DELETE disconnects (admin); POST /refresh available to members. Mutations require same origin. Test unauthorized, member/admin, malformed/oversized bodies, floor isolation and errors. Wire into server after session and floor lookup.
3. Add task board and worker/queue handoff UI.
   Files: src/client/ui/asana.ts, src/client/main.ts, src/client/style.css (actual stylesheet located during implementation), README.md.
   Reuse modal and board styles; accessible labels, empty/loading/error states, configuration form, task description text rendering, task assignment with editable prompt, queue task source URL. Stale task controls disabled on reconnect/floor switch. Browser smoke with fixture API verifies configure, task selection, handoff and disconnect; no real Asana writes or production worker prompts in tests.
4. Verify and review full change, then install it locally.
   Run npm test, npm run typecheck, npm run build, git diff --check. Fresh reviewer checks whole diff. Build artifacts for current local server, restart via SIGTERM preserving workers, prefill SHRM project without token. Verify HTTPS route, 4 existing worker IDs and live PTY PIDs survive, UI board available, auth protection and no token leaks. Real Asana fetch remains dependent on user supplying a token through the app.

Review focus: modern URL contains workspace/project/board IDs (select project); pagination cannot redirect credentials; failed or stale requests must not replace a newer connection; member cannot change token; queue and handoff preserve task description/link and current floor.
