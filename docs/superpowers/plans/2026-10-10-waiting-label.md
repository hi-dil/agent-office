# Waiting labels implementation plan

> **For agentic workers:** Execute inline with superpowers:executing-plans; review the completed change once before shipping.

**Goal:** Replace visible “Needs you” wording with “Waiting” for every worker.

**Architecture:** Change presentation text in the existing worker badge, panel and navigation modules. Preserve worker state and the earlier alert suppression.

**Tech Stack:** TypeScript, three.js, DOM, Vite, Playwright.

- [x] Change existing waitingLabel expectations to `🙋 2 waiting · ✅ 1 done` and `🙋 1 waiting`. Enhance the existing browser check to require WAITING status pills, no Needs you tooltip, and both bubble and task-card canvas labels `🙋 WAITING`. Run both before implementation and confirm failures.
- [x] Change worker badge text and Workers panel pills to WAITING, shared DOM label to waiting, count to `${needs} waiting`, navigation/toast/cabinet/herald/map descriptions and the production HTML waiting-button tooltip to neutral waiting wording, and help to match disabled alerts. Update README and docs/features.md.
- [x] Run `npm run typecheck`, `npm test`, `npm run build`, `node tests/needsyou-browser.mjs` and `git diff --check`; inspect the screenshot and request final review.
- [x] Deploy verified dist/public files to the local office preserving old assets. Verify the served HTML and bundle.
- [x] Commit and push the reviewed change.
- [ ] Create the PR and return its URL; the existing GitHub connector previously returned HTTP 403 for PR creation.

Final review: corrected the production waiting-button tooltip; the browser check reads that button from index.html and failed before the tooltip fix. No behavior changes to workers or permissions.

Verification: typecheck passed; all 655 tests passed; production build and enhanced headless browser passed; screenshot inspected. Local deployment verified the served bundle and login HTML, health HTTP 200 and unchanged server PID; 248 old assets retained.
