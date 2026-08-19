import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const customerId = searchParams.get("customer_id");
    const locationId = searchParams.get("location_id");
    const page = searchParams.get("page");
    const pageSize = searchParams.get("pageSize");

    let query = supabase
      .from("sales")
      .select("*, customers(*), products(*)", { count: "exact" })
      .order("sale_date", { ascending: false })
      .order("id", { ascending: false });

    if (date) {
      query = query.eq("sale_date", date);
    }
    if (customerId) {
      query = query.eq("customer_id", customerId);
    }
    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    if (page && pageSize) {
      const p = Number(page) || 1;
      const ps = Number(pageSize) || 20;
      const from = (p - 1) * ps;
      const to = from + ps - 1;
      query = query.range(from, to);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ sales: [], total: 0, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ sales: data || [], total: count || 0 });
  } catch (err: any) {
    return NextResponse.json({ sales: [], total: 0, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const {
      customer_id,
      product_id,
      quantity,
      rate_per_bag,
      rickshaw_fare,
      cash_received,
      sale_date,
      location_id,
      unit_type,
      bag_weight_kg,
      rickshaw_driver_name,
      rate_basis_weight,
      quoted_rate,
      transaction_group_id,
    } = body;

    if (!customer_id || !product_id) {
      return NextResponse.json({ error: "Customer ID and Product ID are required" }, { status: 400 });
    }

    const insertPayload = {
      customer_id,
      product_id,
      quantity: Number(quantity) || 0,
      rate_per_bag: Number(rate_per_bag) || 0,
      rickshaw_fare: Number(rickshaw_fare) || 0,
      cash_received: Number(cash_received) || 0,
      sale_date: sale_date || new Date().toISOString().split("T")[0],
      location_id: location_id ? Number(location_id) : 2,
      unit_type: unit_type || "bags",
      bag_weight_kg: bag_weight_kg ? Number(bag_weight_kg) : 40,
      rickshaw_driver_name: rickshaw_driver_name || null,
      rate_basis_weight: rate_basis_weight ? Number(rate_basis_weight) : null,
      quoted_rate: quoted_rate ? Number(quoted_rate) : null,
      transaction_group_id: transaction_group_id || null,
      entered_by: "Zain",
    };

    const { data, error } = await supabase.from("sales").insert([insertPayload]).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ sale: data });
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
      return NextResponse.json({ error: "Sale ID is required" }, { status: 400 });
    }

    const { error } = await supabase.from("sales").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
