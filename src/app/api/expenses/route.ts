import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || searchParams.get("expense_date");
    const locationId = searchParams.get("location_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = searchParams.get("page");
    const pageSize = searchParams.get("pageSize");

    let query = supabase
      .from("expenses")
      .select("*, locations(*)", { count: "exact" })
      .order("expense_date", { ascending: false })
      .order("id", { ascending: false });

    if (date) {
      query = query.eq("expense_date", date);
    }
    if (from) {
      query = query.gte("expense_date", from);
    }
    if (to) {
      query = query.lte("expense_date", to);
    }
    if (locationId && locationId !== "all") {
      query = query.eq("location_id", locationId);
    }

    if (page && pageSize) {
      const p = Number(page) || 1;
      const ps = Number(pageSize) || 20;
      const fromIdx = (p - 1) * ps;
      const toIdx = fromIdx + ps - 1;
      query = query.range(fromIdx, toIdx);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ expenses: [], total: 0, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ expenses: data || [], total: count || 0 });
  } catch (err: any) {
    return NextResponse.json({ expenses: [], total: 0, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { description, amount, category, expense_date, date, location_id, location } = body;

    if (!description?.trim() || !amount) {
      return NextResponse.json({ error: "Description and amount are required" }, { status: 400 });
    }

    const effectiveDate = expense_date || date || new Date().toISOString().split("T")[0];
    let locId = location_id ? Number(location_id) : 2;
    if (!locId && location) {
      locId = location.toLowerCase().includes("farm") ? 1 : 2;
    }
    const locName = locId === 1 ? "Farm" : "Shop";
    const amt = Number(amount) || 0;

    const { data, error } = await supabase
      .from("expenses")
      .insert([
        {
          description: description.trim(),
          amount: amt,
          category: category || "General",
          expense_date: effectiveDate,
          date: effectiveDate,
          location_id: locId,
          location: locName,
          entered_by: "Zain",
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Insert Cash Ledger outflow
    if (amt > 0 && data) {
      await supabase.from("cash_ledger").insert([
        {
          entry_date: effectiveDate,
          date: effectiveDate,
          account_id: 1, // Cash in Hand
          location_id: locId,
          location: locName,
          type: "out",
          direction: "out",
          amount: amt,
          source_type: "expense",
          source_id: data.id,
          description: `Expense: ${description.trim()}`,
          entered_by: "Zain",
        },
      ]);
    }

    return NextResponse.json({ expense: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { id, description, amount, category, expense_date, location_id, location } = body;

    if (!id) {
      return NextResponse.json({ error: "Expense ID is required" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (description !== undefined) updateData.description = description.trim();
    if (amount !== undefined) updateData.amount = Number(amount);
    if (category !== undefined) updateData.category = category;
    if (expense_date !== undefined) {
      updateData.expense_date = expense_date;
      updateData.date = expense_date;
    }
    if (location_id !== undefined) {
      updateData.location_id = Number(location_id);
      updateData.location = Number(location_id) === 1 ? "Farm" : "Shop";
    } else if (location !== undefined) {
      updateData.location = location;
      updateData.location_id = location.toLowerCase().includes("farm") ? 1 : 2;
    }

    const { data, error } = await supabase.from("expenses").update(updateData).eq("id", id).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Update Cash Ledger if amount changed
    if (amount !== undefined || description !== undefined) {
      const ledgerUpdate: Record<string, any> = {};
      if (amount !== undefined) ledgerUpdate.amount = Number(amount);
      if (description !== undefined) ledgerUpdate.description = `Expense: ${description.trim()}`;
      await supabase
        .from("cash_ledger")
        .update(ledgerUpdate)
        .eq("source_type", "expense")
        .eq("source_id", id);
    }

    return NextResponse.json({ expense: data });
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
      return NextResponse.json({ error: "Expense ID is required" }, { status: 400 });
    }

    // Clean up cash ledger entry
    await supabase
      .from("cash_ledger")
      .delete()
      .eq("source_type", "expense")
      .eq("source_id", id);

    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
