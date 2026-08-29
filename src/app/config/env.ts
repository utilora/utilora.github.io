export interface AppEnvironment {
  supabaseUrl: string;
  supabaseAnonKey: string;
  proOpenAccess: boolean;
}

const readMeta = (name: string): string =>
  document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content?.trim() ?? "";

export const environment: AppEnvironment = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || readMeta("utilora-supabase-url") || "https://nkxgnqzdswugbjjquxfj.supabase.co",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || readMeta("utilora-supabase-anon-key") || "sb_publishable_IUK0swkEhqmaWKjUGv_IIQ_Y7LjtayF",
  proOpenAccess: (import.meta.env.VITE_PRO_OPEN_ACCESS ?? "true") === "true"
};