import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const locationId = searchParams.get("location_id");
    const date = searchParams.get("date") || searchParams.get("order_date");
    const page = Number(searchParams.get("page")) || 1;
    const pageSize = Number(searchParams.get("pageSize")) || 20;

    let query = supabase
      .from("mix_orders")
      .select("*, customers(*)", { count: "exact" })
      .order("order_date", { ascending: false })
      .order("id", { ascending: false });

    if (date) query = query.eq("order_date", date);
    if (locationId && locationId !== "all") query = query.eq("location_id", locationId);

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
      date,
      location_id,
      location,
      target_weight_kg,
      items,
      cash_received,
      driver_name,
      driver_rent,
    } = body;

    if (!customer_id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const effectiveDate = order_date || date || new Date().toISOString().split("T")[0];
    let locId = location_id ? Number(location_id) : 2;
    if (!locId && location) {
      locId = location.toLowerCase().includes("farm") ? 1 : 2;
    }
    const locName = locId === 1 ? "Farm" : "Shop";
    const cash = Number(cash_received) || 0;

    // Insert mix order record
    const { data: mixOrder, error: orderErr } = await supabase
      .from("mix_orders")
      .insert([
        {
          customer_id: Number(customer_id),
          order_date: effectiveDate,
          date: effectiveDate,
          location_id: locId,
          location: locName,
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

    // Insert sales lines for each ingredient & decrement stock
    if (items && Array.isArray(items) && items.length > 0) {
      const salesRows = items.map((it: any, index: number) => ({
        customer_id: Number(customer_id),
        product_id: Number(it.product_id),
        quantity: Number(it.quantity) || 0,
        rate_per_bag: Number(it.rate_per_kg) || 0,
        unit_type: "kg",
        bag_weight_kg: 1,
        sale_date: effectiveDate,
        date: effectiveDate,
        cash_received: index === 0 ? cash : 0,
        location_id: locId,
        location: locName,
        mix_order_id: String(mixOrder.id),
        entered_by: "Zain",
      }));

      await supabase.from("sales").insert(salesRows);

      // Decrement stock for ingredients (in kg)
      for (const it of items) {
        const prodId = Number(it.product_id);
        const qtyKg = Number(it.quantity) || 0;
        const { data: existing } = await supabase
          .from("product_stock")
          .select("*")
          .eq("product_id", prodId)
          .eq("location_id", locId)
          .maybeSingle();

        if (existing) {
          const bagWt = Number(existing.last_bag_weight_kg) || 40;
          const bagsUsed = qtyKg / bagWt;
          const newStock = Math.max(0, (Number(existing.stock_quantity) || 0) - bagsUsed);
          await supabase.from("product_stock").update({ stock_quantity: newStock }).eq("id", existing.id);
        }
      }
    }

    // Record cash inflow if cash was paid
    if (cash > 0 && mixOrder) {
      await supabase.from("cash_ledger").insert([
        {
          entry_date: effectiveDate,
          date: effectiveDate,
          account_id: 1, // Cash in Hand
          location_id: locId,
          location: locName,
          type: "in",
          direction: "in",
          amount: cash,
          source_type: "sale",
          source_id: mixOrder.id,
          description: `Cash received from Custom Mix Order #${mixOrder.id}`,
          entered_by: "Zain",
        },
      ]);
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

    // Delete associated sales lines & ledger
    await supabase.from("sales").delete().eq("mix_order_id", id);
    await supabase.from("cash_ledger").delete().eq("source_id", id).in("source_type", ["sale", "mix_order"]);
    const { error } = await supabase.from("mix_orders").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
