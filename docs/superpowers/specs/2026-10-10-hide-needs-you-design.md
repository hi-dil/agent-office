# Hide Needs you alerts

The user wants Needs you alerts hidden for every worker while their actual waiting statuses remain in the Workers panel.

The installed needsyou feature will stop creating the banner, screen flash, beacons, alarms and reminder timers. Its installation interface stays available to the composition root. The obsolete alarm setting will disappear, and desktop notifications for needs_input workers will be suppressed. Finished-worker notifications and manual worker navigation remain available. Worker statuses, terminal prompts and permission requests are preserved.

No server behavior, shared protocol or worker lifecycle changes are needed. A browser regression will exercise several workers entering needs_input, verify the absence of attention UI and notifications, and check that their Workers panel statuses and terminal-opening actions remain accurate. It will also verify that finished-worker desktop notifications still work.

Run typecheck, the full test suite, the production build and the browser regression with a screenshot. Ship on a branch from freshly fetched origin/main as a PR.
