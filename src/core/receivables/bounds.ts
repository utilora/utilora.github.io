import { getSupabase } from "../supabase/client";
import { DEFAULT_AGING_BOUNDS, normalizeAgingBounds, type AgingBounds } from "./local";

export const fetchAgingBounds = async (): Promise<AgingBounds> => {
  const client = getSupabase();
  if (!client) return DEFAULT_AGING_BOUNDS;
  const { data, error } = await client.rpc("get_aging_bucket_bounds");
  if (error || !data) return DEFAULT_AGING_BOUNDS;
  const row = (Array.isArray(data) ? data[0] : data) as {
    bucket_1?: number;
    bucket_2?: number;
    bucket_3?: number;
    bucket1?: number;
    bucket2?: number;
    bucket3?: number;
  } | null;
  return normalizeAgingBounds({
    bucket1: Number(row?.bucket_1 ?? row?.bucket1),
    bucket2: Number(row?.bucket_2 ?? row?.bucket2),
    bucket3: Number(row?.bucket_3 ?? row?.bucket3)
  });
};
