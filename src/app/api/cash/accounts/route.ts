import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  const standardAccounts = [
    { id: 1, name: "Cash In Hand" },
    { id: 2, name: "Cash In Locker" },
    { id: 3, name: "Cash Online" },
  ];

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("cash_accounts").select("*").order("id", { ascending: true });

    if (error || !data || data.length === 0) {
      // Attempt to seed standard accounts into database if empty
      try {
        await supabase.from("cash_accounts").upsert([
          { id: 1, name: "Cash In Hand" },
          { id: 2, name: "Cash In Locker" },
          { id: 3, name: "Cash Online" },
        ], { onConflict: "id" });
      } catch {
        // ignore if not allowed
      }
      return NextResponse.json({ accounts: standardAccounts });
    }

    return NextResponse.json({ accounts: data });
  } catch {
    return NextResponse.json({ accounts: standardAccounts });
  }
}

