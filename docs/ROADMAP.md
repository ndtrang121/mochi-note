# Delivery roadmap

Tasks are ordered by dependency. Complete one task before starting the next. State and roadmap transitions ship in the same commit as the task implementation unless planning is itself the deliverable.

| ID | Outcome | Depends on | Planned commit |
| --- | --- | --- | --- |
| DOC-001 | Routed docs, state machine, validator, roadmap | — | `docs: define stateful development workflow` |
| FOUND-001 | WXT + React + TypeScript extension loads popup and side panel | DOC-001 | `chore: scaffold the extension application` |
| FOUND-002 | Lint, typecheck, unit test, build, and test utilities | FOUND-001 | `chore: add project quality gates` |
| UI-001 | Design tokens, fonts, icons, and reusable primitives | FOUND-002 | `feat: establish the MochiNote design system` |
| UI-002 | Responsive side-panel shell and four-tab navigation | UI-001 | `feat: build the side panel application shell` |
| UI-003 | Quick-capture toolbar popup | UI-001 | `feat: build the quick capture popup` |
| DATA-001 | IndexedDB schema, migrations, repositories, seed fixtures | FOUND-002 | `feat: add the local first data layer` |
| FEAT-001 | Sticky board and folder management | UI-002, DATA-001 | `feat: add sticky notes and folders` |
| FEAT-002 | Note editor and detail workflow | FEAT-001 | `feat: add note editing and details` |
| FEAT-003 | Dated task list and completion workflow | UI-002, DATA-001 | `feat: add task planning` |
| FEAT-004 | Search, filters, reminders, and notifications | FEAT-002, FEAT-003 | `feat: add search and reminders` |
| INT-001 | Active-page metadata, visible capture, and context menu | UI-003, DATA-001 | `feat: add browser capture integrations` |
| QA-001 | E2E, accessibility, responsive, and fidelity repairs | all features | `test: complete product quality verification` |
| REL-001 | Store assets, privacy docs, package verification | QA-001 | `chore: prepare the extension release` |

## Post-release roadmap

The release baseline remains stable. Follow-up features continue using the same routed-doc and one-task-per-commit workflow.

