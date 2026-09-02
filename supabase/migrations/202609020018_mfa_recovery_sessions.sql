-- 二次验证恢复码、登录设备清单。
-- 恢复码只存哈希；明文只在签发时返回一次。

create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists mfa_recovery_codes_user_idx
  on public.mfa_recovery_codes (user_id, used_at);
alter table public.mfa_recovery_codes enable row level security;
revoke all on public.mfa_recovery_codes from public, anon, authenticated;

create table if not exists public.mfa_recovery_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index if not exists mfa_recovery_attempts_user_idx
  on public.mfa_recovery_attempts (user_id, attempted_at desc);
alter table public.mfa_recovery_attempts enable row level security;
revoke all on public.mfa_recovery_attempts from public, anon, authenticated;

create or replace function public.replace_mfa_recovery_codes(p_user_id uuid, p_hashes text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'user required';
  end if;
  if p_hashes is null or coalesce(array_length(p_hashes, 1), 0) < 1 or coalesce(array_length(p_hashes, 1), 0) > 20 then
    raise exception 'invalid hashes';
  end if;
  delete from public.mfa_recovery_codes where user_id = p_user_id;
  foreach v_hash in array p_hashes loop
    if v_hash is null or length(v_hash) < 32 or length(v_hash) > 128 then
      raise exception 'invalid hash';
    end if;
    insert into public.mfa_recovery_codes(user_id, code_hash) values (p_user_id, v_hash);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.replace_mfa_recovery_codes(uuid, text[]) from public, anon, authenticated;
grant execute on function public.replace_mfa_recovery_codes(uuid, text[]) to service_role;

create or replace function public.consume_mfa_recovery_code(p_user_id uuid, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_fails integer;
  v_remaining integer;
begin
  if p_user_id is null or p_code_hash is null or length(p_code_hash) < 32 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select count(*)::integer into v_fails
  from public.mfa_recovery_attempts
  where user_id = p_user_id
    and attempted_at > now() - interval '15 minutes';
  if v_fails >= 5 then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  select id into v_id
  from public.mfa_recovery_codes
  where user_id = p_user_id
    and used_at is null
    and code_hash = p_code_hash
  limit 1
  for update;

  if v_id is null then
    insert into public.mfa_recovery_attempts(user_id) values (p_user_id);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update public.mfa_recovery_codes
     set used_at = now()
   where id = v_id;

  delete from public.mfa_recovery_attempts where user_id = p_user_id;

  select count(*)::integer into v_remaining
  from public.mfa_recovery_codes
  where user_id = p_user_id and used_at is null;

  return jsonb_build_object('ok', true, 'remaining', v_remaining);
end;
$$;
revoke all on function public.consume_mfa_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_mfa_recovery_code(uuid, text) to service_role;

create or replace function public.peek_mfa_recovery_code(p_user_id uuid, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_fails integer;
begin
  if p_user_id is null or p_code_hash is null or length(p_code_hash) < 32 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select count(*)::integer into v_fails
  from public.mfa_recovery_attempts
  where user_id = p_user_id
    and attempted_at > now() - interval '15 minutes';
  if v_fails >= 5 then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  select id into v_id
  from public.mfa_recovery_codes
  where user_id = p_user_id
    and used_at is null
    and code_hash = p_code_hash
  limit 1;

  if v_id is null then
    insert into public.mfa_recovery_attempts(user_id) values (p_user_id);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.peek_mfa_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.peek_mfa_recovery_code(uuid, text) to service_role;

create or replace function public.mark_mfa_recovery_code_used(p_user_id uuid, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining integer;
begin
  update public.mfa_recovery_codes
     set used_at = now()
   where user_id = p_user_id
     and used_at is null
     and code_hash = p_code_hash;
  delete from public.mfa_recovery_attempts where user_id = p_user_id;
  select count(*)::integer into v_remaining
  from public.mfa_recovery_codes
  where user_id = p_user_id and used_at is null;
  return jsonb_build_object('ok', true, 'remaining', v_remaining);
end;
$$;
revoke all on function public.mark_mfa_recovery_code_used(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_mfa_recovery_code_used(uuid, text) to service_role;

create or replace function public.mfa_recovery_remaining()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise insufficient_privilege;
  end if;
  return (
    select count(*)::integer
    from public.mfa_recovery_codes
    where user_id = auth.uid() and used_at is null
  );
end;
$$;
revoke all on function public.mfa_recovery_remaining() from public, anon;
grant execute on function public.mfa_recovery_remaining() to authenticated;

create or replace function public.clear_mfa_recovery_codes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise insufficient_privilege;
  end if;
  delete from public.mfa_recovery_codes where user_id = auth.uid();
  delete from public.mfa_recovery_attempts where user_id = auth.uid();
end;
$$;
revoke all on function public.clear_mfa_recovery_codes() from public, anon;
grant execute on function public.clear_mfa_recovery_codes() to authenticated;

create or replace function public.list_my_sessions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise insufficient_privilege;
  end if;
  begin
    select coalesce(jsonb_agg(item order by last_active desc), '[]'::jsonb)
      into result
    from (
      select jsonb_build_object(
        'id', s.id,
        'created_at', s.created_at,
        'last_active', coalesce(s.updated_at, s.created_at),
        'user_agent', left(coalesce(s.user_agent, ''), 180)
      ) as item,
      coalesce(s.updated_at, s.created_at) as last_active
      from auth.sessions s
      where s.user_id = auth.uid()
        and (s.not_after is null or s.not_after > now())
    ) q;
    return result;
  exception when others then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'created_at', s.created_at,
      'last_active', coalesce(s.updated_at, s.created_at),
      'user_agent', ''
    ) order by coalesce(s.updated_at, s.created_at) desc), '[]'::jsonb)
      into result
    from auth.sessions s
    where s.user_id = auth.uid();
    return coalesce(result, '[]'::jsonb);
  end;
end;
$$;
revoke all on function public.list_my_sessions() from public, anon;
grant execute on function public.list_my_sessions() to authenticated;
