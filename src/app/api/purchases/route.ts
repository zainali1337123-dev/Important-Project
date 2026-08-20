import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || searchParams.get("purchase_date");
    const supplierId = searchParams.get("supplier_id");
    const customerId = searchParams.get("customer_id");
    const locationId = searchParams.get("location_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = searchParams.get("page");
    const pageSize = searchParams.get("pageSize") || searchParams.get("page_size");

    let query = supabase
      .from("purchases")
      .select("*, products(*), suppliers(*), customers(*), locations(*)", { count: "exact" })
      .order("purchase_date", { ascending: false })
      .order("id", { ascending: false });

    if (date) query = query.eq("purchase_date", date);
    if (from) query = query.gte("purchase_date", from);
    if (to) query = query.lte("purchase_date", to);
    if (supplierId) query = query.eq("supplier_id", supplierId);
    if (customerId) query = query.eq("settled_by_customer_id", customerId);
    if (locationId && locationId !== "all") query = query.eq("location_id", locationId);

    if (page && pageSize) {
      const p = Number(page) || 1;
      const ps = Number(pageSize) || 20;
      const fromIdx = (p - 1) * ps;
      const toIdx = fromIdx + ps - 1;
      query = query.range(fromIdx, toIdx);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ purchases: [], rows: [], total: 0, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ purchases: data || [], rows: data || [], total: count || 0 });
  } catch (err: any) {
    return NextResponse.json({ purchases: [], rows: [], total: 0, error: err.message }, { status: 500 });
  }
}

// Helper: Increment inventory stock on purchase
async function incrementProductStock(
  supabase: any,
  productId: number,
  locationId: number,
  quantity: number,
  unitType: string,
  bagWeightKg: number
) {
  try {
    const qtyBags = unitType === "kg" ? quantity / (bagWeightKg || 40) : quantity;
    const locName = locationId === 1 ? "Farm" : "Shop";

    const { data: existing } = await supabase
      .from("product_stock")
      .select("*")
      .eq("product_id", productId)
      .eq("location_id", locationId)
      .maybeSingle();

    if (existing) {
      const newStock = (Number(existing.stock_quantity) || 0) + qtyBags;
      await supabase
        .from("product_stock")
        .update({
          stock_quantity: newStock,
          last_bag_weight_kg: bagWeightKg || existing.last_bag_weight_kg || 40,
          location: locName,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("product_stock").insert([
        {
          product_id: productId,
          location_id: locationId,
          location: locName,
          stock_quantity: qtyBags,
          last_bag_weight_kg: bagWeightKg || 40,
        },
      ]);
    }
  } catch (err) {
    console.error("Failed to increment product stock on purchase:", err);
  }
}

// Helper: Decrement stock on purchase delete
async function decrementProductStock(
  supabase: any,
  productId: number,
  locationId: number,
  quantity: number,
  unitType: string,
  bagWeightKg: number
) {
  try {
    const qtyBags = unitType === "kg" ? quantity / (bagWeightKg || 40) : quantity;
    const { data: existing } = await supabase
      .from("product_stock")
      .select("*")
      .eq("product_id", productId)
      .eq("location_id", locationId)
      .maybeSingle();

    if (existing) {
      const newStock = Math.max(0, (Number(existing.stock_quantity) || 0) - qtyBags);
      await supabase.from("product_stock").update({ stock_quantity: newStock }).eq("id", existing.id);
    }
  } catch (err) {
    console.error("Failed to decrement product stock on purchase revert:", err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const {
      purchase_date,
      date,
      product_id,
      quantity,
      rate_per_bag,
      supplier_id,
      settled_by_customer_id,
      cash_paid,
      location_id,
      location,
      notes,
      remarks,
      unit_type,
      bag_weight_kg,
    } = body;

    if (!product_id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const effectiveDate = purchase_date || date || new Date().toISOString().split("T")[0];
    let locId = location_id ? Number(location_id) : 2;
    if (!locId && location) {
      locId = location.toLowerCase().includes("farm") ? 1 : 2;
    }
    const locName = locId === 1 ? "Farm" : "Shop";
    const cash = Number(cash_paid) || 0;
    const qty = Number(quantity) || 0;
    const rate = Number(rate_per_bag) || 0;

    const { data, error } = await supabase
      .from("purchases")
      .insert([
        {
          purchase_date: effectiveDate,
          date: effectiveDate,
          product_id: Number(product_id),
          quantity: qty,
          rate_per_bag: rate,
          supplier_id: supplier_id ? Number(supplier_id) : null,
          settled_by_customer_id: settled_by_customer_id ? Number(settled_by_customer_id) : null,
          cash_paid: cash,
          location_id: locId,
          location: locName,
          notes: notes || remarks || null,
          remarks: notes || remarks || null,
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

    // Increment stock
    await incrementProductStock(
      supabase,
      Number(product_id),
      locId,
      qty,
      unit_type || "bags",
      bag_weight_kg ? Number(bag_weight_kg) : 40
    );

    // Record cash outflow if cash was paid
    if (cash > 0 && data) {
      await supabase.from("cash_ledger").insert([
        {
          entry_date: effectiveDate,
          date: effectiveDate,
          account_id: 1, // Cash in Hand
          location_id: locId,
          location: locName,
          type: "out",
          direction: "out",
          amount: cash,
          source_type: "purchase",
          source_id: data.id,
          description: `Purchase stock payment for product #${product_id}`,
          entered_by: "Zain",
        },
      ]);
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

    const { data: purchase } = await supabase.from("purchases").select("*").eq("id", id).single();
    if (purchase) {
      await decrementProductStock(
        supabase,
        Number(purchase.product_id),
        Number(purchase.location_id) || 2,
        Number(purchase.quantity) || 0,
        purchase.unit_type || "bags",
        purchase.bag_weight_kg || 40
      );

      await supabase
        .from("cash_ledger")
        .delete()
        .eq("source_type", "purchase")
        .eq("source_id", id);
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
