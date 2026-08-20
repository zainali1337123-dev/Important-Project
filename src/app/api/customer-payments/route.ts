import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || searchParams.get("payment_date");
    const customerId = searchParams.get("customer_id");
    const locationId = searchParams.get("location_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = searchParams.get("page");
    const pageSize = searchParams.get("pageSize");

    let query = supabase
      .from("customer_payments")
      .select("*, customers(*), locations(*)", { count: "exact" })
      .order("payment_date", { ascending: false })
      .order("id", { ascending: false });

    if (date) {
      query = query.eq("payment_date", date);
    }
    if (from) {
      query = query.gte("payment_date", from);
    }
    if (to) {
      query = query.lte("payment_date", to);
    }
    if (customerId) {
      query = query.eq("customer_id", customerId);
    }
    if (locationId && locationId !== "all") {
      query = query.eq("location_id", locationId);
    }

    if (page && pageSize) {
      const p = Number(page) || 1;
      const ps = Number(pageSize) || 20;
      const fromIdx = (p - 1) * ps;
      const toIdx = fromIdx + ps - 1;
      query = query.range(fromIdx, toIdx);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ payments: [], total: 0, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ payments: data || [], total: count || 0 });
  } catch (err: any) {
    return NextResponse.json({ payments: [], total: 0, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const {
      customer_id,
      payment_date,
      date,
      location_id,
      location,
      amount,
      notes,
      applied_to_opening,
      applied_to_advance,
    } = body;

    if (!customer_id || !amount) {
      return NextResponse.json({ error: "Customer ID and amount are required" }, { status: 400 });
    }

    const effectiveDate = payment_date || date || new Date().toISOString().split("T")[0];
    let locId = location_id ? Number(location_id) : 2;
    if (!locId && location) {
      locId = location.toLowerCase().includes("farm") ? 1 : 2;
    }
    const locName = locId === 1 ? "Farm" : "Shop";
    const amt = Number(amount) || 0;

    const { data, error } = await supabase
      .from("customer_payments")
      .insert([
        {
          customer_id: Number(customer_id),
          amount: amt,
          payment_date: effectiveDate,
          date: effectiveDate,
          location_id: locId,
          location: locName,
          applied_to_opening: Number(applied_to_opening) || 0,
          applied_to_advance: Number(applied_to_advance) || 0,
          notes: notes || null,
          entered_by: "Zain",
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Insert Cash Ledger inflow
    if (amt > 0 && data) {
      await supabase.from("cash_ledger").insert([
        {
          entry_date: effectiveDate,
          date: effectiveDate,
          account_id: 1, // Cash in Hand
          location_id: locId,
          location: locName,
          type: "in",
          direction: "in",
          amount: amt,
          source_type: "customer_payment",
          source_id: data.id,
          description: `Customer payment received: ${notes || "Payment from customer #" + customer_id}`,
          entered_by: "Zain",
        },
      ]);
    }

    // If applied_to_advance, increase customer's advance_payment
    if (applied_to_advance && Number(applied_to_advance) > 0) {
      const { data: cust } = await supabase
        .from("customers")
        .select("advance_payment")
        .eq("id", customer_id)
        .single();
      if (cust) {
        const newAdv = (Number(cust.advance_payment) || 0) + Number(applied_to_advance);
        await supabase.from("customers").update({ advance_payment: newAdv }).eq("id", customer_id);
      }
    }

    return NextResponse.json({ payment: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await request.json();
    const { id, amount, notes, payment_date, location_id, location } = body;

    if (!id) {
      return NextResponse.json({ error: "Payment ID is required" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (amount !== undefined) updateData.amount = Number(amount);
    if (notes !== undefined) updateData.notes = notes;
    if (payment_date !== undefined) {
      updateData.payment_date = payment_date;
      updateData.date = payment_date;
    }
    if (location_id !== undefined) {
      updateData.location_id = Number(location_id);
      updateData.location = Number(location_id) === 1 ? "Farm" : "Shop";
    } else if (location !== undefined) {
      updateData.location = location;
      updateData.location_id = location.toLowerCase().includes("farm") ? 1 : 2;
    }

    const { data, error } = await supabase
      .from("customer_payments")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (amount !== undefined) {
      await supabase
        .from("cash_ledger")
        .update({ amount: Number(amount) })
        .eq("source_type", "customer_payment")
        .eq("source_id", id);
    }

    return NextResponse.json({ payment: data });
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
      return NextResponse.json({ error: "Payment ID is required" }, { status: 400 });
    }

    // Clean up cash ledger entry
    await supabase
      .from("cash_ledger")
      .delete()
      .eq("source_type", "customer_payment")
      .eq("source_id", id);

    const { error } = await supabase.from("customer_payments").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
