# MochiNote product definition

## Purpose

MochiNote is a calm, local-first browser companion for capturing notes and lightweight tasks without leaving the current browsing context.

## Target surfaces

- Chrome/Edge Manifest V3 side panel: main application.
- Toolbar popup: direct creation of a new Sticky using the shared editor.
- Background service worker: browser events, reminders, and notifications.

## MVP outcomes

Users can:

- create, edit, search, pin, color, and organize notes;
- manage folders and lightweight dated tasks;
- create checklists and basic rich text;
- save the active page URL, title, and selected text as a text-only note;
- schedule browser-local reminders;
- retain data offline across extension restarts;
- import and export their local data.

## Product rules

- Local-first and usable without an account.
- Chrome/Edge first; cross-browser packaging must not compromise the initial experience.
- ZIP builds keep a stable extension identity so extension-scoped local data remains available when users update an unpacked installation.
- Free accounts can sync up to 5 MiB of Supabase cloud data. Local IndexedDB data, signed-out use, reads, export, deletion, and updates that reduce cloud usage remain available when the cloud quota is full.
- Use the narrowest browser permissions possible.
- Task entities and note checklists are separate concepts.
- Reminder delivery is best effort while the browser/device can process alarms, not calendar-grade guaranteed delivery.
- Media and file attachments, visible-viewport capture, and full-page capture are out of scope.

## Post-release outcomes

- Sticky is the single notes surface: its pastel card grid opens the full note editor and detail workflows, while the redundant Notes tab is removed.
- Users can label notes with local tags and include those tags in note search and filters.
- Tags are stored with the note and preserved by validated JSON backup and restore.
- Deleted notes move to a recoverable local trash; reminders remain intact until permanent deletion.
- Folders open as navigable content views that group their direct child folders, tasks, and active Sticky notes, with contained items linking back to their canonical workflows.
- Task planning starts with Today and allows manual navigation from six months before through six months after Today. The seven-day rail keeps its current range for visible selections and recenters only when a selected date falls outside it. The entire header date control opens an anchored native date picker without clearing the selection. Past tasks remain durable rather than being deleted automatically. Incomplete past tasks roll forward into Today with their original due date visibly marked overdue; when completed from Today, they remain in Today below active work so users can see which overdue work they finished that day.
- Daily, weekly, and monthly task series project occurrences onto every matching future date. Each occurrence stores completion independently, and completing one occurrence never creates duplicate task entities.
- Operation-status messages dismiss automatically after five seconds across Tasks, Folders, Sticky detail, and notification navigation.
- Task reminders are derived from the task deadline: users choose whether to notify at the deadline or before it, while task recurrence automatically drives the reminder recurrence.
- Task reminders are derived from the task deadline: users choose whether to notify at the deadline or before it, while task recurrence automatically drives the reminder recurrence.
- Sticky creation and editing can import a pasted multiline block as checklist items, using each non-empty line as one item.
- Pressing Enter while editing a checklist item creates and focuses the next checklist row.

## Deferred scope

Cloud sync, collaboration, full-page capture, continuous background voice recording, focus timer analytics, and Firefox release are post-MVP.
