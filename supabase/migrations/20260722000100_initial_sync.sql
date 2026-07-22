create sequence if not exists public.sync_version_seq;

create or replace function public.apply_sync_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
    new.client_updated_at < old.client_updated_at
    or (new.client_updated_at = old.client_updated_at and new.device_id <= old.device_id)
  ) then
    return old;
  end if;

  new.sync_version := nextval('public.sync_version_seq');
  return new;
end;
$$;

create table if not exists public.folders (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  parent_id text,
  color text not null,
  icon text not null,
  position integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  client_updated_at timestamptz not null,
  device_id text not null,
  sync_version bigint not null default 0,
  deleted_at timestamptz,
  primary key (user_id, id),
  constraint folders_parent_fk foreign key (user_id, parent_id)
    references public.folders(user_id, id),
  constraint folders_position_check check (position >= 0)
);

create table if not exists public.notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  plain_text text not null,
  content jsonb not null default '{}'::jsonb,
  source jsonb,
  color text not null,
  pattern text not null,
  folder_id text,
  tags text[] not null default '{}',
  pinned boolean not null default false,
  favorite boolean not null default false,
  archived_at timestamptz,
  trashed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  client_updated_at timestamptz not null,
  device_id text not null,
  sync_version bigint not null default 0,
  deleted_at timestamptz,
  primary key (user_id, id),
  constraint notes_folder_fk foreign key (user_id, folder_id)
    references public.folders(user_id, id)
);

create table if not exists public.tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  due_date date,
  due_time time,
  folder_id text,
  position integer not null,
  completed_at timestamptz,
  completed_dates date[] not null default '{}',
  recurrence_series_id text,
  repeat_rule text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  client_updated_at timestamptz not null,
  device_id text not null,
  sync_version bigint not null default 0,
  deleted_at timestamptz,
  primary key (user_id, id),
  constraint tasks_folder_fk foreign key (user_id, folder_id)
    references public.folders(user_id, id),
  constraint tasks_repeat_rule_check check (repeat_rule is null or repeat_rule in ('FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY'))
);

create table if not exists public.reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  owner_type text not null,
  owner_id text not null,
  scheduled_at timestamptz not null,
  timezone text not null,
  repeat_rule text,
  offset_minutes integer,
  recurrence_anchor_day integer,
  recurrence_due_time time,
  enabled boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  client_updated_at timestamptz not null,
  device_id text not null,
  sync_version bigint not null default 0,
  deleted_at timestamptz,
  primary key (user_id, id),
  constraint reminders_owner_type_check check (owner_type in ('note', 'task'))
);

create table if not exists public.app_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null default 'app',
  layout text not null,
  locale text not null,
  recent_colors text[] not null default '{}',
  theme text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  client_updated_at timestamptz not null,
  device_id text not null,
  sync_version bigint not null default 0,
  deleted_at timestamptz,
  primary key (user_id, id),
  constraint app_settings_id_check check (id = 'app'),
  constraint app_settings_layout_check check (layout in ('grid', 'list')),
  constraint app_settings_locale_check check (locale in ('en', 'vi')),
  constraint app_settings_theme_check check (theme in ('dark', 'light', 'system'))
);

create index if not exists folders_sync_cursor_idx on public.folders(user_id, sync_version);
create index if not exists notes_sync_cursor_idx on public.notes(user_id, sync_version);
create index if not exists notes_folder_idx on public.notes(user_id, folder_id);
create index if not exists notes_updated_idx on public.notes(user_id, updated_at desc);
create index if not exists tasks_sync_cursor_idx on public.tasks(user_id, sync_version);
create index if not exists tasks_date_idx on public.tasks(user_id, due_date, position);
create index if not exists reminders_sync_cursor_idx on public.reminders(user_id, sync_version);
create index if not exists reminders_owner_idx on public.reminders(user_id, owner_type, owner_id);
create index if not exists settings_sync_cursor_idx on public.app_settings(user_id, sync_version);

do $$
declare table_name text;
begin
  foreach table_name in array array['folders', 'notes', 'tasks', 'reminders', 'app_settings'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_sync_metadata', table_name);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.apply_sync_metadata()', table_name || '_sync_metadata', table_name);
  end loop;
end;
$$;

alter table public.folders enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.app_settings enable row level security;

alter table public.folders force row level security;
alter table public.notes force row level security;
alter table public.tasks force row level security;
alter table public.reminders force row level security;
alter table public.app_settings force row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['folders', 'notes', 'tasks', 'reminders', 'app_settings'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_user_access', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name || '_user_access', table_name
    );
  end loop;
end;
$$;

grant select, insert, update, delete on public.folders, public.notes, public.tasks, public.reminders, public.app_settings to authenticated;
revoke all on public.folders, public.notes, public.tasks, public.reminders, public.app_settings from anon;
