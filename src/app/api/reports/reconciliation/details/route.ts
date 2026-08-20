import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "expenses";
    const from = searchParams.get("from") || new Date().toISOString().split("T")[0];
    const to = searchParams.get("to") || from;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.max(1, Number(searchParams.get("pageSize")) || 10);
    const customerNameQuery = (searchParams.get("customer_name") || "").trim().toLowerCase();
    const descriptionQuery = (searchParams.get("description") || "").trim().toLowerCase();

    let allRows: Record<string, any>[] = [];

    if (type === "expenses" || type === "cash-out") {
      const { data: expenses, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false })
        .order("id", { ascending: false });

      if (error) {
        return NextResponse.json({ rows: [], total: 0, totalPages: 1, error: error.message }, { status: 200 });
      }

      allRows = (expenses || []).map((e: any) => ({
        id: e.id,
        date: e.expense_date,
        description: e.description || "—",
        category: e.category || "General",
        amount: Number(e.amount) || 0,
      }));

      if (descriptionQuery) {
        allRows = allRows.filter(
          (r) =>
            r.description.toLowerCase().includes(descriptionQuery) ||
            r.category.toLowerCase().includes(descriptionQuery)
        );
      }
    } else {
      // Sales & Cash In queries
      const { data: sales, error } = await supabase
        .from("sales")
        .select("*, customers(*), products(*)")
        .gte("sale_date", from)
        .lte("sale_date", to)
        .order("sale_date", { ascending: false })
        .order("id", { ascending: false });

      if (error) {
        return NextResponse.json({ rows: [], total: 0, totalPages: 1, error: error.message }, { status: 200 });
      }

      let filteredSales = sales || [];

      if (type === "credit-customers") {
        filteredSales = filteredSales.filter((s: any) => s.customers?.type === "credit");
      } else if (type === "cash-customers") {
        filteredSales = filteredSales.filter((s: any) => s.customers?.type === "cash");
      }

      allRows = filteredSales.map((s: any) => {
        const qty = Number(s.quantity) || 0;
        const rate = Number(s.rate_per_bag) || 0;
        const bill = qty * rate;
        const cash = Number(s.cash_received) || 0;
        const bw = Number(s.bag_weight_kg) || 40;
        const kg = s.unit_type === "kg" ? qty : qty * bw;

        return {
          id: s.id,
          date: s.sale_date,
          customer: s.customers?.name || "Cash Customer",
          product: s.products?.name || "Feed",
          bags: s.unit_type === "bags" ? qty : (qty / (bw || 40)).toFixed(1),
          kg: Math.round(kg),
          rate,
          bill,
          cash,
          cash_paid: cash,
        };
      });

      if (customerNameQuery) {
        allRows = allRows.filter((r) => r.customer.toLowerCase().includes(customerNameQuery));
      }
    }

    const total = allRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const paginatedRows = allRows.slice(offset, offset + pageSize);

    return NextResponse.json({
      rows: paginatedRows,
      total,
      totalPages,
      page,
      pageSize,
    });
  } catch (err: any) {
    return NextResponse.json({ rows: [], total: 0, totalPages: 1, error: err.message }, { status: 500 });
  }
}
