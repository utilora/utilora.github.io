import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "../supabase/client";
import { bindIdleTracking, clearIdleSession, expireIdleSession, setIdleTimeoutMs } from "./idle";

let idleConfigLoaded = false;

const loadIdleTimeout = async (): Promise<void> => {
  if (idleConfigLoaded) return;
  const client = getSupabase();
  if (!client) return;
  const { data } = await client.rpc("get_idle_timeout_minutes");
  const minutes = Number(Array.isArray(data) ? data[0] : data);
  if (Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440) {
    setIdleTimeoutMs(minutes * 60 * 1000);
    idleConfigLoaded = true;
  }
};

const signOutLocal = async (): Promise<void> => {
  const client = getSupabase();
  if (!client) return;
  await client.auth.signOut({ scope: "global" }).then(() => undefined, () => undefined);
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
  if (data.session) await loadIdleTimeout().then(() => undefined, () => undefined);
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
