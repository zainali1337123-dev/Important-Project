import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = supabase.from("expenses").select("*").order("expense_date", { ascending: false }).order("id", { ascending: false });

    if (date) query = query.eq("expense_date", date);
    if (from) query = query.gte("expense_date", from);
    if (to) query = query.lte("expense_date", to);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ expenses: [], error: error.message }, { status: 200 });
    }

    return NextResponse.json({ expenses: data || [] });
  } catch (err: any) {
    return NextResponse.json({ expenses: [], error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { description, amount, expense_date } = body;

    if (!description?.trim() || !amount) {
      return NextResponse.json({ error: "Description and amount are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("expenses")
      .insert([
        {
          description: description.trim(),
          amount: Number(amount) || 0,
          expense_date: expense_date || new Date().toISOString().split("T")[0],
          entered_by: "Zain",
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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

    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
