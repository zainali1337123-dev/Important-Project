import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || searchParams.get("payment_date");
    const customerId = searchParams.get("customer_id");
    const customerName = searchParams.get("customer_name") || searchParams.get("search");
    const locationId = searchParams.get("location_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = searchParams.get("page");
    const pageSize = searchParams.get("pageSize") || searchParams.get("page_size");

    let query = supabase
      .from("customer_payments")
      .select("*, customers(id, name, type, phone, opening_balance, advance_payment)", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (date) {
      query = query.or(`payment_date.eq.${date},date.eq.${date}`);
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
    if (locationId && locationId !== "all" && Number(locationId) > 0) {
      query = query.eq("location_id", locationId);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json(
        { payments: [], rows: [], total: 0, totalPages: 1, error: error.message },
        { status: 200 },
      );
    }

    let rows = data || [];

    // Filter by customer name or phone or notes if provided
    if (customerName && customerName.trim()) {
      const q = customerName.trim().toLowerCase();
      rows = rows.filter((r: any) => {
        const cName = (r.customers?.name || "").toLowerCase();
        const cPhone = (r.customers?.phone || "").toLowerCase();
        const notes = (r.notes || "").toLowerCase();
        return cName.includes(q) || cPhone.includes(q) || notes.includes(q);
      });
    }

    const total = rows.length;
    const p = Number(page) || 1;
    const ps = Number(pageSize) || (page ? 20 : Math.max(total, 1));
    const totalPages = Math.ceil(total / ps) || 1;

    if (page && pageSize) {
      const fromIdx = (p - 1) * ps;
      const toIdx = fromIdx + ps;
      rows = rows.slice(fromIdx, toIdx);
    }

    return NextResponse.json({
      payments: rows,
      rows: rows,
      total,
      totalPages,
      page: p,
      pageSize: ps,
    });
  } catch (err: any) {
    return NextResponse.json(
      { payments: [], rows: [], total: 0, totalPages: 1, error: err.message },
      { status: 500 },
    );
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
      payment_method,
      notes,
      applied_to_opening,
      applied_to_advance,
      entered_by,
    } = body;

    if (!customer_id || !amount) {
      return NextResponse.json({ error: "Customer ID and amount are required" }, { status: 400 });
    }

    const effectiveDate = payment_date || date || new Date().toISOString().split("T")[0];
    let locId = location_id ? Number(location_id) : 2;
    if (!locId && location) {
      locId = location.toLowerCase().includes("farm") ? 1 : 2;
    }
    const locName = location || (locId === 1 ? "Farm" : "Shop");
    const amt = Number(amount) || 0;
    const payMethod = payment_method || "Cash";
    const userEntered = entered_by || "Zain";

    // 1. Fetch current customer data
    const { data: customerData } = await supabase
      .from("customers")
      .select("id, name, opening_balance, advance_payment")
      .eq("id", customer_id)
      .single();

    const currentOpening = Number(customerData?.opening_balance) || 0;
    const currentAdvance = Number(customerData?.advance_payment) || 0;

    let toOpening = applied_to_opening !== undefined ? Number(applied_to_opening) : 0;
    let toAdvance = applied_to_advance !== undefined ? Number(applied_to_advance) : 0;

    if (applied_to_opening === undefined && applied_to_advance === undefined) {
      if (currentOpening > 0) {
        toOpening = Math.min(amt, currentOpening);
        toAdvance = Math.max(0, amt - currentOpening);
      } else {
        toOpening = 0;
        toAdvance = amt;
      }
    }

    // 1. Primary insert attempt with full tracking columns
    const fullPayload: Record<string, any> = {
      customer_id: Number(customer_id),
      amount: amt,
      payment_date: effectiveDate,
      date: effectiveDate,
      location_id: locId,
      location: locName,
      payment_method: payMethod,
      applied_to_opening: toOpening,
      applied_to_advance: toAdvance,
      notes: notes || null,
      entered_by: userEntered,
    };

    let data: any = null;
    let error: any = null;

    const primaryRes = await supabase
      .from("customer_payments")
      .insert([fullPayload])
      .select("*, customers(id, name, type, phone)")
      .single();

    data = primaryRes.data;
    error = primaryRes.error;

    // 2. Fallback: If table is missing extended tracking columns (location_id, applied_to_*, etc.)
    if (error) {
      const fallbackPayload = {
        customer_id: Number(customer_id),
        amount: amt,
        payment_date: effectiveDate,
        date: effectiveDate,
        location: locName,
        payment_method: payMethod,
        notes: notes || null,
        entered_by: userEntered,
      };

      const fallbackRes = await supabase
        .from("customer_payments")
        .insert([fallbackPayload])
        .select("*, customers(id, name, type, phone)")
        .single();

      if (fallbackRes.error) {
        // 3. Fallback: If table is missing payment_method, payment_date, or entered_by
        const standardPayload = {
          customer_id: Number(customer_id),
          amount: amt,
          date: effectiveDate,
          location: locName,
          notes: notes || null,
        };

        const standardRes = await supabase
          .from("customer_payments")
          .insert([standardPayload])
          .select("*, customers(id, name, type, phone)")
          .single();

        if (standardRes.error) {
          // 4. Absolute minimal fallback
          const barePayload = {
            customer_id: Number(customer_id),
            amount: amt,
            date: effectiveDate,
          };
          const bareRes = await supabase
            .from("customer_payments")
            .insert([barePayload])
            .select("*, customers(id, name)")
            .single();

          data = bareRes.data;
          error = bareRes.error;
        } else {
          data = standardRes.data;
          error = standardRes.error;
        }
      } else {
        data = fallbackRes.data;
        error = fallbackRes.error;
      }
    }

    if (error) {
      return NextResponse.json(
        {
          error: `Failed to record payment in database: ${error.message}. Please ensure the customer_payments table migration script has been executed in Supabase SQL editor.`,
          details: error,
        },
        { status: 400 },
      );
    }

    // Normalize returned object for client consistency
    if (data) {
      data.payment_method = data.payment_method || payMethod;
      data.location = data.location || locName;
      data.date = data.date || data.payment_date || effectiveDate;
      data.notes = data.notes || notes || null;
    }

    // Insert Cash Ledger inflow
    if (amt > 0 && data) {
      const custName = customerData?.name ? ` ${customerData.name}` : ` #${customer_id}`;
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
          description: `Customer payment received: ${notes || "Payment from" + custName}`,
          entered_by: userEntered,
        },
      ]);
    }

    // If toAdvance > 0, update customer advance_payment
    if (toAdvance > 0) {
      await supabase
        .from("customers")
        .update({ advance_payment: currentAdvance + toAdvance })
        .eq("id", customer_id);
    }

    return NextResponse.json({
      payment: data,
      success: true,
      applied_to_opening: toOpening,
      applied_to_advance: toAdvance,
    });
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
