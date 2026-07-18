# MochiNote fidelity ledger

Reference: `C:\Users\Admin\Downloads\Telegram Desktop\ChatGPT Image Jul 18, 2026, 07_13_51 PM.png`

QA run: 2026-07-19, Browser preview on `http://localhost:4173`, plus loaded Chromium extension E2E.

## Evidence

- Side panel screenshots: `C:\Users\Admin\AppData\Local\Temp\mochinote-fidelity-tasks-400.png`, `mochinote-fidelity-folders-400.png`, `mochinote-fidelity-sticky-400.png`, `mochinote-fidelity-notes-400.png`, `mochinote-fidelity-detail-400.png`, `mochinote-fidelity-editor-400.png`.
- Popup screenshot: `C:\Users\Admin\AppData\Local\Temp\mochinote-fidelity-popup-400.png`.
- Responsive screenshots: `C:\Users\Admin\AppData\Local\Temp\mochinote-fidelity-tasks-320.png`, `mochinote-fidelity-detail-320-final.png`.
- Browser DOM checks reported no horizontal overflow at 320px and 400px.
- Playwright loaded-extension E2E: 1 passed; axe audit covered popup, Tasks, Folders, Sticky, Notes, and the search sheet.

## Comparison points

| Reference evidence | Rendered evidence | Resolution |
| --- | --- | --- |
| Warm near-white canvas, cocoa typography, orange primary, pastel surfaces | All captured surfaces use the shared token system and Nunito; screenshots show the same warm visual language | Matched |
| Tasks screen has a seven-day rail, orange selected day, task rows, stats cards and orange FAB | `tasks-400` and `tasks-320` show all five elements with no clipping | Matched |
| Folders screen uses pastel folder rows, hierarchy affordance and bottom navigation | `folders-400` shows four pastel folder rows, nested-folder hint, add action and navigation | Matched; counts are local fixture data |
| Sticky screen uses a two-column pastel card grid with tape, patterns, chips and FAB | `sticky-400` shows the two-column grid, tape, pattern families, favorite/action affordances and FAB | Matched |
| Notes/editor/detail screens use search/filter, paper note, toolbar, metadata, reminder and action surfaces | `notes-400`, `editor-400`, and `detail-400` show the corresponding controls; E2E also audits the search sheet | Matched; captured-source card is an intentional MVP addition |
| Compact popup uses four quick-action tiles, recent rows and a “Xem tất cả” action | `popup-400` shows all four tiles, recent notes and launcher action; loaded E2E verifies persistence | Matched |
| Reference supports narrow side-panel layouts | `tasks-320` and `detail-320-final` have `scrollWidth === innerWidth` | Matched |

## Intentional deviations

- The selected date and primary CTA text use darker cocoa/orange combinations instead of white on bright orange where WCAG AA contrast required it. The orange selection surface remains intact.
- Local fixture counts and relative timestamps differ from the reference image because the app renders the current IndexedDB state.
- Reminder controls and captured-source metadata/screenshot preview are functional additions required by the product roadmap and are not shown in every reference state.

## QA outcome

No unresolved material visual deviation was found in the audited surfaces. REL-001 completed privacy/store documentation, store graphics, reproducible packaging, manifest inspection, and release hash verification. The context-menu capture contract is included in the loaded MV3 service worker build; its Chrome-owned menu placement does not alter product-surface fidelity.
