import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

// Helper: Ensure locations are present to satisfy foreign keys
async function ensureLocations(supabase: any) {
  try {
    await supabase.from("locations").upsert([
      { id: 1, name: "Farm", is_active: true },
      { id: 2, name: "Shop", is_active: true },
    ], { onConflict: "id" });
  } catch {
    // ignore if table doesn't allow upsert
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
  const qtyBags = unitType === "kg" ? quantity / (bagWeightKg || 40) : quantity;
  const locId = Number(locationId) || 2;
  const locName = locId === 1 ? "Farm" : "Shop";

  await ensureLocations(supabase);

  // 1. Update or Insert product_stock (per location)
  const { data: existing, error: findErr } = await supabase
    .from("product_stock")
    .select("*")
    .eq("product_id", productId)
    .eq("location_id", locId)
    .maybeSingle();

  if (existing) {
    const newStock = (Number(existing.stock_quantity) || 0) + qtyBags;
    let { error: updateErr } = await supabase
      .from("product_stock")
      .update({
        stock_quantity: newStock,
        last_bag_weight_kg: bagWeightKg || existing.last_bag_weight_kg || 40,
        location: locName,
      })
      .eq("id", existing.id);

    // Fallback if 'location' column does not exist in schema cache
    if (updateErr && (updateErr.message?.includes("location") || updateErr.message?.includes("column"))) {
      const retry = await supabase
        .from("product_stock")
        .update({
          stock_quantity: newStock,
          last_bag_weight_kg: bagWeightKg || existing.last_bag_weight_kg || 40,
        })
        .eq("id", existing.id);
      updateErr = retry.error;
    }

    if (updateErr) {
      console.error("Failed to update product_stock:", updateErr);
      throw new Error(`Failed to update stock quantity: ${updateErr.message}`);
    }
  } else {
    let { error: insertErr } = await supabase
      .from("product_stock")
      .insert([
        {
          product_id: productId,
          location_id: locId,
          location: locName,
          stock_quantity: qtyBags,
          last_bag_weight_kg: bagWeightKg || 40,
        },
      ]);

    // Fallback if 'location' column does not exist in schema cache
    if (insertErr && (insertErr.message?.includes("location") || insertErr.message?.includes("column"))) {
      const retry = await supabase
        .from("product_stock")
        .insert([
          {
            product_id: productId,
            location_id: locId,
            stock_quantity: qtyBags,
            last_bag_weight_kg: bagWeightKg || 40,
          },
        ]);
      insertErr = retry.error;
    }

    if (insertErr) {
      console.error("Failed to insert product_stock:", insertErr);
      throw new Error(`Failed to insert stock record: ${insertErr.message}`);
    }
  }

  // 2. Also update products table if stock_quantity column is present
  try {
    const { data: prod } = await supabase
      .from("products")
      .select("id, stock_quantity")
      .eq("id", productId)
      .maybeSingle();

    if (prod && "stock_quantity" in prod) {
      const currentQty = Number(prod.stock_quantity) || 0;
      await supabase
        .from("products")
        .update({ stock_quantity: currentQty + qtyBags })
        .eq("id", productId);
    }
  } catch {
    // Column might not exist on products table, which is fine
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
  const qtyBags = unitType === "kg" ? quantity / (bagWeightKg || 40) : quantity;
  const locId = Number(locationId) || 2;

  // 1. Decrement in product_stock
  const { data: existing } = await supabase
    .from("product_stock")
    .select("*")
    .eq("product_id", productId)
    .eq("location_id", locId)
    .maybeSingle();

  if (existing) {
    const newStock = Math.max(0, (Number(existing.stock_quantity) || 0) - qtyBags);
    await supabase
      .from("product_stock")
      .update({ stock_quantity: newStock })
      .eq("id", existing.id);
  }

  // 2. Also decrement in products table if column exists
  try {
    const { data: prod } = await supabase
      .from("products")
      .select("id, stock_quantity")
      .eq("id", productId)
      .maybeSingle();

    if (prod && "stock_quantity" in prod) {
      const currentQty = Number(prod.stock_quantity) || 0;
      await supabase
        .from("products")
        .update({ stock_quantity: Math.max(0, currentQty - qtyBags) })
        .eq("id", productId);
    }
  } catch {
    // Column might not exist
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  let insertedPurchaseId: number | null = null;

  try {
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

    const insertPayload: Record<string, any> = {
      purchase_date: effectiveDate,
      product_id: Number(product_id),
      quantity: qty,
      rate_per_bag: rate,
      supplier_id: supplier_id ? Number(supplier_id) : null,
      settled_by_customer_id: settled_by_customer_id ? Number(settled_by_customer_id) : null,
      cash_paid: cash,
      location_id: locId,
      location: locName,
      notes: notes || remarks || null,
      unit_type: unit_type || "bags",
      bag_weight_kg: bag_weight_kg ? Number(bag_weight_kg) : 40,
      entered_by: "Zain",
    };

    let { data, error } = await supabase
      .from("purchases")
      .insert([insertPayload])
      .select()
      .single();

    // Fallback if schema doesn't have certain optional columns
    if (error && error.message?.includes("column")) {
      const simplifiedPayload = {
        purchase_date: effectiveDate,
        product_id: Number(product_id),
        quantity: qty,
        rate_per_bag: rate,
        supplier_id: supplier_id ? Number(supplier_id) : null,
        settled_by_customer_id: settled_by_customer_id ? Number(settled_by_customer_id) : null,
        cash_paid: cash,
        location_id: locId,
      };
      const retryResult = await supabase
        .from("purchases")
        .insert([simplifiedPayload])
        .select()
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to record purchase" }, { status: 400 });
    }

    insertedPurchaseId = data.id;

    // Mutate and increment inventory stock atomically
    try {
      await incrementProductStock(
        supabase,
        Number(product_id),
        locId,
        qty,
        unit_type || "bags",
        bag_weight_kg ? Number(bag_weight_kg) : 40
      );
    } catch (stockErr: any) {
      // Rollback purchase record if stock mutation failed
      if (insertedPurchaseId) {
        await supabase.from("purchases").delete().eq("id", insertedPurchaseId);
      }
      return NextResponse.json(
        { error: `Stock update failed: ${stockErr.message}. Transaction rolled back.` },
        { status: 500 }
      );
    }

    // Record cash outflow if cash was paid
    if (cash > 0 && data) {
      const desc = settled_by_customer_id
        ? `Cash paid for settlement purchase #${data.id}`
        : `Purchase stock payment for product #${product_id}`;

      await supabase.from("cash_ledger").insert([
        {
          entry_date: effectiveDate,
          account_id: 1, // Cash in Hand
          location_id: locId,
          location: locName,
          type: "out",
          direction: "out",
          amount: cash,
          source_type: "purchase",
          source_id: data.id,
          description: desc,
          entered_by: "Zain",
        },
      ]);
    }

    // Fetch updated stock for response
    const { data: updatedStock } = await supabase
      .from("product_stock")
      .select("*")
      .eq("product_id", Number(product_id))
      .eq("location_id", locId)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      purchase: data,
      stock: updatedStock,
    });
  } catch (err: any) {
    if (insertedPurchaseId) {
      await supabase.from("purchases").delete().eq("id", insertedPurchaseId);
    }
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
