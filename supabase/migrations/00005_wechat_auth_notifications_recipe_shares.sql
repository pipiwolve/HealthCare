-- 微信身份、一次性订阅通知、菜谱分享快照。
-- 生产执行前先运行文末的重复 openid 审计查询。

create table if not exists public.wechat_identities (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'wechat_miniapp',
  user_id uuid not null references public.profiles(id) on delete cascade,
  openid text not null,
  unionid text,
  phone_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wechat_identities_provider_openid_key unique (provider, openid),
  constraint wechat_identities_provider_user_key unique (provider, user_id)
);

insert into public.wechat_identities (provider, user_id, openid)
select 'wechat_miniapp', id, openid
from public.profiles
where openid is not null and btrim(openid) <> ''
on conflict do nothing;

create table if not exists public.wechat_access_tokens (
  token_key text primary key,
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('breakfast', 'lunch', 'dinner', 'water')),
  template_id text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  attempts integer not null default 0,
  wechat_msg_id text,
  last_error text,
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_jobs_one_active_kind_idx
  on public.notification_jobs(user_id, kind)
  where status in ('pending', 'processing', 'failed');
create index if not exists notification_jobs_due_idx
  on public.notification_jobs(status, scheduled_at);

create table if not exists public.recipe_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  recipe_content text not null,
  ingredients jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null default (now() + interval '90 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recipe_shares_owner_created_idx on public.recipe_shares(owner_id, created_at desc);
create index if not exists recipe_shares_expiry_idx on public.recipe_shares(expires_at);

alter table public.wechat_identities enable row level security;
alter table public.wechat_access_tokens enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.recipe_shares enable row level security;

-- 以上表只允许 service_role 通过 Edge Functions 访问，不创建 anon/authenticated policy。

drop trigger if exists wechat_identities_updated_at on public.wechat_identities;
create trigger wechat_identities_updated_at
  before update on public.wechat_identities
  for each row execute function public.update_updated_at();

drop trigger if exists notification_jobs_updated_at on public.notification_jobs;
create trigger notification_jobs_updated_at
  before update on public.notification_jobs
  for each row execute function public.update_updated_at();

create or replace function public.claim_due_notification_jobs(batch_size integer default 50)
returns setof public.notification_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id
    from public.notification_jobs
    where (
        status in ('pending', 'failed')
        or (status = 'processing' and locked_at < now() - interval '5 minutes')
      )
      and scheduled_at <= now()
      and attempts < 3
      and (locked_at is null or locked_at < now() - interval '5 minutes')
    order by scheduled_at asc
    limit greatest(1, least(batch_size, 100))
    for update skip locked
  )
  update public.notification_jobs jobs
  set status = 'processing', locked_at = now(), attempts = jobs.attempts + 1, updated_at = now()
  from due
  where jobs.id = due.id
  returning jobs.*;
end;
$$;

revoke all on function public.claim_due_notification_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_due_notification_jobs(integer) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select to public using (bucket_id = 'avatars');

grant select, insert, update, delete on public.wechat_identities to service_role;
grant select, insert, update, delete on public.wechat_access_tokens to service_role;
grant select, insert, update, delete on public.notification_jobs to service_role;
grant select, insert, update, delete on public.recipe_shares to service_role;

-- Preflight audit: this query must return zero rows before applying the migration.
-- select openid, count(*) from public.profiles where openid is not null group by openid having count(*) > 1;
