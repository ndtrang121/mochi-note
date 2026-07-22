# Accepted design specification

## Reference

Accepted source image:

`C:\Users\Admin\Downloads\Telegram Desktop\ChatGPT Image Jul 18, 2026, 07_13_51 PM.png`

The image is the visual source of truth. It shows five tall primary screens and four compact popup/modal states for MochiNote.

## Surface mapping

- Tall Tasks, Folders, Sticky, editor, and note-detail screens map to the side panel.
- The compact bottom-left launcher maps to the toolbar popup, which opens directly into the shared new-Sticky editor.
- Search, filter, color picker, and save feedback map to overlays inside their owning surface.

## Design tokens

Initial values are implementation targets and must be refined during screenshot comparison.

| Token | Target |
| --- | --- |
| Canvas | `#fffdf9` warm near-white |
| Surface | `#ffffff` |
| Primary | `#ff8a00` orange |
| Primary dark | `#c96800` |
| Text | `#3c291f` cocoa |
| Muted text | `#8f8077` |
| Border | `#eee4d8` |
| Shadow | warm, low-opacity, soft 8-24px blur |
| Radius small/medium/large | `10px / 14px / 20px` |
| Spacing | `4 / 8 / 12 / 16 / 20 / 24 / 32px` |
| Motion | `140ms` controls, `220ms` panels |

Pastel note families: yellow, peach, blush, lilac, powder blue, and sage. Patterns remain subtle enough to preserve text contrast.

## Typography

- Rounded sans-serif character; use a bundled or locally served font with system fallback.
- UI labels: 12-13px, 500-600 weight.
- Body: 14px, 400-500 weight, 1.45-1.6 line height.
- Screen title: 15-17px, 650-700 weight.
- Note title: 18-22px, 700 weight.
- Do not rely on browser-default control typography.

## Component families

- App header with back/brand, primary action, and overflow actions.
- Three-item bottom navigation (Tasks, Sticky, Folders) with orange selected state.
- Circular floating add button with elevated orange fill.
- Task rows with completion ring, metadata, chips, and overflow menu.
- Folder rows/cards with pastel icon block, count, and drag/overflow action.
- Sticky cards with optional tape, pattern, fold, pin indicator, and relative timestamp.
- Editor toolbar, color swatches, metadata toolbar, pattern picker, and reminder control.
- Compact new-Sticky editor, search/filter sheet, toast, and confirmation dialog.

## Responsive rules

- Design baseline: 360-400px side-panel width.
- Support 320-480px without horizontal scrolling.
- Sticky grid uses two columns when each card remains at least 148px; otherwise one column.
- Sticky cards use uniform rows, top-aligned titles, clamped previews, and a reserved footer zone so tags and metadata never overlap note content.
- The task date rail contains seven days. It starts centered on Today and keeps its current range while the selected date remains visible; selecting a date outside that range recenters the rail with three days before and three days after. Today receives its explicit label whenever it is visible. The header uses an anchored native date picker without a clear action for planning beyond the visible rail. Overdue tasks use a distinct danger-tinted label, while completed tasks sort below active work without an extra section title.
- Primary Tasks, Sticky, and Folders screens keep their chrome fixed within the side panel; only the corresponding task, note, or folder list scrolls. Task creation and editing use a modal layer rather than expanding the primary screen.
- Task forms present deadline date and time as a visually grouped pair. Task reminder controls show only the lead time because the notification inherits the task's deadline and recurrence.
- Bottom navigation and primary editor actions remain visible while content scrolls.
- Bottom-navigation items divide the available width evenly with no reserved empty column.
- Dark theme keeps body text at a minimum 4.5:1 contrast ratio, including labels and values inside summary cards.
- Popup, primary screens, editors, detail views, forms, overlays, settings, and backup surfaces share the persisted theme and semantic surface tokens.
- Use at least 40px interactive targets, visible focus rings, keyboard navigation, and reduced-motion support.

## Visible copy inventory

Preserve the reference labels where the corresponding UI is implemented: `Nhiệm vụ hôm nay`, `Quản lý thư mục`, `Ghi chú Sticker`, `Ghi chú mới`, `Chi tiết ghi chú`, `Tasks`, `Folders`, `Sticky`, `Nhắc nhở`, `Ghim`, `Thư mục`, `Thêm`, `Sao chép`, `Chia sẻ`, and `Xóa`. The standalone `Notes` navigation label is intentionally omitted because Sticky is the unified notes surface.

## Fidelity gate

Final UI QA must compare the reference and browser screenshots using the same or closest practical viewport, record at least five concrete comparison points, and resolve all non-intentional differences before release.
## Editor enhancement refinement

The user-provided editor screenshot and the approved rich-editor concept refine only the note editor surface. Preserve the existing MochiNote shell while adding:

- functional selection-based bold, italic, underline, unordered list, ordered list, link, undo, and redo controls;
- a text-color palette with a native custom color picker;
- the six existing pastel Sticky presets plus a native custom background color picker;
- a compact grouped toolbar with high-contrast dark-mode icons and orange active states;
- backward-compatible rendering for existing plain-text/global-format notes and sanitized rich HTML for new edits.

Rich formatting and custom background colors remain inside the existing note-document JSON payload so local-first and Supabase sync contracts stay unchanged.
