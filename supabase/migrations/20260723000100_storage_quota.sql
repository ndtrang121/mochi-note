create table if not exists public.subscription_plans (
  code text primary key,
  storage_limit_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_storage_limit_check check (storage_limit_bytes is null or storage_limit_bytes >= 0)
);

insert into public.subscription_plans (code, storage_limit_bytes)
values ('free', 5242880)
on conflict (code) do update
set storage_limit_bytes = excluded.storage_limit_bytes,
    updated_at = now();

create table if not exists public.user_plan_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null default 'free' references public.subscription_plans(code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_storage_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used_bytes bigint not null default 0,
  recalculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_storage_usage_used_bytes_check check (used_bytes >= 0)
);

alter table public.subscription_plans enable row level security;
alter table public.user_plan_entitlements enable row level security;
alter table public.user_storage_usage enable row level security;

alter table public.subscription_plans force row level security;
alter table public.user_plan_entitlements force row level security;
alter table public.user_storage_usage force row level security;

drop policy if exists subscription_plans_authenticated_read on public.subscription_plans;
create policy subscription_plans_authenticated_read
on public.subscription_plans
for select
to authenticated
using (true);

drop policy if exists user_plan_entitlements_owner_read on public.user_plan_entitlements;
create policy user_plan_entitlements_owner_read
on public.user_plan_entitlements
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists user_storage_usage_owner_read on public.user_storage_usage;
create policy user_storage_usage_owner_read
on public.user_storage_usage
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.subscription_plans, public.user_plan_entitlements, public.user_storage_usage from anon, authenticated;
grant select on public.subscription_plans, public.user_plan_entitlements, public.user_storage_usage to authenticated;
grant select, insert, update, delete on public.subscription_plans, public.user_plan_entitlements, public.user_storage_usage to service_role;

