import { createClient, SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client for client-side usage with public anon key.
 * Lazy-initialized to prevent app startup crashes if keys are not yet configured.
 */
export function getSupabase(): SupabaseClient {
  if (typeof window === "undefined") {
    return getSupabaseServerClient();
  }

  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://omybcpvsnhomarsldbba.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return browserClient;
}

/**
 * Returns a Supabase client for server-side API routes / server actions.
 */
export function getSupabaseServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://omybcpvsnhomarsldbba.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
