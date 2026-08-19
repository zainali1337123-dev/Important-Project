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
    const { name, type, phone, opening_balance, advance_payment } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("customers")
      .insert([
        {
          name: name.trim(),
          type: type || "credit",
          phone: phone ? String(phone).trim() : null,
          opening_balance: Number(opening_balance) || 0,
          advance_payment: Number(advance_payment) || 0,
          is_active: true,
        },
      ])
      .select()
      .single();

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
    const { id, name, type, phone, opening_balance, advance_payment, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (type !== undefined) updateData.type = type;
    if (phone !== undefined) updateData.phone = phone ? String(phone).trim() : null;
    if (opening_balance !== undefined) updateData.opening_balance = Number(opening_balance);
    if (advance_payment !== undefined) updateData.advance_payment = Number(advance_payment);
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from("customers")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

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