create or replace function public.ensure_free_storage_entitlement(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_plan_entitlements (user_id, plan_code)
  values (target_user_id, 'free')
  on conflict (user_id) do nothing;

  insert into public.user_storage_usage (user_id, used_bytes)
  values (target_user_id, 0)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.cloud_storage_payload_bytes(payload jsonb, is_deleted boolean)
returns bigint
language sql
immutable
as $$
  select case
    when is_deleted then 0::bigint
    else octet_length(convert_to(jsonb_strip_nulls(payload)::text, 'UTF8'))::bigint
  end;
$$;

create or replace function public.folder_cloud_storage_bytes(row_data public.folders)
returns bigint
language sql
stable
as $$
  select public.cloud_storage_payload_bytes(jsonb_build_object(
    'id', row_data.id,
    'name', row_data.name,
    'parent_id', row_data.parent_id,
    'color', row_data.color,
    'icon', row_data.icon,
    'position', row_data.position,
    'created_at', row_data.created_at,
    'updated_at', row_data.updated_at,
    'client_updated_at', row_data.client_updated_at,
    'device_id', row_data.device_id,
    'deleted_at', row_data.deleted_at
  ), row_data.deleted_at is not null);
$$;

create or replace function public.note_cloud_storage_bytes(row_data public.notes)
returns bigint
language sql
stable
as $$
  select public.cloud_storage_payload_bytes(jsonb_build_object(
    'id', row_data.id,
    'title', row_data.title,
    'plain_text', row_data.plain_text,
    'content', row_data.content,
    'source', row_data.source,
    'color', row_data.color,
    'pattern', row_data.pattern,
    'folder_id', row_data.folder_id,
    'tags', row_data.tags,
    'pinned', row_data.pinned,
    'favorite', row_data.favorite,
    'archived_at', row_data.archived_at,
    'trashed_at', row_data.trashed_at,
    'created_at', row_data.created_at,
    'updated_at', row_data.updated_at,
    'client_updated_at', row_data.client_updated_at,
    'device_id', row_data.device_id,
    'deleted_at', row_data.deleted_at
  ), row_data.deleted_at is not null);
$$;

create or replace function public.task_cloud_storage_bytes(row_data public.tasks)
returns bigint
language sql
stable
as $$
  select public.cloud_storage_payload_bytes(jsonb_build_object(
    'id', row_data.id,
    'title', row_data.title,
    'due_date', row_data.due_date,
    'due_time', row_data.due_time,
    'folder_id', row_data.folder_id,
    'position', row_data.position,
    'completed_at', row_data.completed_at,
    'completed_dates', row_data.completed_dates,
    'recurrence_series_id', row_data.recurrence_series_id,
    'repeat_rule', row_data.repeat_rule,
    'created_at', row_data.created_at,
    'updated_at', row_data.updated_at,
    'client_updated_at', row_data.client_updated_at,
    'device_id', row_data.device_id,
    'deleted_at', row_data.deleted_at
  ), row_data.deleted_at is not null);
$$;

create or replace function public.reminder_cloud_storage_bytes(row_data public.reminders)
returns bigint
language sql
stable
as $$
  select public.cloud_storage_payload_bytes(jsonb_build_object(
    'id', row_data.id,
    'owner_type', row_data.owner_type,
    'owner_id', row_data.owner_id,
    'scheduled_at', row_data.scheduled_at,
    'timezone', row_data.timezone,
    'repeat_rule', row_data.repeat_rule,
    'offset_minutes', row_data.offset_minutes,
    'recurrence_anchor_day', row_data.recurrence_anchor_day,
    'recurrence_due_time', row_data.recurrence_due_time,
    'enabled', row_data.enabled,
    'created_at', row_data.created_at,
    'updated_at', row_data.updated_at,
    'client_updated_at', row_data.client_updated_at,
    'device_id', row_data.device_id,
    'deleted_at', row_data.deleted_at
  ), row_data.deleted_at is not null);
$$;

create or replace function public.app_settings_cloud_storage_bytes(row_data public.app_settings)
returns bigint
language sql
stable
as $$
  select public.cloud_storage_payload_bytes(jsonb_build_object(
    'id', row_data.id,
    'layout', row_data.layout,
    'locale', row_data.locale,
    'recent_colors', row_data.recent_colors,
    'theme', row_data.theme,
    'created_at', row_data.created_at,
    'updated_at', row_data.updated_at,
    'client_updated_at', row_data.client_updated_at,
    'device_id', row_data.device_id,
    'deleted_at', row_data.deleted_at
  ), row_data.deleted_at is not null);
$$;

create or replace function public.synced_row_cloud_storage_bytes(table_name text, row_data anyelement)
returns bigint
language plpgsql
stable
set search_path = public
as $$
begin
  case table_name
    when 'folders' then return public.folder_cloud_storage_bytes(row_data::public.folders);
    when 'notes' then return public.note_cloud_storage_bytes(row_data::public.notes);
    when 'tasks' then return public.task_cloud_storage_bytes(row_data::public.tasks);
    when 'reminders' then return public.reminder_cloud_storage_bytes(row_data::public.reminders);
    when 'app_settings' then return public.app_settings_cloud_storage_bytes(row_data::public.app_settings);
    else raise exception 'Unsupported synced table for storage quota: %', table_name;
  end case;
end;
$$;

create or replace function public.recalculate_user_cloud_storage(target_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  total_bytes bigint;
begin
  perform public.ensure_free_storage_entitlement(target_user_id);

  select coalesce(sum(bytes), 0)::bigint
  into total_bytes
  from (
    select public.folder_cloud_storage_bytes(folders) as bytes from public.folders where user_id = target_user_id
    union all
    select public.note_cloud_storage_bytes(notes) from public.notes where user_id = target_user_id
    union all
    select public.task_cloud_storage_bytes(tasks) from public.tasks where user_id = target_user_id
    union all
    select public.reminder_cloud_storage_bytes(reminders) from public.reminders where user_id = target_user_id
    union all
    select public.app_settings_cloud_storage_bytes(app_settings) from public.app_settings where user_id = target_user_id
  ) payloads;

  insert into public.user_storage_usage (user_id, used_bytes, recalculated_at, updated_at)
  values (target_user_id, total_bytes, now(), now())
  on conflict (user_id) do update
  set used_bytes = excluded.used_bytes,
      recalculated_at = excluded.recalculated_at,
      updated_at = excluded.updated_at;

  return total_bytes;
end;
$$;

create or replace function public.enforce_cloud_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  old_bytes bigint := 0;
  new_bytes bigint := 0;
  delta_bytes bigint;
  current_used_bytes bigint;
  storage_limit bigint;
begin
  target_user_id := coalesce(new.user_id, old.user_id);
  perform public.ensure_free_storage_entitlement(target_user_id);

  if tg_op in ('UPDATE', 'DELETE') then
    old_bytes := public.synced_row_cloud_storage_bytes(tg_table_name, old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new_bytes := public.synced_row_cloud_storage_bytes(tg_table_name, new);
  end if;
  delta_bytes := new_bytes - old_bytes;

  select usage.used_bytes, plans.storage_limit_bytes
  into current_used_bytes, storage_limit
  from public.user_storage_usage usage
  join public.user_plan_entitlements entitlements on entitlements.user_id = usage.user_id
  join public.subscription_plans plans on plans.code = entitlements.plan_code
  where usage.user_id = target_user_id
  for update of usage;

  if delta_bytes > 0 and storage_limit is not null and current_used_bytes + delta_bytes > storage_limit then
    raise exception 'STORAGE_QUOTA_EXCEEDED'
      using errcode = 'P0001',
            detail = 'Free cloud storage quota exceeded.',
            hint = 'Delete synced data or upgrade the plan before syncing more changes.';
  end if;

  update public.user_storage_usage
  set used_bytes = greatest(0, current_used_bytes + delta_bytes),
      updated_at = now()
  where user_id = target_user_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['folders', 'notes', 'tasks', 'reminders', 'app_settings'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_storage_quota', table_name);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.enforce_cloud_storage_quota()', table_name || '_storage_quota', table_name);
  end loop;
end;
$$;

create or replace function public.get_cloud_storage_usage()
returns table (
  "planCode" text,
  "usedBytes" bigint,
  "limitBytes" bigint,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := (select auth.uid());
begin
  if target_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  perform public.ensure_free_storage_entitlement(target_user_id);

  return query
  select
    entitlements.plan_code as "planCode",
    usage.used_bytes as "usedBytes",
    plans.storage_limit_bytes as "limitBytes",
    case
      when plans.storage_limit_bytes is null then 'unlimited'
      when usage.used_bytes > plans.storage_limit_bytes then 'over_limit'
      when usage.used_bytes >= plans.storage_limit_bytes then 'full'
      when usage.used_bytes >= floor(plans.storage_limit_bytes * 0.8)::bigint then 'warning'
      else 'ok'
    end as status
  from public.user_plan_entitlements entitlements
  join public.subscription_plans plans on plans.code = entitlements.plan_code
  join public.user_storage_usage usage on usage.user_id = entitlements.user_id
  where entitlements.user_id = target_user_id;
end;
$$;

grant execute on function public.get_cloud_storage_usage() to authenticated;

do $$
declare user_record record;
begin
  for user_record in
    select id from auth.users
  loop
    perform public.recalculate_user_cloud_storage(user_record.id);
  end loop;
end;
$$;
