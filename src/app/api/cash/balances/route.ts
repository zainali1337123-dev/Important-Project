import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data: ledger, error } = await supabase.from("cash_ledger").select("*");

    if (error || !ledger) {
      return NextResponse.json({ balances: {} });
    }

    const balances: Record<number, number> = {};
    for (const entry of ledger) {
      const accId = entry.account_id;
      const amt = Number(entry.amount) || 0;
      balances[accId] = (balances[accId] || 0) + (entry.type === "in" ? amt : -amt);
    }

    return NextResponse.json({ balances });
  } catch {
    return NextResponse.json({ balances: {} });
  }
}
