import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "../supabase/client";
import { bindIdleTracking, clearIdleSession, expireIdleSession } from "./idle";

const signOutLocal = async (): Promise<void> => {
  const client = getSupabase();
  if (!client) return;
  await client.auth.signOut({ scope: "local" }).then(() => undefined, () => undefined);
};

export const getSession = async (): Promise<Session | null> => {
  bindIdleTracking();
  if (expireIdleSession()) {
    await signOutLocal();
    return null;
  }
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
};

export const getUser = async (): Promise<User | null> => (await getSession())?.user ?? null;

export const signOut = async (): Promise<void> => {
  const client = getSupabase();
  if (!client) return;
  await client.rpc("record_user_activity", {
    p_event_type: "logout",
    p_category: "auth",
    p_path: "/",
    p_detail: { source: "pro" }
  }).then(() => undefined, () => undefined);
  const { error } = await client.auth.signOut();
  clearIdleSession();
  if (error) throw error;
};
