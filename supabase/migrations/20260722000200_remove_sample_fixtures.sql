-- Remove deterministic demo fixtures that older extension builds could upload.
-- These IDs were reserved for sample content and are not generated for user records.
delete from public.reminders
where id in ('reminder-client-meeting');

delete from public.notes
where id in (
  'note-month-plan',
  'note-content-ideas',
  'note-client-meeting',
  'note-shopping'
);

delete from public.tasks
where id in (
  'task-design-system',
  'task-team-meeting',
  'task-weekly-report',
  'task-evening-meditation',
  'task-water-plants'
);

delete from public.folders
where id in ('folder-work', 'folder-study', 'folder-personal', 'folder-ideas');
