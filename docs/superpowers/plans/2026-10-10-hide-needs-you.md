# Hide Needs you alerts implementation plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. Review the completed branch once before shipping.

**Goal:** Hide automatic Needs you alerts for all workers while preserving accurate waiting statuses.

**Architecture:** Keep the needsyou feature's installation interface, but install no attention UI or callbacks. Suppress needs_input desktop notifications in the shared notifier and remove the unused alarm control from Settings. Remove phone vibration from the 2D view and update its notification tooltip.

**Tech Stack:** TypeScript, DOM, three.js, Vite and Playwright.

## Task 1: Browser regression

- [x] Add `tests/needsyou-browser.mjs` with multiple workers transitioning to needs_input, using the real feature installer, Workers panel and desktop notifier.
- [x] Verify no banner/flash/beacons/alarm/desktop notifications appear, statuses and terminal actions remain, and done notifications still work.
- [x] Run `CHROME_PATH=/opt/google/chrome/chrome node tests/needsyou-browser.mjs` before implementation and confirm it fails because the current feature raises alerts.

## Task 2: Remove automatic attention alerts

- [x] Replace `src/client/features/needsyou/index.ts` with an inert installer retaining the existing `{ beacons }` interface and no runtime dependencies.

```typescript
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import type { Beacon } from './world';

export function installNeedsYou(_ctx: Ctx, _parts: Pick<Parts, 'views' | 'waiting'>) {
  return { beacons: new Map<string, Beacon>() };
}
```

- [x] In `src/client/notify.ts`, return immediately for needs_input, retain done notifications, and update the notification sample copy.
- [x] Remove the NeedsYouSound import, alarm row, alarm preview and alarm setting from `src/client/ui/settings.ts`. Update desktop notification and sound copy.
- [x] Remove input vibration and update the notification tooltip in `src/client/lite.ts`.
- [x] Update `README.md` and `docs/features.md` to describe quiet waiting statuses and completed-worker desktop notifications.
- [x] Run the browser regression again, require PASS, and inspect `/tmp/agent-office-no-needs-you.png`.

## Task 3: Verify and ship

- [x] Run `npm run typecheck`, `npm test`, `npm run build` and `git diff --check`; require successful exits and a green size guard.
- [x] Request a fresh review of the whole change and fix material findings.
- [ ] Commit, push `codex/hide-needs-you`, create the PR against `main`, and return its URL.
