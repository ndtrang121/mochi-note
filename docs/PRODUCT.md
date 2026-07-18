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

## Deferred scope

Cloud sync, collaboration, full-page capture, continuous background voice recording, focus timer analytics, and Firefox release are post-MVP.
