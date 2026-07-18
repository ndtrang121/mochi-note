# MochiNote privacy

Last updated: 2026-07-19

MochiNote is a local-first browser companion. It does not require an account, does not send note/task data to a MochiNote server, and does not include analytics or advertising code.

## Data stored locally

Notes, folders, tasks, reminders, settings, and visible-viewport capture images are stored in the browser's IndexedDB database named `mochi-note`. Data remains on the device until the user deletes it or removes the extension. Clipboard and share actions are initiated only by the user.

When a user captures a page, MochiNote stores the page title, URL, capture time, optional selected text, and (for “Chụp trang”) the visible viewport image. Full-page capture is not requested or performed.

## Permissions

- `activeTab`: read the current tab's title/URL and capture its visible viewport only after a user invokes MochiNote.
- `contextMenus`: expose the user-invoked “Lưu trang vào MochiNote” menu item.
- `alarms`: wake the service worker for browser-local reminders.
- `notifications`: deliver reminder and capture confirmation notifications locally.
- `sidePanel`: provide the main MochiNote surface.
- `storage`: reserved for small extension settings; durable note data stays in IndexedDB.

MochiNote does not request `<all_urls>`, browsing history, bookmarks, cookies, downloads, or remote code execution permissions.

## Reminder delivery

Reminders are best effort. Chrome must be running and able to process alarms/notifications; MochiNote does not promise calendar-grade delivery. Repeating reminders are stored locally and advanced by the service worker after delivery.

## Data removal and contact

Users can delete individual notes, folders, tasks, and reminders in the app. Removing the extension removes its local storage according to the browser's extension-data policy. For privacy questions, contact the publisher through the store listing associated with this package.
