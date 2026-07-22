# Delivery roadmap

Tasks are ordered by dependency. Complete and commit one task before starting the next.

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

## Definition of done

The v0.1 release baseline is complete when REL-001 is committed, all release checks pass, core workflows are verified in a loaded Chromium extension, and the fidelity ledger shows no unresolved material deviation from `docs/DESIGN.md`. Post-release tasks are complete only when QA-002 is committed with all new workflows covered.
