-- A-11 账龄分桶边界：公开只读 RPC，新打开的账龄视图读取当前桶上限
-- 桶序校验已在 admin_set_platform_limits；此处只返回有效边界，非法配置回退 30/60/90。

create or replace function public.get_aging_bucket_bounds()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_b1 integer;
  v_b2 integer;
  v_b3 integer;
begin
  v_b1 := public.get_platform_config_int('aging_bucket_1_days', 30);
  v_b2 := public.get_platform_config_int('aging_bucket_2_days', 60);
  v_b3 := public.get_platform_config_int('aging_bucket_3_days', 90);
  if not (v_b1 > 0 and v_b1 < v_b2 and v_b2 < v_b3 and v_b3 <= 365) then
    v_b1 := 30;
    v_b2 := 60;
    v_b3 := 90;
  end if;
  return jsonb_build_object(
    'bucket_1', v_b1,
    'bucket_2', v_b2,
    'bucket_3', v_b3,
    'labels', jsonb_build_array(
      '未到期',
      format('逾期 1–%s 天', v_b1),
      format('逾期 %s–%s 天', v_b1 + 1, v_b2),
      format('逾期 %s–%s 天', v_b2 + 1, v_b3),
      format('逾期 %s 天以上', v_b3)
    )
  );
end;
$$;

revoke all on function public.get_aging_bucket_bounds() from public;
grant execute on function public.get_aging_bucket_bounds() to anon, authenticated;
