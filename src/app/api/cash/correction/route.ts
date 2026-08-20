import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = supabase
      .from("cash_ledger")
      .select("*, cash_accounts(*)")
      .eq("source_type", "correction")
      .order("entry_date", { ascending: false })
      .order("id", { ascending: false });

    if (from) query = query.gte("entry_date", from);
    if (to) query = query.lte("entry_date", to);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ corrections: [], error: error.message }, { status: 200 });
    }

    const rows = (data || []).map((entry: any) => ({
      id: entry.id,
      entry_date: entry.entry_date,
      account_id: entry.account_id,
      account_name: entry.cash_accounts?.name || (entry.account_id === 2 ? "Cash In Locker" : entry.account_id === 3 ? "Cash Online" : "Cash In Hand"),
      direction: entry.direction || (entry.type === "out" ? "out" : "in"),
      amount: Number(entry.amount) || 0,
      description: entry.description || "",
      entered_by: entry.entered_by || "Admin",
      created_at: entry.created_at,
    }));

    return NextResponse.json({ corrections: rows });
  } catch (err: any) {
    return NextResponse.json({ corrections: [], error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { account_id, account_name, direction, amount, description, reason, entry_date } = body;

    const amt = Number(amount) || 0;
    if (amt <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }

    let accId = Number(account_id);
    if (!accId && account_name) {
      if (account_name === "Cash In Locker" || account_name === "Farmhouse Cash Drawer") accId = 2;
      else if (account_name === "Cash Online" || account_name === "Bank Account") accId = 3;
      else accId = 1; // Cash In Hand / Shop
    }
    if (!accId) accId = 1;

    const desc = reason || description || "Manual cash correction";
    const dir = direction === "out" ? "out" : "in";
    const date = entry_date || new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("cash_ledger")
      .insert([
        {
          entry_date: date,
          account_id: accId,
          amount: amt,
          direction: dir,
          type: dir,
          description: desc,
          source_type: "correction",
          entered_by: "Zain",
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, correction: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const body = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Correction ID is required" }, { status: 400 });
    }

    const { amount, direction, description, entry_date, account_id } = body;
    const updateData: Record<string, any> = {};

    if (amount !== undefined) updateData.amount = Number(amount);
    if (direction !== undefined) {
      updateData.direction = direction;
      updateData.type = direction;
    }
    if (description !== undefined) updateData.description = description;
    if (entry_date !== undefined) updateData.entry_date = entry_date;
    if (account_id !== undefined) updateData.account_id = Number(account_id);

    const { data, error } = await supabase
      .from("cash_ledger")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, correction: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Correction ID is required" }, { status: 400 });
    }

    const { error } = await supabase.from("cash_ledger").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
