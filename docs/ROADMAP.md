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

## Definition of done

The project is complete only when REL-001 is committed, all release checks pass, core workflows are verified in a loaded Chromium extension, and the fidelity ledger shows no unresolved material deviation from `docs/DESIGN.md`.
