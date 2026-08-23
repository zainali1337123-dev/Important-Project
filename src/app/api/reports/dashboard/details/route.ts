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
          credit_limit: Number(c.credit_limit) > 0 ? Number(c.credit_limit) : 3_000_000,
          since: c.created_at ? new Date(c.created_at).toLocaleDateString("en-PK") : "—",
        }));

        if (customerName) {
          rows = rows.filter((r) => r.name.toLowerCase().includes(customerName));
        }
        break;
      }
      case "outstanding": {
        label = "Total Outstanding / Khata";
        const [
          { data: customers },
          { data: allSales },
          { data: allPayments },
          { data: allPurchases },
        ] = await Promise.all([
          supabase.from("customers").select("*").is("deleted_at", null).order("name", { ascending: true }),
          supabase.from("sales").select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received"),
          supabase.from("customer_payments").select("customer_id, amount"),
          supabase.from("purchases").select("settled_by_customer_id, quantity, rate_per_bag, cash_paid"),
        ]);

        const salesMap: Record<number, { bill: number; cash: number }> = {};
        for (const s of (allSales || [])) {
          const cId = Number(s.customer_id);
          if (!cId) continue;
          if (!salesMap[cId]) salesMap[cId] = { bill: 0, cash: 0 };
          const q = Number(s.quantity) || 0;
          const r = Number(s.rate_per_bag) || 0;
          const f = Number(s.rickshaw_fare) || 0;
          const cash = Number(s.cash_received) || 0;
          salesMap[cId].bill += (q * r) + f;
          salesMap[cId].cash += cash;
        }

        const paymentsMap: Record<number, number> = {};
        for (const p of (allPayments || [])) {
          const cId = Number(p.customer_id);
          if (!cId) continue;
          paymentsMap[cId] = (paymentsMap[cId] || 0) + (Number(p.amount) || 0);
        }

        const goodsMap: Record<number, number> = {};
        for (const pur of (allPurchases || [])) {
          const cId = Number(pur.settled_by_customer_id);
          if (!cId) continue;
          const q = Number(pur.quantity) || 0;
          const r = Number(pur.rate_per_bag) || 0;
          const cp = Number(pur.cash_paid) || 0;
          const totalVal = q * r;
          const debtReduction = Math.max(0, totalVal - cp);
          goodsMap[cId] = (goodsMap[cId] || 0) + debtReduction;
        }

        rows = (customers || [])
          .map((c: any) => {
            const cId = Number(c.id);
            const opening = Number(c.opening_balance) || 0;
            const advance = Number(c.advance_payment) || 0;
            const totalBill = salesMap[cId]?.bill || 0;
            const totalCashPaid = (salesMap[cId]?.cash || 0) + (paymentsMap[cId] || 0);
            const totalGoodsValue = goodsMap[cId] || 0;
            const balanceDue = (opening + totalBill) - totalCashPaid - totalGoodsValue - advance;

            return {
              customer: c.name,
              phone: c.phone || "—",
              type: c.type || "credit",
              total_bill: opening + totalBill,
              paid: totalCashPaid + totalGoodsValue + advance,
              balance: balanceDue,
            };
          })
          .filter((r) => r.balance > 0)
          .sort((a, b) => b.balance - a.balance);

        if (customerName) {
          rows = rows.filter((r) => r.customer.toLowerCase().includes(customerName));
        }
        break;
      }
      case "over-credit": {
        label = "Over Credit Limit";
        const [
          { data: customers },
          { data: allSales },
          { data: allPayments },
          { data: allPurchases },
        ] = await Promise.all([
          supabase.from("customers").select("*").is("deleted_at", null).order("name", { ascending: true }),
          supabase.from("sales").select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received"),
          supabase.from("customer_payments").select("customer_id, amount"),
          supabase.from("purchases").select("settled_by_customer_id, quantity, rate_per_bag, cash_paid"),
        ]);

        const salesMap: Record<number, { bill: number; cash: number }> = {};
        for (const s of (allSales || [])) {
          const cId = Number(s.customer_id);
          if (!cId) continue;
          if (!salesMap[cId]) salesMap[cId] = { bill: 0, cash: 0 };
          const q = Number(s.quantity) || 0;
          const r = Number(s.rate_per_bag) || 0;
          const f = Number(s.rickshaw_fare) || 0;
          const cash = Number(s.cash_received) || 0;
          salesMap[cId].bill += (q * r) + f;
          salesMap[cId].cash += cash;
        }

        const paymentsMap: Record<number, number> = {};
        for (const p of (allPayments || [])) {
          const cId = Number(p.customer_id);
          if (!cId) continue;
          paymentsMap[cId] = (paymentsMap[cId] || 0) + (Number(p.amount) || 0);
        }

        const goodsMap: Record<number, number> = {};
        for (const pur of (allPurchases || [])) {
          const cId = Number(pur.settled_by_customer_id);
          if (!cId) continue;
          const q = Number(pur.quantity) || 0;
          const r = Number(pur.rate_per_bag) || 0;
          const cp = Number(pur.cash_paid) || 0;
          const totalVal = q * r;
          const debtReduction = Math.max(0, totalVal - cp);
          goodsMap[cId] = (goodsMap[cId] || 0) + debtReduction;
        }

        rows = (customers || [])
          .map((c: any) => {
            const cId = Number(c.id);
            const opening = Number(c.opening_balance) || 0;
            const advance = Number(c.advance_payment) || 0;
            const totalBill = salesMap[cId]?.bill || 0;
            const totalCashPaid = (salesMap[cId]?.cash || 0) + (paymentsMap[cId] || 0);
            const totalGoodsValue = goodsMap[cId] || 0;
            const balanceDue = (opening + totalBill) - totalCashPaid - totalGoodsValue - advance;
            const creditLimit = Number(c.credit_limit) > 0 ? Number(c.credit_limit) : 3_000_000;
            const excess = Math.max(0, balanceDue - creditLimit);

            return {
              customer: c.name,
              phone: c.phone || "—",
              credit_limit: creditLimit,
              total_bill: opening + totalBill,
              paid: totalCashPaid + totalGoodsValue + advance,
              balance: balanceDue,
              excess,
            };
          })
          .filter((r) => r.balance > r.credit_limit)
          .sort((a, b) => b.excess - a.excess || b.balance - a.balance);

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
