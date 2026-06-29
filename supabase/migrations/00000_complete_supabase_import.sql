-- 秒哒 Supabase 完整导入迁移
-- 用法：在 Supabase Dashboard -> SQL Editor 中整段执行。
-- 覆盖内容：业务表、枚举、RLS、触发器、Realtime 发布、Storage buckets 与策略。

-- ============================================================
-- 1. Extensions
-- ============================================================

create extension if not exists "pgcrypto" with schema extensions;

-- ============================================================
-- 2. Enum types
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'user_role') then
    create type public.user_role as enum ('user', 'admin');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'blood_type') then
    create type public.blood_type as enum ('A', 'B', 'AB', 'O', 'other');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'gender_type') then
    create type public.gender_type as enum ('male', 'female', 'unknown');
  end if;
end
$$;

-- ============================================================
-- 3. Business tables
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  openid text,
  nickname text,
  avatar_url text,
  role public.user_role default 'user'::public.user_role,
  has_seen_disclaimer boolean default false,
  has_seen_guide boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null default '主用户',
  avatar_url text,
  gender public.gender_type default 'unknown'::public.gender_type,
  age integer,
  height numeric(5,1),
  weight numeric(5,1),
  birthday date,
  blood_type public.blood_type,
  chronic_diseases text[] default '{}',
  allergens text[] default '{}',
  medications text,
  daily_calorie_goal integer,
  daily_protein_goal numeric(6,1),
  daily_fat_goal numeric(6,1),
  daily_carb_goal numeric(6,1),
  is_primary boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.user_active_member (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  updated_at timestamptz default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  device_name text not null default '我的营养秤',
  device_model text,
  service_uuid text,
  is_connected boolean default false,
  battery_level integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint devices_user_id_device_id_key unique (user_id, device_id)
);

create table if not exists public.weighing_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid references public.family_members(id) on delete set null,
  ingredients jsonb not null default '[]'::jsonb,
  person_count integer default 1,
  analysis_result text,
  total_calories numeric(8,1),
  protein numeric(6,1),
  fat numeric(6,1),
  carbs numeric(6,1),
  created_at timestamptz default now()
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid references public.family_members(id) on delete set null,
  title text default '新对话',
  context_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  image_url text,
  created_at timestamptz default now()
);

create table if not exists public.reminder_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  breakfast_enabled boolean default false,
  breakfast_time text default '07:30',
  lunch_enabled boolean default false,
  lunch_time text default '12:00',
  dinner_enabled boolean default false,
  dinner_time text default '18:30',
  water_enabled boolean default false,
  water_time text default '09:00',
  updated_at timestamptz default now(),
  constraint reminder_settings_user_id_key unique (user_id)
);

-- If this script is applied over a partial schema, ensure all expected columns exist.
alter table public.profiles
  add column if not exists username text,
  add column if not exists openid text,
  add column if not exists nickname text,
  add column if not exists avatar_url text,
  add column if not exists role public.user_role default 'user'::public.user_role,
  add column if not exists has_seen_disclaimer boolean default false,
  add column if not exists has_seen_guide boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.family_members
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists nickname text default '主用户',
  add column if not exists avatar_url text,
  add column if not exists gender public.gender_type default 'unknown'::public.gender_type,
  add column if not exists age integer,
  add column if not exists height numeric(5,1),
  add column if not exists weight numeric(5,1),
  add column if not exists birthday date,
  add column if not exists blood_type public.blood_type,
  add column if not exists chronic_diseases text[] default '{}',
  add column if not exists allergens text[] default '{}',
  add column if not exists medications text,
  add column if not exists daily_calorie_goal integer,
  add column if not exists daily_protein_goal numeric(6,1),
  add column if not exists daily_fat_goal numeric(6,1),
  add column if not exists daily_carb_goal numeric(6,1),
  add column if not exists is_primary boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.user_active_member
  add column if not exists updated_at timestamptz default now();

alter table public.devices
  add column if not exists device_model text,
  add column if not exists service_uuid text,
  add column if not exists is_connected boolean default false,
  add column if not exists battery_level integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.weighing_records
  add column if not exists member_id uuid references public.family_members(id) on delete set null,
  add column if not exists ingredients jsonb default '[]'::jsonb,
  add column if not exists person_count integer default 1,
  add column if not exists analysis_result text,
  add column if not exists total_calories numeric(8,1),
  add column if not exists protein numeric(6,1),
  add column if not exists fat numeric(6,1),
  add column if not exists carbs numeric(6,1),
  add column if not exists created_at timestamptz default now();

