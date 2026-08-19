import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const labourId = searchParams.get("labour_id");
    const wageDate = searchParams.get("wage_date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = supabase
      .from("labour_daily_wages")
      .select("*, labours(*)")
      .order("wage_date", { ascending: false })
      .order("id", { ascending: false });

    if (labourId) query = query.eq("labour_id", labourId);
    if (wageDate) query = query.eq("wage_date", wageDate);
    if (from) query = query.gte("wage_date", from);
    if (to) query = query.lte("wage_date", to);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ wages: [], error: error.message }, { status: 200 });
    }

    return NextResponse.json({ wages: data || [] });
  } catch (err: any) {
    return NextResponse.json({ wages: [], error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { labour_id, wage_date, amount, notes } = body;

    if (!labour_id || !amount) {
      return NextResponse.json({ error: "Labour ID and wage amount are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("labour_daily_wages")
      .insert([
        {
          labour_id,
          wage_date: wage_date || new Date().toISOString().split("T")[0],
          amount: Number(amount) || 0,
          notes: notes || null,
          entered_by: "Zain",
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ wage: data });
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
      return NextResponse.json({ error: "Wage ID is required" }, { status: 400 });
    }

    const { error } = await supabase.from("labour_daily_wages").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
