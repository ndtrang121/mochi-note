# MochiNote product definition

## Purpose

MochiNote is a calm, local-first browser companion for capturing notes and lightweight tasks without leaving the current browsing context.

## Target surfaces

- Chrome/Edge Manifest V3 side panel: main application.
- Toolbar popup: quick capture and recent items only.
- Background service worker: browser events, reminders, and notifications.

## MVP outcomes

Users can:

- create, edit, search, pin, favorite, color, and organize notes;
- manage folders and lightweight dated tasks;
- create checklists and basic rich text;
- capture the active page URL/title and visible viewport;
- schedule browser-local reminders;
- retain data offline across extension restarts;
- import and export their local data.

## Product rules

- Local-first and usable without an account.
- Chrome/Edge first; cross-browser packaging must not compromise the initial experience.
- Use the narrowest browser permissions possible.
- Task entities and note checklists are separate concepts.
- Reminder delivery is best effort while the browser/device can process alarms, not calendar-grade guaranteed delivery.
- Visible-viewport capture is MVP; full-page capture is post-MVP.

## Post-release outcomes

- Sticky is the single notes surface: its pastel card grid opens the full note editor and detail workflows, while the redundant Notes tab is removed.
- Users can label notes with local tags and include those tags in note search and filters.
- Tags are stored with the note and preserved by validated JSON backup and restore.
- Deleted notes move to a recoverable local trash; attachments and reminders remain intact until permanent deletion.
- Folders open as navigable content views that group their direct child folders, tasks, and active Sticky notes, with contained items linking back to their canonical workflows.
- Task planning starts with Today and supports explicit future due dates. Incomplete past tasks roll forward into the Today view with their original due date preserved and visibly marked overdue; completed tasks remain at the bottom of each date list.
- Daily, weekly, and monthly task series project occurrences onto every matching future date. Each occurrence stores completion independently, and completing one occurrence never creates duplicate task entities.
- Operation-status messages dismiss automatically after five seconds across Tasks, Folders, Sticky detail, and notification navigation.

## Deferred scope

Cloud sync, collaboration, full-page capture, continuous background voice recording, focus timer analytics, and Firefox release are post-MVP.