alter table public.chat_sessions
  add column if not exists member_id uuid references public.family_members(id) on delete set null,
  add column if not exists title text default '新对话',
  add column if not exists context_data jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.chat_messages
  add column if not exists image_url text,
  add column if not exists created_at timestamptz default now();

-- Ensure constraints that are required by client upsert calls exist when applying
-- this script over a partially-created database.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.devices'::regclass
      and conname = 'devices_user_id_device_id_key'
  ) then
    alter table public.devices
      add constraint devices_user_id_device_id_key unique (user_id, device_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reminder_settings'::regclass
      and conname = 'reminder_settings_user_id_key'
  ) then
    alter table public.reminder_settings
      add constraint reminder_settings_user_id_key unique (user_id);
  end if;
end
$$;

-- ============================================================
-- 4. Indexes
-- ============================================================

create index if not exists profiles_openid_idx on public.profiles(openid);
create index if not exists family_members_user_id_idx on public.family_members(user_id);
create index if not exists user_active_member_member_id_idx on public.user_active_member(member_id);
create index if not exists devices_user_id_idx on public.devices(user_id);
create index if not exists weighing_records_user_member_created_idx on public.weighing_records(user_id, member_id, created_at desc);
create index if not exists weighing_records_user_created_idx on public.weighing_records(user_id, created_at desc);
create index if not exists chat_sessions_user_updated_idx on public.chat_sessions(user_id, updated_at desc);
create index if not exists chat_messages_session_created_idx on public.chat_messages(session_id, created_at asc);
create index if not exists reminder_settings_user_id_idx on public.reminder_settings(user_id);

-- ============================================================
-- 5. Realtime publication
-- ============================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'weighing_records'
    ) then
      alter publication supabase_realtime add table public.weighing_records;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_messages'
    ) then
      alter publication supabase_realtime add table public.chat_messages;
    end if;
  end if;
end
$$;

-- ============================================================
-- 6. Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.family_members enable row level security;
alter table public.user_active_member enable row level security;
alter table public.devices enable row level security;
alter table public.weighing_records enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.reminder_settings enable row level security;

create or replace function public.get_user_role(uid uuid)
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = uid;
$$;

drop policy if exists "用户可查看自己的资料" on public.profiles;
create policy "用户可查看自己的资料" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "管理员有完整权限" on public.profiles;
create policy "管理员有完整权限" on public.profiles
  for all to authenticated
  using (public.get_user_role(auth.uid()) = 'admin'::public.user_role)
  with check (public.get_user_role(auth.uid()) = 'admin'::public.user_role);

drop policy if exists "用户可更新自己的资料" on public.profiles;
create policy "用户可更新自己的资料" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role is not distinct from public.get_user_role(auth.uid()));

drop policy if exists "用户可操作自己的家庭成员" on public.family_members;
create policy "用户可操作自己的家庭成员" on public.family_members
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "用户可操作自己的激活成员" on public.user_active_member;
create policy "用户可操作自己的激活成员" on public.user_active_member
  for all to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.family_members fm
      where fm.id = user_active_member.member_id
        and fm.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.family_members fm
      where fm.id = user_active_member.member_id
        and fm.user_id = auth.uid()
    )
  );

drop policy if exists "用户可操作自己的设备" on public.devices;
create policy "用户可操作自己的设备" on public.devices
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "用户可操作自己的称重记录" on public.weighing_records;
create policy "用户可操作自己的称重记录" on public.weighing_records
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      member_id is null
      or exists (
        select 1
        from public.family_members fm
        where fm.id = weighing_records.member_id
          and fm.user_id = auth.uid()
      )
    )
  );

drop policy if exists "用户可操作自己的对话会话" on public.chat_sessions;
create policy "用户可操作自己的对话会话" on public.chat_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      member_id is null
      or exists (
        select 1
        from public.family_members fm
        where fm.id = chat_sessions.member_id
          and fm.user_id = auth.uid()
      )
    )
  );

drop policy if exists "用户可查看自己会话的消息" on public.chat_messages;
create policy "用户可查看自己会话的消息" on public.chat_messages
  for select to authenticated
  using (
    exists (
      select 1
      from public.chat_sessions cs
      where cs.id = chat_messages.session_id
        and cs.user_id = auth.uid()
    )
  );

drop policy if exists "用户可插入自己会话的消息" on public.chat_messages;
create policy "用户可插入自己会话的消息" on public.chat_messages
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.chat_sessions cs
      where cs.id = chat_messages.session_id
        and cs.user_id = auth.uid()
    )
  );

