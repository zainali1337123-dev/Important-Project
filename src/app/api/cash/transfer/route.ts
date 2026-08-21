import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = supabase
      .from("cash_transfers")
      .select("*")
      .order("transfer_date", { ascending: false })
      .order("id", { ascending: false });

    if (from) query = query.gte("transfer_date", from);
    if (to) query = query.lte("transfer_date", to);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ transfers: [], error: error.message }, { status: 200 });
    }

    return NextResponse.json({ transfers: data || [] });
  } catch (err: any) {
    return NextResponse.json({ transfers: [], error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { transfer_date, from_account_id, to_account_id, amount, notes, entered_by } = body;

    let fromId = Number(from_account_id);
    let toId = Number(to_account_id);

    if (!fromId || !toId || !amount) {
      return NextResponse.json({ error: "From account, To account, and amount are required" }, { status: 400 });
    }

    const amt = Number(amount);
    if (amt <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }

    const tDate = transfer_date || new Date().toISOString().split("T")[0];

    // Ensure accounts exist in cash_accounts table to prevent foreign key errors
    try {
      await supabase.from("cash_accounts").upsert([
        { id: 1, name: "Cash In Hand" },
        { id: 2, name: "Cash In Locker" },
        { id: 3, name: "Cash Online" },
      ], { onConflict: "id" });
    } catch {
      // Ignore if table doesn't support upsert or is pre-seeded
    }

    // Insert transfer record with fallback for schema differences
    const transferPayload: Record<string, any> = {
      transfer_date: tDate,
      from_account_id: fromId,
      to_account_id: toId,
      amount: amt,
      notes: notes || null,
      entered_by: entered_by || "Zain",
    };

    let { data: transfer, error: tErr } = await supabase
      .from("cash_transfers")
      .insert([transferPayload])
      .select()
      .single();

    if (tErr && tErr.message?.includes("column")) {
      const fallbackPayload = {
        transfer_date: tDate,
        from_account_id: fromId,
        to_account_id: toId,
        amount: amt,
        notes: notes || null,
      };
      const retryRes = await supabase
        .from("cash_transfers")
        .insert([fallbackPayload])
        .select()
        .single();
      transfer = retryRes.data;
      tErr = retryRes.error;
    }

    if (tErr) {
      return NextResponse.json({ error: tErr.message }, { status: 400 });
    }

    const transferId = transfer?.id || null;

    // Ledger entries (out from from_account, in to to_account)
    await supabase.from("cash_ledger").insert([
      {
        entry_date: tDate,
        account_id: fromId,
        amount: amt,
        type: "out",
        direction: "out",
        source_type: "transfer",
        source_id: transferId,
        description: `Transfer to account #${toId}${notes ? ` (${notes})` : ""}`,
        reference_type: "transfer",
        reference_id: transferId,
        entered_by: entered_by || "Zain",
      },
      {
        entry_date: tDate,
        account_id: toId,
        amount: amt,
        type: "in",
        direction: "in",
        source_type: "transfer",
        source_id: transferId,
        description: `Transfer from account #${fromId}${notes ? ` (${notes})` : ""}`,
        reference_type: "transfer",
        reference_id: transferId,
        entered_by: entered_by || "Zain",
      },
    ]);

    return NextResponse.json({ success: true, transfer });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
