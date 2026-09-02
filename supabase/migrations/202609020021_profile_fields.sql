-- 账号资料：公司 / 职务 / 城市 / 简介；允许本人补建档案。
begin;

alter table public.profiles
  add column if not exists company text,
  add column if not exists title text,
  add column if not exists city text,
  add column if not exists bio text;

update public.profiles
   set display_name = left(display_name, 40)
 where display_name is not null and char_length(display_name) > 40;

grant insert on public.profiles to authenticated;

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

commit;
