# Architecture

## Technology baseline

- WXT, React, and TypeScript.
- Manifest V3.
- Feature-oriented React modules with direct imports; no broad barrel files.
- CSS custom properties for tokens plus scoped component styles.
- IndexedDB behind a repository interface; `chrome.storage.sync` only for small settings.
- Service worker is event-driven and does not own durable in-memory state.

## Entrypoints

```text
entrypoints/
  sidepanel/       main application
  popup/           shared new-Sticky editor
  background.ts    alarms, notifications, menus, browser messages
```

The side-panel shell exposes three primary tabs: Tasks, Sticky, and Folders. Sticky owns the canonical note list and composes the shared full editor/detail workflow; there is no parallel Notes route or second note state owner.

Folders are aggregate views over the existing repositories rather than separate content owners. Folder detail reads child folders, tasks, and active notes, then routes selected items to the canonical Tasks or Sticky surface.

## Source boundaries

```text
src/
  app/             providers, routing, shell composition
  components/      reusable code-native UI primitives
  features/        notes, folders, tasks, reminders, capture
  db/              schema, migrations, repositories
  browser/         typed wrappers around extension APIs
  styles/          tokens, reset, shared motion
  test/            fixtures and test utilities
```

Feature modules may depend on `components`, `db`, and `browser`; shared layers must not import feature UI.

## Data model

- `Folder`: id, name, color, icon, position, timestamps.
- `Note`: id, title, content JSON, plain-text search projection, folderId, tags, color, pattern, pinned, source metadata, deletedAt, timestamps.
- `Task`: id, title, due date/time, folderId, completedAt, recurrence rule/series id, completed occurrence dates, position, timestamps. Recurring tasks remain single durable series records; matching dated occurrences are projected in the task planning layer.
- `Reminder`: id, owner type/id, scheduledAt, timezone, repeat rule, enabled, plus optional task-reminder offset and monthly anchor metadata so notifications can follow task recurrence accurately.
- `Attachment`: legacy local records retained only for safe cleanup and backup compatibility; the note UI does not create or render attachments.
- `Settings`: theme, locale, layout, recent colors, schema version.

## Cross-context communication

UI entrypoints call typed browser adapters. The service worker receives explicit messages for alarm reconciliation, notifications, context-menu actions, and active-tab capture. Messages are versioned and validated at boundaries.

## Security and storage

- Default to `activeTab`; do not request `<all_urls>` for MVP.
- Sanitize pasted rich text and validate imported data.
- Bundle all executable code with the extension.
- Store blobs in IndexedDB, not sync storage.
- Add schema migrations before changing durable shapes.

## Quality gates

Each implementation task must typecheck and run its focused tests. Release additionally requires lint, unit tests, extension E2E, production build, responsive browser QA, accessibility checks, and visual fidelity review against the accepted image.
