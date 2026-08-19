import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const labourId = searchParams.get("labour_id");
    const paymentDate = searchParams.get("payment_date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const type = searchParams.get("type");

    let query = supabase
      .from("labour_payments")
      .select("*, labours(*)")
      .order("payment_date", { ascending: false })
      .order("id", { ascending: false });

    if (labourId) query = query.eq("labour_id", labourId);
    if (paymentDate) query = query.eq("payment_date", paymentDate);
    if (from) query = query.gte("payment_date", from);
    if (to) query = query.lte("payment_date", to);
    if (type) query = query.eq("payment_type", type);

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
    const { labour_id, payment_date, amount, payment_type, description } = body;

    if (!labour_id || !amount) {
      return NextResponse.json({ error: "Labour ID and amount are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("labour_payments")
      .insert([
        {
          labour_id,
          payment_date: payment_date || new Date().toISOString().split("T")[0],
          amount: Number(amount) || 0,
          payment_type: payment_type || "salary",
          description: description || null,
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

    const { error } = await supabase.from("labour_payments").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
