import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("account_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = supabase
      .from("cash_ledger")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("id", { ascending: false });

    if (accountId) query = query.eq("account_id", accountId);
    if (from) query = query.gte("entry_date", from);
    if (to) query = query.lte("entry_date", to);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ledger: [], error: error.message }, { status: 200 });
    }

    return NextResponse.json({ ledger: data || [] });
  } catch (err: any) {
    return NextResponse.json({ ledger: [], error: err.message }, { status: 500 });
  }
}
