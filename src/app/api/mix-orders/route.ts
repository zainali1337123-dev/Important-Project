import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const page = Number(searchParams.get("page")) || 1;
    const pageSize = Number(searchParams.get("pageSize")) || 20;

    let query = supabase
      .from("mix_orders")
      .select("*, customers(*)", { count: "exact" })
      .order("order_date", { ascending: false })
      .order("id", { ascending: false });

    if (page && pageSize) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    }

    const { data: orders, error, count } = await query;
    if (error) {
      return NextResponse.json({ orders: [], salesByMix: {}, total: 0, error: error.message }, { status: 200 });
    }

    const orderIds = (orders || []).map((o: any) => o.id);
    let salesByMix: Record<string | number, any[]> = {};

    if (orderIds.length > 0) {
      const { data: salesData } = await supabase
        .from("sales")
        .select("*, products(*)")
        .in("mix_order_id", orderIds.map(String));

      if (salesData) {
        for (const s of salesData) {
          const mixId = s.mix_order_id;
          if (mixId) {
            if (!salesByMix[mixId]) salesByMix[mixId] = [];
            salesByMix[mixId].push(s);
          }
        }
      }
    }

    return NextResponse.json({
      orders: orders || [],
      salesByMix,
      total: count || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ orders: [], salesByMix: {}, total: 0, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const {
      customer_id,
      order_date,
      target_weight_kg,
      items,
      cash_received,
      driver_name,
      driver_rent,
    } = body;

    if (!customer_id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    // Insert mix order record
    const { data: mixOrder, error: orderErr } = await supabase
      .from("mix_orders")
      .insert([
        {
          customer_id,
          order_date: order_date || new Date().toISOString().split("T")[0],
          target_weight_kg: Number(target_weight_kg) || 0,
          driver_name: driver_name || null,
          driver_rent: Number(driver_rent) || 0,
        },
      ])
      .select()
      .single();

    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 400 });
    }

    // Insert sales lines for each ingredient
    if (items && Array.isArray(items) && items.length > 0) {
      const salesRows = items.map((it: any, index: number) => ({
        customer_id,
        product_id: it.product_id,
        quantity: Number(it.quantity) || 0,
        rate_per_bag: Number(it.rate_per_kg) || 0,
        unit_type: "kg",
        bag_weight_kg: 1,
        sale_date: order_date || new Date().toISOString().split("T")[0],
        cash_received: index === 0 ? Number(cash_received) || 0 : 0,
        location_id: 2,
        mix_order_id: String(mixOrder.id),
        entered_by: "Zain",
      }));

      await supabase.from("sales").insert(salesRows);
    }

    return NextResponse.json({ success: true, mixOrder });
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
      return NextResponse.json({ error: "Mix Order ID is required" }, { status: 400 });
    }

    // Delete associated sales lines
    await supabase.from("sales").delete().eq("mix_order_id", id);
    const { error } = await supabase.from("mix_orders").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
