import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id");
    const date = searchParams.get("payment_date");

    let query = supabase
      .from("customer_payments")
      .select("*, customers(*)")
      .order("payment_date", { ascending: false })
      .order("id", { ascending: false });

    if (customerId) query = query.eq("customer_id", customerId);
    if (date) query = query.eq("payment_date", date);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ payments: [], error: error.message }, { status: 200 });
    }

    return NextResponse.json({ payments: data || [] });
  } catch (err: any) {
    return NextResponse.json({ payments: [], error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const {
      customer_id,
      payment_date,
      amount,
      applied_to_opening,
      applied_to_advance,
      notes,
    } = body;

    if (!customer_id || !amount) {
      return NextResponse.json({ error: "Customer ID and amount are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("customer_payments")
      .insert([
        {
          customer_id,
          payment_date: payment_date || new Date().toISOString().split("T")[0],
          amount: Number(amount) || 0,
          applied_to_opening: Number(applied_to_opening) || 0,
          applied_to_advance: Number(applied_to_advance) || 0,
          notes: notes || null,
          entered_by: "Zain",
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ payment: data });
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
      return NextResponse.json({ error: "Payment ID is required" }, { status: 400 });
    }

    const { error } = await supabase.from("customer_payments").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
