begin;

alter table public.analytics_events drop constraint if exists analytics_events_event_type_check;
alter table public.analytics_events
  add constraint analytics_events_event_type_check check (event_type in (
    'page_view',
    'tool_use',
    'homepage_view',
    'free_tool_use',
    'pro_click',
    'demo_enter',
    'login_success',
    'workspace_enter',
    'bank_use',
    'receivable_use',
    'month_end_use',
    'pricing_view',
    'purchase_intent'
  ));

create or replace function public.track_analytics_event(
  p_event_type text,
  p_tool_slug text default null,
  p_path text default null,
  p_session_id text default null,
  p_referrer text default null,
  p_device text default null,
  p_browser text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_type not in (
    'page_view',
    'tool_use',
    'homepage_view',
    'free_tool_use',
    'pro_click',
    'demo_enter',
    'login_success',
    'workspace_enter',
    'bank_use',
    'receivable_use',
    'month_end_use',
    'pricing_view',
    'purchase_intent'
  ) then
    raise exception 'invalid event type';
  end if;
  if length(coalesce(p_tool_slug, '')) > 80
    or length(coalesce(p_path, '')) > 200
    or length(coalesce(p_session_id, '')) > 80
    or length(coalesce(p_referrer, '')) > 160 then
    raise exception 'invalid analytics payload';
  end if;
  if p_event_type = 'page_view' and nullif(p_session_id, '') is not null then
    insert into public.analytics_daily_visitors(visitor_id, path, referrer, device, browser)
    values (p_session_id, nullif(p_path, ''), nullif(p_referrer, ''), nullif(p_device, ''), nullif(p_browser, ''))
    on conflict (visitor_id, visit_day) do nothing;
  elsif p_event_type <> 'page_view' then
    insert into public.analytics_events(event_type, tool_slug, path, session_id, referrer, device, browser)
    values (
      p_event_type,
      nullif(p_tool_slug, ''),
      nullif(p_path, ''),
      nullif(p_session_id, ''),
      nullif(p_referrer, ''),
      nullif(p_device, ''),
      nullif(p_browser, '')
    );
  end if;
end
$$;

revoke all on function public.track_analytics_event(text, text, text, text, text, text, text) from public;
grant execute on function public.track_analytics_event(text, text, text, text, text, text, text) to anon, authenticated;

commit;
