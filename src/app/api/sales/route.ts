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
      items,
      product_id,
      quantity,
      rate_per_bag,
      rickshaw_fare,
      rickshaw_driver,
      rickshaw_driver_name,
      cash_received,
      sale_date,
      location_id,
      unit_type,
      bag_weight_kg,
      rate_basis_weight,
      quoted_rate,
      transaction_group_id,
      apply_advance,
    } = body;

    if (!customer_id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const effectiveDate = sale_date || new Date().toISOString().split("T")[0];
    const locId = location_id ? Number(location_id) : 2;
    const driverName = rickshaw_driver || rickshaw_driver_name || null;
    const fare = Number(rickshaw_fare) || 0;
    const cash = Number(cash_received) || 0;

    // Helper to sanitize payload for Supabase sales table
    const cleanSaleRow = (row: Record<string, any>) => {
      const clean: Record<string, any> = {
        customer_id: row.customer_id,
        product_id: row.product_id,
        quantity: row.quantity,
        rate_per_bag: row.rate_per_bag,
        unit_type: row.unit_type || "bags",
        bag_weight_kg: row.bag_weight_kg || 40,
        location_id: row.location_id || 2,
        sale_date: row.sale_date,
        transaction_group_id: row.transaction_group_id || null,
        entered_by: "Zain",
        rickshaw_fare: row.rickshaw_fare || 0,
        rickshaw_driver_name: row.rickshaw_driver_name || null,
        cash_received: row.cash_received || 0,
      };
      return clean;
    };

    // Case 1: Multi-item sale (from Cart in Daily Entry)
    if (items && Array.isArray(items) && items.length > 0) {
      const groupId = transaction_group_id || `group_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const insertRows = items.map((item: any, idx: number) =>
        cleanSaleRow({
          customer_id: Number(customer_id),
          product_id: Number(item.product_id),
          quantity: Number(item.quantity) || 0,
          rate_per_bag: Number(item.rate_per_bag || item.rate) || 0,
          unit_type: item.unit_type || "bags",
          bag_weight_kg: item.bag_weight_kg ? Number(item.bag_weight_kg) : 40,
          location_id: locId,
          sale_date: effectiveDate,
          transaction_group_id: groupId,
          rickshaw_fare: idx === 0 ? fare : 0,
          rickshaw_driver_name: idx === 0 ? driverName : null,
          cash_received: idx === 0 ? cash : 0,
        })
      );

      const { data, error } = await supabase.from("sales").insert(insertRows).select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      // If advance payment was applied, decrement customer's advance_payment
      if (apply_advance && Number(apply_advance) > 0) {
        const { data: cust } = await supabase.from("customers").select("advance_payment").eq("id", customer_id).single();
        if (cust) {
          const newAdv = Math.max(0, (Number(cust.advance_payment) || 0) - Number(apply_advance));
          await supabase.from("customers").update({ advance_payment: newAdv }).eq("id", customer_id);
        }
      }

      return NextResponse.json({ sales: data, sale: data?.[0], advance_consumed: apply_advance || 0 });
    }

    // Case 2: Single item sale
    if (!product_id) {
      return NextResponse.json({ error: "Customer ID and Product ID are required" }, { status: 400 });
    }

    const insertPayload = cleanSaleRow({
      customer_id: Number(customer_id),
      product_id: Number(product_id),
      quantity: Number(quantity) || 0,
      rate_per_bag: Number(rate_per_bag) || 0,
      rickshaw_fare: fare,
      cash_received: cash,
      sale_date: effectiveDate,
      location_id: locId,
      unit_type: unit_type || "bags",
      bag_weight_kg: bag_weight_kg ? Number(bag_weight_kg) : 40,
      rickshaw_driver_name: driverName,
      transaction_group_id: transaction_group_id || null,
    });

    const { data, error } = await supabase.from("sales").insert([insertPayload]).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ sale: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const {
      id,
      location_id,
      quantity,
      rate_per_bag,
      rickshaw_fare,
      rickshaw_driver_name,
      cash_received,
      sale_date,
      unit_type,
      bag_weight_kg,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Sale ID is required" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (location_id !== undefined) updateData.location_id = location_id;
    if (quantity !== undefined) updateData.quantity = Number(quantity);
    if (rate_per_bag !== undefined) updateData.rate_per_bag = Number(rate_per_bag);
    if (rickshaw_fare !== undefined) updateData.rickshaw_fare = Number(rickshaw_fare);
    if (rickshaw_driver_name !== undefined) updateData.rickshaw_driver_name = rickshaw_driver_name;
    if (cash_received !== undefined) updateData.cash_received = Number(cash_received);
    if (sale_date !== undefined) updateData.sale_date = sale_date;
    if (unit_type !== undefined) updateData.unit_type = unit_type;
    if (bag_weight_kg !== undefined) updateData.bag_weight_kg = bag_weight_kg;

    const { data, error } = await supabase.from("sales").update(updateData).eq("id", id).select().single();

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
