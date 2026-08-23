import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";
    const search = searchParams.get("search");
    const page = searchParams.get("page");
    const pageSize = searchParams.get("pageSize");

    let query = supabase.from("customers").select("*", { count: "exact" }).order("name", { ascending: true });

    if (activeOnly) {
      query = query.eq("is_active", true).is("deleted_at", null);
    } else {
      query = query.is("deleted_at", null);
    }

    if (search && search.trim()) {
      const s = search.trim();
      query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
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
      return NextResponse.json({ customers: [], count: 0, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ customers: data || [], total: count || 0 });
  } catch (err: any) {
    return NextResponse.json({ customers: [], total: 0, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { name, type, phone, opening_balance, advance_payment, credit_limit } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
    }

    const insertPayload: Record<string, any> = {
      name: name.trim(),
      type: type || "credit",
      phone: phone ? String(phone).trim() : null,
      opening_balance: Number(opening_balance) || 0,
      advance_payment: Number(advance_payment) || 0,
      credit_limit: credit_limit !== undefined && Number(credit_limit) >= 0 ? Number(credit_limit) : 3_000_000,
      is_active: true,
    };

    let { data, error } = await supabase
      .from("customers")
      .insert([insertPayload])
      .select()
      .single();

    if (error && error.message?.includes("credit_limit")) {
      delete insertPayload.credit_limit;
      const fb = await supabase.from("customers").insert([insertPayload]).select().single();
      data = fb.data;
      error = fb.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ customer: data, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { id, name, type, phone, opening_balance, advance_payment, credit_limit, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (type !== undefined) updateData.type = type;
    if (phone !== undefined) updateData.phone = phone ? String(phone).trim() : null;
    if (opening_balance !== undefined) updateData.opening_balance = Number(opening_balance);
    if (advance_payment !== undefined) updateData.advance_payment = Number(advance_payment);
    if (credit_limit !== undefined) updateData.credit_limit = Number(credit_limit) >= 0 ? Number(credit_limit) : 3_000_000;
    if (is_active !== undefined) updateData.is_active = is_active;

    let { data, error } = await supabase
      .from("customers")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error && error.message?.includes("credit_limit")) {
      delete updateData.credit_limit;
      const fb = await supabase.from("customers").update(updateData).eq("id", id).select().single();
      data = fb.data;
      error = fb.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ customer: data });
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
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("customers")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