| ID | Outcome | Depends on | Planned commit |
| --- | --- | --- | --- |
| PLAN-002 | Define the post-release feature sequence and routed task state | REL-001 | `docs: define the post release roadmap` |
| FEAT-005 | Validated JSON backup, export, import preview, replace/merge restore, and rollback safety | PLAN-002 | `feat: add data portability` |
| FEAT-006 | Settings surface for theme, note layout, locale-ready preferences, and reset controls | FEAT-005 | `feat: add user preferences` |
| FEAT-007 | Local audio-note recording, playback, attachment lifecycle, and permission UX | FEAT-006 | `feat: add audio notes` |
| QA-002 | Regression E2E, accessibility, package-size and privacy audit for post-release features | FEAT-007 | `test: verify post release features` |
| UI-009 | Native inline task date picker and selected-date-centered seven-day rail | UI-008 | `feat: center task date navigation` |
| UI-010 | Whole-control native date picker and stable seven-day rail | UI-009 | `feat: stabilize task date rail` |
| FEAT-008 | Paste multiline text into Sticky creation and editing as checklist items | UI-010 | `feat: import sticky checklists from pasted text` |
| REL-002 | Stable manifest key for ZIP updates that preserve extension identity | FEAT-008 | `chore: stabilize unpacked extension identity` |
| STICKY-018 | Expanded popup sticky editor, crash-safe autosave, recent sticky navigation, and color-coded save state | REL-002 | `feat: make sticky editing resilient` |
| STICKY-019 | Wider popup, simplified save icon, and deterministic new/recent sticky editing | STICKY-018 | `fix: refine popup sticky navigation` |
| STICKY-020 | Force Chrome popup intrinsic width to the intended 800px | STICKY-019 | `fix: force popup intrinsic width` |
| UI-012 | Adopt the new mascot for compact branding and extension icons, plus the horizontal logo in the quick-note popup | STICKY-020 | `feat: update MochiNote brand logos` |
| DATA-002 | Start newly created local databases empty without automatic sample fixtures | UI-012 | `fix: start local database without sample data` |
| ACCOUNT-UI-REDESIGN-001 | Polished Supabase login card, account avatar entry point, sync status, and accurate on-device storage copy | DATA-002 | `feat: redesign account login experience` |
| DATA-OVERVIEW-001 | Live Settings summary for tasks, Sticky notes, and folders replaces obsolete storage and attachment usage UI | ACCOUNT-UI-REDESIGN-001 | `feat: replace storage usage with data overview` |
| UI-HEADER-DARK-001 | Dark-mode summary contrast, Sticky-first navigation, email-initial avatar, and shared primary headers | DATA-OVERVIEW-001 | `fix: unify primary headers and dark mode colors` |
| SYNC-LOOP-001 | Stable quick-note autosave and coalesced background-owned Supabase sync without duplicate request cycles | UI-HEADER-DARK-001 | `fix: prevent duplicate quick note sync cycles` |
| SYNC-SCOPE-001 | Mutation-scoped Supabase pulls and outbox-aware single-flight scheduling avoid unrelated and duplicate API calls | SYNC-LOOP-001 | `fix: scope Supabase sync to changed data` |
| SYNC-QUICK-001 | Single-request mutation acknowledgement and latest-edited Sticky restoration in quick capture | SYNC-SCOPE-001 | `fix: streamline quick note sync and resume` |
| SYNC-INTERVAL-001 | Five-minute background polling while preserving immediate foreground and mutation sync | SYNC-QUICK-001 | `fix: reduce background sync frequency` |
| REL-003 | Version 0.1.1 manifest/package metadata and verified Chrome release ZIP | SYNC-INTERVAL-001 | `chore: release version 0.1.1` |
| EDITOR-001 | Functional rich-text editing, text colors, custom Sticky colors, and polished note editor UX | REL-003 | `feat: upgrade the note editor` |
| PLAN-003 | Select and scope the next post-release task before implementation | EDITOR-001 | `docs: plan the next MochiNote iteration` |
| FIX-EDITOR-PORTABILITY-001 | Stable link insertion and working backup/export/import restore flows | EDITOR-001 | `fix: repair note links and data restore` |
| DEV-SUPABASE-LOCAL-001 | Provision and verify the existing local Supabase development workflow | PLAN-003 | `test: verify local Supabase setup` |
| PLAN-004 | Select and scope the next post-release task after local Supabase verification | DEV-SUPABASE-LOCAL-001 | `docs: plan the next MochiNote iteration` |
| DOC-SUPABASE-LOCAL-001 | README instructions for provisioning, verifying, using, and stopping the local Supabase environment | PLAN-004 | `docs: document local Supabase setup` |
| PLAN-005 | Select and scope the next post-release task after documenting local Supabase setup | DOC-SUPABASE-LOCAL-001 | `docs: plan the next MochiNote iteration` |
| UI-COLOR-FIDELITY-001 | Recalibrate semantic colors and pastel families from the accepted MochiNote promo reference | PLAN-005 | `fix: align MochiNote colors with the design` |
| PLAN-006 | Select and scope the next post-release task after color fidelity calibration | UI-COLOR-FIDELITY-001 | `docs: plan the next MochiNote iteration` |
| DOC-TEST-PROPORTIONAL-001 | Proportional task checks that avoid full-suite verification for low-risk documentation and style-only changes | PLAN-006 | `docs: right-size task verification` |
| DOC-WORKFLOW-COMMIT-001 | State and roadmap metadata ship with implementation instead of separate planning commits | DOC-TEST-PROPORTIONAL-001 | `docs: streamline development workflow` |
| FIX-SUPABASE-CONFIG-002 | Hosted Supabase URL and publishable key load reliably with readable configuration errors | DOC-WORKFLOW-COMMIT-001 | `fix: load Supabase production config` |
| FIX-SUPABASE-SEED-001 | Keep sample fixtures opt-in for local tests and prevent builds, startup, and production migrations from creating seed data | FIX-SUPABASE-CONFIG-002 | `fix: keep sample data out of production` |
| NEXT-003 | Ready placeholder to retarget when the next concrete task is requested | FIX-SUPABASE-SEED-001 | `chore: complete the next MochiNote task` |

## Definition of done

The v0.1 release baseline is complete when REL-001 is committed, all release checks pass, core workflows are verified in a loaded Chromium extension, and the fidelity ledger shows no unresolved material deviation from `docs/DESIGN.md`. Post-release tasks are complete only when QA-002 is committed with all new workflows covered.
