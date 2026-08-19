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
    const { transfer_date, from_account_id, to_account_id, amount, notes } = body;

    if (!from_account_id || !to_account_id || !amount) {
      return NextResponse.json({ error: "From account, To account, and amount are required" }, { status: 400 });
    }

    const amt = Number(amount);
    const tDate = transfer_date || new Date().toISOString().split("T")[0];

    // Insert transfer record
    const { data: transfer, error: tErr } = await supabase
      .from("cash_transfers")
      .insert([
        {
          transfer_date: tDate,
          from_account_id,
          to_account_id,
          amount: amt,
          notes: notes || null,
        },
      ])
      .select()
      .single();

    if (tErr) {
      return NextResponse.json({ error: tErr.message }, { status: 400 });
    }

    // Ledger entries (out from from_account, in to to_account)
    await supabase.from("cash_ledger").insert([
      {
        entry_date: tDate,
        account_id: from_account_id,
        amount: amt,
        type: "out",
        description: `Transfer to account #${to_account_id}`,
        reference_type: "transfer",
        reference_id: transfer.id,
      },
      {
        entry_date: tDate,
        account_id: to_account_id,
        amount: amt,
        type: "in",
        description: `Transfer from account #${from_account_id}`,
        reference_type: "transfer",
        reference_id: transfer.id,
      },
    ]);

    return NextResponse.json({ success: true, transfer });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
