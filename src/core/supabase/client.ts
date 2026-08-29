import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { environment } from "../../app/config/env";

let client: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!environment.supabaseUrl || !environment.supabaseAnonKey) return null;
  client ??= createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "utilora_sb_session"
    }
  });
  return client;
};