drop policy if exists "用户可删除自己会话的消息" on public.chat_messages;
create policy "用户可删除自己会话的消息" on public.chat_messages
  for delete to authenticated
  using (
    exists (
      select 1
      from public.chat_sessions cs
      where cs.id = chat_messages.session_id
        and cs.user_id = auth.uid()
    )
  );

drop policy if exists "用户可操作自己的提醒设置" on public.reminder_settings;
create policy "用户可操作自己的提醒设置" on public.reminder_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 7. Auth/profile bootstrap and updated_at triggers
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text;
  v_member_id uuid;
begin
  v_nickname := coalesce(
    (new.raw_user_meta_data->>'nickname')::text,
    (new.raw_user_meta_data->>'username')::text,
    '用户'
  );

  insert into public.profiles (id, username, openid, nickname, role)
  values (
    new.id,
    (new.raw_user_meta_data->>'username')::text,
    (new.raw_user_meta_data->>'openid')::text,
    v_nickname,
    'user'::public.user_role
  )
  on conflict (id) do update
    set username = coalesce(excluded.username, public.profiles.username),
        openid = coalesce(excluded.openid, public.profiles.openid),
        nickname = coalesce(public.profiles.nickname, excluded.nickname),
        updated_at = now();

  insert into public.family_members (user_id, nickname, is_primary)
  values (new.id, v_nickname, true)
  on conflict do nothing
  returning id into v_member_id;

  if v_member_id is null then
    select id
    into v_member_id
    from public.family_members
    where user_id = new.id and is_primary = true
    order by created_at asc
    limit 1;
  end if;

  if v_member_id is not null then
    insert into public.user_active_member (user_id, member_id)
    values (new.id, v_member_id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

drop trigger if exists family_members_updated_at on public.family_members;
create trigger family_members_updated_at
  before update on public.family_members
  for each row execute function public.update_updated_at();

drop trigger if exists user_active_member_updated_at on public.user_active_member;
create trigger user_active_member_updated_at
  before update on public.user_active_member
  for each row execute function public.update_updated_at();

drop trigger if exists devices_updated_at on public.devices;
create trigger devices_updated_at
  before update on public.devices
  for each row execute function public.update_updated_at();

drop trigger if exists chat_sessions_updated_at on public.chat_sessions;
create trigger chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute function public.update_updated_at();

drop trigger if exists reminder_settings_updated_at on public.reminder_settings;
create trigger reminder_settings_updated_at
  before update on public.reminder_settings
  for each row execute function public.update_updated_at();

-- Backfill profiles and primary members for users that already existed before this migration.
insert into public.profiles (id, username, openid, nickname, role)
select
  u.id,
  (u.raw_user_meta_data->>'username')::text,
  (u.raw_user_meta_data->>'openid')::text,
  coalesce((u.raw_user_meta_data->>'nickname')::text, (u.raw_user_meta_data->>'username')::text, '用户'),
  'user'::public.user_role
from auth.users u
on conflict (id) do nothing;

insert into public.family_members (user_id, nickname, is_primary)
select
  p.id,
  coalesce(p.nickname, p.username, '用户'),
  true
from public.profiles p
where not exists (
  select 1
  from public.family_members fm
  where fm.user_id = p.id
    and fm.is_primary = true
);

insert into public.user_active_member (user_id, member_id)
select distinct on (fm.user_id)
  fm.user_id,
  fm.id
from public.family_members fm
where fm.is_primary = true
order by fm.user_id, fm.created_at asc
on conflict (user_id) do nothing;

-- ============================================================
-- 8. Storage buckets and policies
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('chat-images', 'chat-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('generated-audio', 'generated-audio', true, 10485760, array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'application/octet-stream'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat_images_insert" on storage.objects;
create policy "chat_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat_images_anon_insert" on storage.objects;
create policy "chat_images_anon_insert" on storage.objects
  for insert to anon
  with check (bucket_id = 'chat-images');

drop policy if exists "chat_images_select" on storage.objects;
create policy "chat_images_select" on storage.objects
  for select to public
  using (bucket_id = 'chat-images');

drop policy if exists "chat_images_delete" on storage.objects;
create policy "chat_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "generated_audio_public_read" on storage.objects;
create policy "generated_audio_public_read" on storage.objects
  for select to public
  using (bucket_id = 'generated-audio');

drop policy if exists "generated_audio_service_insert" on storage.objects;
create policy "generated_audio_service_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'generated-audio');

-- ============================================================
-- 9. API grants
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.profiles to anon;
grant execute on function public.get_user_role(uuid) to authenticated, service_role;

-- End of migration.
