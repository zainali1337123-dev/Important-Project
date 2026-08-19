import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const supplierId = searchParams.get("supplier_id");
    const locationId = searchParams.get("location_id");

    let query = supabase
      .from("purchases")
      .select("*, products(*), suppliers(*), customers(*)")
      .order("purchase_date", { ascending: false })
      .order("id", { ascending: false });

    if (date) query = query.eq("purchase_date", date);
    if (supplierId) query = query.eq("supplier_id", supplierId);
    if (locationId) query = query.eq("location_id", locationId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ purchases: [], error: error.message }, { status: 200 });
    }

    return NextResponse.json({ purchases: data || [] });
  } catch (err: any) {
    return NextResponse.json({ purchases: [], error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const {
      purchase_date,
      product_id,
      quantity,
      rate_per_bag,
      supplier_id,
      settled_by_customer_id,
      cash_paid,
      location_id,
      notes,
      unit_type,
      bag_weight_kg,
    } = body;

    if (!product_id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("purchases")
      .insert([
        {
          purchase_date: purchase_date || new Date().toISOString().split("T")[0],
          product_id,
          quantity: Number(quantity) || 0,
          rate_per_bag: Number(rate_per_bag) || 0,
          supplier_id: supplier_id || null,
          settled_by_customer_id: settled_by_customer_id || null,
          cash_paid: Number(cash_paid) || 0,
          location_id: location_id ? Number(location_id) : 2,
          notes: notes || null,
          unit_type: unit_type || "bags",
          bag_weight_kg: bag_weight_kg ? Number(bag_weight_kg) : 40,
          entered_by: "Zain",
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ purchase: data });
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
      return NextResponse.json({ error: "Purchase ID is required" }, { status: 400 });
    }

    const { error } = await supabase.from("purchases").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
