import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const today = new Date().toISOString().split("T")[0];

    // Parallel queries for dashboard metrics
    const [
      { data: todaySales },
      { data: todayExpenses },
      { data: todayPayments },
      { data: customers },
      { data: allSales },
      { data: allPayments },
      { data: allPurchases },
      { data: stock },
    ] = await Promise.all([
      supabase.from("sales").select("quantity, rate_per_bag, cash_received, rickshaw_fare").eq("sale_date", today),
      supabase.from("expenses").select("amount").eq("expense_date", today),
      supabase.from("customer_payments").select("amount").eq("payment_date", today),
      supabase.from("customers").select("id, name, type, opening_balance, advance_payment, credit_limit").is("deleted_at", null),
      supabase.from("sales").select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received"),
      supabase.from("customer_payments").select("customer_id, amount"),
      supabase.from("purchases").select("settled_by_customer_id, quantity, rate_per_bag, cash_paid"),
      supabase.from("product_stock").select("stock_quantity"),
    ]);

    const totalSalesAmount = (todaySales || []).reduce((acc, s) => {
      const q = Number(s.quantity) || 0;
      const r = Number(s.rate_per_bag) || 0;
      return acc + (q * r);
    }, 0);

    const totalCashReceived = (todaySales || []).reduce((acc, s) => acc + (Number(s.cash_received) || 0), 0) +
                              (todayPayments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const totalExpenses = (todayExpenses || []).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    // Build customer ledger balances
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

    let totalReceivable = 0;
    let totalAdvance = 0;
    let overCreditCount = 0;

    for (const c of (customers || [])) {
      const cId = Number(c.id);
      const opening = Number(c.opening_balance) || 0;
      const advance = Number(c.advance_payment) || 0;
      const totalBill = salesMap[cId]?.bill || 0;
      const totalCashPaid = (salesMap[cId]?.cash || 0) + (paymentsMap[cId] || 0);
      const totalGoodsValue = goodsMap[cId] || 0;
      const balanceDue = (opening + totalBill) - totalCashPaid - totalGoodsValue - advance;

      if (balanceDue > 0) {
        totalReceivable += balanceDue;
      }
      totalAdvance += advance;

      // Check credit limit (default 3,000,000 / 30 Lac if limit is 0 or null)
      const creditLimit = Number(c.credit_limit) > 0 ? Number(c.credit_limit) : 3_000_000;
      if (balanceDue > creditLimit) {
        overCreditCount++;
      }
    }

    const totalStockBags = (stock || []).reduce((acc, s) => acc + (Number(s.stock_quantity) || 0), 0);
    const totalSalesCount = (todaySales || []).length;
    const totalCustomersCount = (customers || []).length;

    return NextResponse.json({
      // Component expected format
      salesTodayCount: totalSalesCount,
      billedToday: totalSalesAmount,
      cashCollectedToday: totalCashReceived,
      expensesToday: totalExpenses,
      totalCustomers: totalCustomersCount,
      totalOutstanding: totalReceivable,
      overCreditLimitCount: overCreditCount,
      // Alternate API format
      todaySalesAmount: totalSalesAmount,
      todayCashReceived: totalCashReceived,
      todayExpenses: totalExpenses,
      netCash: totalCashReceived - totalExpenses,
      totalReceivable,
      totalAdvance,
      totalStockBags,
      todaySalesCount: totalSalesCount,
    });
  } catch (err: any) {
    return NextResponse.json({
      salesTodayCount: 0,
      billedToday: 0,
      cashCollectedToday: 0,
      expensesToday: 0,
      totalCustomers: 0,
      totalOutstanding: 0,
      overCreditLimitCount: 0,
      todaySalesAmount: 0,
      todayCashReceived: 0,
      todayExpenses: 0,
      netCash: 0,
      totalReceivable: 0,
      totalAdvance: 0,
      totalStockBags: 0,
      todaySalesCount: 0,
      error: err.message,
    });
  }
}
