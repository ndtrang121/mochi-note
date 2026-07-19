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
  popup/           quick capture
  background.ts    alarms, notifications, menus, browser messages
```

The side-panel shell exposes three primary tabs: Tasks, Folders, and Sticky. Sticky owns the canonical note list and composes the shared full editor/detail workflow; there is no parallel Notes route or second note state owner.

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
- `Note`: id, title, content JSON, plain-text search projection, folderId, tags, color, pattern, pinned, favorite, source metadata, deletedAt, timestamps.
- `Task`: id, title, due date/time, folderId, completedAt, position, timestamps.
- `Reminder`: id, owner type/id, scheduledAt, timezone, repeat rule, enabled.
- `Attachment`: id, noteId, kind, MIME type, blob, size, timestamps.
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
