import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const customerName = searchParams.get("customer_name")?.toLowerCase();
    const description = searchParams.get("description")?.toLowerCase();
    const page = Number(searchParams.get("page")) || 1;
    const pageSize = Number(searchParams.get("pageSize")) || 10;

    let rows: Record<string, any>[] = [];
    let label = "Details";

    switch (type) {
      case "sales-today": {
        label = "Sales Today";
        const { data: sales } = await supabase
          .from("sales")
          .select("*, customers(*), products(*)")
          .eq("sale_date", date)
          .order("id", { ascending: false });

        rows = (sales || []).map((s: any) => ({
          customer: s.customers?.name || "Cash Customer",
          product: s.products?.name || "Product",
          qty: s.quantity || 0,
          unit: s.unit_type || "bags",
          rate: s.rate_per_bag || 0,
          fare: s.rickshaw_fare || 0,
          amount: (s.quantity * s.rate_per_bag) + (Number(s.rickshaw_fare) || 0),
        }));

        if (customerName) {
          rows = rows.filter((r) => r.customer.toLowerCase().includes(customerName));
        }
        break;
      }
      case "billed-today": {
        label = "Billed Today";
        const { data: sales } = await supabase
          .from("sales")
          .select("*, customers(*), products(*)")
          .eq("sale_date", date)
          .order("id", { ascending: false });

        rows = (sales || []).map((s: any) => {
          const bill = (s.quantity * s.rate_per_bag) + (Number(s.rickshaw_fare) || 0);
          const cash_paid = Number(s.cash_received) || 0;
          return {
            customer: s.customers?.name || "Cash Customer",
            product: s.products?.name || "Product",
            qty: s.quantity || 0,
            unit: s.unit_type || "bags",
            bill,
            cash_paid,
            balance: bill - cash_paid,
          };
        });

        if (customerName) {
          rows = rows.filter((r) => r.customer.toLowerCase().includes(customerName));
        }
        break;
      }
      case "cash-collected": {
        label = "Cash Collected";
        const [{ data: sales }, { data: payments }] = await Promise.all([
          supabase.from("sales").select("*, customers(*), products(*)").eq("sale_date", date).gt("cash_received", 0),
          supabase.from("customer_payments").select("*, customers(*)").eq("payment_date", date),
        ]);

        const salesRows = (sales || []).map((s: any) => ({
          customer: s.customers?.name || "Cash Customer",
          product: s.products?.name || "Product Sale",
          cash: Number(s.cash_received) || 0,
        }));

        const paymentRows = (payments || []).map((p: any) => ({
          customer: p.customers?.name || "Customer Payment",
          product: p.notes ? `Payment: ${p.notes}` : "Khata Payment",
          cash: Number(p.amount) || 0,
        }));

        rows = [...salesRows, ...paymentRows];
        if (customerName) {
          rows = rows.filter((r) => r.customer.toLowerCase().includes(customerName));
        }
        break;
      }
      case "expenses-today": {
        label = "Expenses Today";
        const { data: expenses } = await supabase
          .from("expenses")
          .select("*")
          .eq("expense_date", date)
          .order("id", { ascending: false });

        rows = (expenses || []).map((e: any) => ({
          description: e.description || "Expense",
          amount: Number(e.amount) || 0,
        }));

        if (description) {
          rows = rows.filter((r) => r.description.toLowerCase().includes(description));
        }
        break;
      }
      case "customers": {
        label = "Customers";
        const { data: customers } = await supabase
          .from("customers")
          .select("*")
          .is("deleted_at", null)
          .order("name", { ascending: true });

        rows = (customers || []).map((c: any) => ({
          name: c.name,
          type: c.type || "credit",
          phone: c.phone || "—",
          active: c.is_active,
          credit_limit: c.credit_limit || 0,
          since: c.created_at ? new Date(c.created_at).toLocaleDateString("en-PK") : "—",
        }));

        if (customerName) {
          rows = rows.filter((r) => r.name.toLowerCase().includes(customerName));
        }
        break;
      }
      case "outstanding": {
        label = "Total Outstanding / Khata";
        const { data: customers } = await supabase
          .from("customers")
          .select("*")
          .is("deleted_at", null)
          .gt("opening_balance", 0)
          .order("opening_balance", { ascending: false });

        rows = (customers || []).map((c: any) => ({
          customer: c.name,
          phone: c.phone || "—",
          type: c.type || "credit",
          total_bill: Number(c.opening_balance) || 0,
          paid: Number(c.advance_payment) || 0,
          balance: (Number(c.opening_balance) || 0) - (Number(c.advance_payment) || 0),
        }));

        if (customerName) {
          rows = rows.filter((r) => r.customer.toLowerCase().includes(customerName));
        }
        break;
      }
      case "over-credit": {
        label = "Over Credit Limit";
        const { data: customers } = await supabase
          .from("customers")
          .select("*")
          .is("deleted_at", null)
          .gt("credit_limit", 0);

        rows = (customers || [])
          .filter((c: any) => (Number(c.opening_balance) || 0) > (Number(c.credit_limit) || 0))
          .map((c: any) => ({
            customer: c.name,
            phone: c.phone || "—",
            credit_limit: Number(c.credit_limit) || 0,
            total_bill: Number(c.opening_balance) || 0,
            paid: Number(c.advance_payment) || 0,
            balance: Number(c.opening_balance) || 0,
          }));

        if (customerName) {
          rows = rows.filter((r) => r.customer.toLowerCase().includes(customerName));
        }
        break;
      }
      default:
        rows = [];
    }

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const startIdx = (page - 1) * pageSize;
    const pagedRows = rows.slice(startIdx, startIdx + pageSize);

    return NextResponse.json({
      label,
      rows: pagedRows,
      total,
      totalPages,
      page,
      pageSize,
    });
  } catch (err: any) {
    return NextResponse.json({ label: "Details", rows: [], total: 0, totalPages: 1, error: err.message }, { status: 500 });
  }
}
