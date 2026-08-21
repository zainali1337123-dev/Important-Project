import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("location_id");

    let query = supabase
      .from("product_stock")
      .select("*, products(*)");

    if (locationId && locationId !== "all") {
      query = query.eq("location_id", locationId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ stock: [], error: error.message }, { status: 200 });
    }

    return NextResponse.json({ stock: data || [] });
  } catch (err: any) {
    return NextResponse.json({ stock: [], error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleStockUpsert(request);
}

export async function PUT(request: NextRequest) {
  return handleStockUpsert(request);
}

async function handleStockUpsert(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { product_id, location_id, stock_quantity, last_bag_weight_kg } = body;

    if (!product_id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const locId = location_id !== undefined && location_id !== null ? Number(location_id) : 2;
    const qty = Number(stock_quantity) || 0;
    const bw = last_bag_weight_kg ? Number(last_bag_weight_kg) : 40;
    const locName = locId === 1 ? "Farm" : "Shop";

    // Ensure locations exist
    try {
      await supabase.from("locations").upsert([
        { id: 1, name: "Farm", is_active: true },
        { id: 2, name: "Shop", is_active: true },
      ], { onConflict: "id" });
    } catch {
      // ignore
    }

    // Check for existing record
    const { data: existing } = await supabase
      .from("product_stock")
      .select("id")
      .eq("product_id", product_id)
      .eq("location_id", locId)
      .maybeSingle();

    let resultStock: any = null;

    if (existing) {
      let { data, error } = await supabase
        .from("product_stock")
        .update({
          stock_quantity: qty,
          last_bag_weight_kg: bw,
          location: locName,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error && (error.message?.includes("location") || error.message?.includes("column"))) {
        const retry = await supabase
          .from("product_stock")
          .update({
            stock_quantity: qty,
            last_bag_weight_kg: bw,
          })
          .eq("id", existing.id)
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      resultStock = data;
    } else {
      let { data, error } = await supabase
        .from("product_stock")
        .insert({
          product_id,
          location_id: locId,
          location: locName,
          stock_quantity: qty,
          last_bag_weight_kg: bw,
        })
        .select()
        .single();

      if (error && (error.message?.includes("location") || error.message?.includes("column"))) {
        const retry = await supabase
          .from("product_stock")
          .insert({
            product_id,
            location_id: locId,
            stock_quantity: qty,
            last_bag_weight_kg: bw,
          })
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      resultStock = data;
    }

    // Also update products table if stock_quantity column exists
    try {
      await supabase
        .from("products")
        .update({ stock_quantity: qty })
        .eq("id", product_id);
    } catch {
      // ignore if column does not exist
    }

    return NextResponse.json({ success: true, stock: resultStock });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

