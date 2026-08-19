import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";

    let query = supabase.from("labours").select("*, locations(*)").order("name", { ascending: true });
    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ labours: [], error: error.message }, { status: 200 });
    }

    return NextResponse.json({ labours: data || [] });
  } catch (err: any) {
    return NextResponse.json({ labours: [], error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { name, phone, role, daily_wage, location_id, is_active } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Labour name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("labours")
      .insert([
        {
          name: name.trim(),
          phone: phone ? String(phone).trim() : null,
          role: role || null,
          daily_wage: Number(daily_wage) || 0,
          location_id: location_id ? Number(location_id) : 2,
          is_active: is_active ?? true,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ labour: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { id, name, phone, role, daily_wage, location_id, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: "Labour ID is required" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone ? String(phone).trim() : null;
    if (role !== undefined) updateData.role = role;
    if (daily_wage !== undefined) updateData.daily_wage = Number(daily_wage);
    if (location_id !== undefined) updateData.location_id = Number(location_id);
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase.from("labours").update(updateData).eq("id", id).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ labour: data });
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
      return NextResponse.json({ error: "Labour ID is required" }, { status: 400 });
    }

    const { error } = await supabase.from("labours").update({ is_active: false }).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
