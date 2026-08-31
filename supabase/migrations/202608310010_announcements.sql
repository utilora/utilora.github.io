-- 站点公告：管理员发布；登录用户可对单条点「不再弹出」；新公告再弹

begin;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint announcements_title_len check (char_length(title) between 1 and 80),
  constraint announcements_body_len check (char_length(body) between 1 and 2000),
  constraint announcements_end_check check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.announcement_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

alter table public.announcements enable row level security;
alter table public.announcement_dismissals enable row level security;
revoke all on public.announcements from public, anon, authenticated;
revoke all on public.announcement_dismissals from public, anon, authenticated;

create or replace function public.get_active_announcement()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  select to_jsonb(t)
  into result
  from (
    select a.id, a.title, a.body, a.created_at
    from public.announcements a
    where a.is_active
      and a.starts_at <= now()
      and (a.ends_at is null or a.ends_at > now())
      and (
        auth.uid() is null
        or not exists (
          select 1 from public.announcement_dismissals d
          where d.user_id = auth.uid() and d.announcement_id = a.id
        )
      )
    order by a.created_at desc
    limit 1
  ) t;
  return result;
end;
$$;
revoke all on function public.get_active_announcement() from public;
grant execute on function public.get_active_announcement() to anon, authenticated;

create or replace function public.dismiss_announcement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;
  if p_id is null then
    raise exception 'invalid announcement';
  end if;
  if not exists (
    select 1 from public.announcements
    where id = p_id and is_active
  ) then
    raise exception 'announcement not found';
  end if;
  insert into public.announcement_dismissals(user_id, announcement_id)
  values (auth.uid(), p_id)
  on conflict do nothing;
end;
$$;
revoke all on function public.dismiss_announcement(uuid) from public, anon;
grant execute on function public.dismiss_announcement(uuid) to authenticated;

create or replace function public.admin_list_announcements()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  into result
  from (
    select id, title, body, is_active, starts_at, ends_at, created_at, updated_at
    from public.announcements
  ) t;
  return result;
end;
$$;
revoke all on function public.admin_list_announcements() from public, anon;
grant execute on function public.admin_list_announcements() to authenticated;

create or replace function public.admin_upsert_announcement(
  p_id uuid,
  p_title text,
  p_body text,
  p_is_active boolean,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_title text;
  v_body text;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  v_title := left(trim(coalesce(p_title, '')), 80);
  v_body := left(trim(coalesce(p_body, '')), 2000);
  if char_length(v_title) < 1 then
    raise exception 'invalid title';
  end if;
  if char_length(v_body) < 1 then
    raise exception 'invalid body';
  end if;
  if p_ends_at is not null and coalesce(p_starts_at, now()) >= p_ends_at then
    raise exception 'invalid end';
  end if;
  if p_id is null then
    insert into public.announcements(title, body, is_active, starts_at, ends_at, created_by)
    values (v_title, v_body, coalesce(p_is_active, true), coalesce(p_starts_at, now()), p_ends_at, auth.uid())
    returning id into v_id;
  else
    update public.announcements
      set title = v_title,
          body = v_body,
          is_active = coalesce(p_is_active, is_active),
          starts_at = coalesce(p_starts_at, starts_at),
          ends_at = p_ends_at,
          updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'announcement not found';
    end if;
  end if;
  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'announcement_upsert',
    'admin',
    '/admin/',
    jsonb_build_object('id', v_id, 'title', v_title, 'active', coalesce(p_is_active, true))
  );
  return v_id;
end;
$$;
revoke all on function public.admin_upsert_announcement(uuid, text, text, boolean, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_upsert_announcement(uuid, text, text, boolean, timestamptz, timestamptz) to authenticated;

commit;
