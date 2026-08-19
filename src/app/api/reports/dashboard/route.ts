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
      { data: stock },
    ] = await Promise.all([
      supabase.from("sales").select("quantity, rate_per_bag, cash_received, rickshaw_fare").eq("sale_date", today),
      supabase.from("expenses").select("amount").eq("expense_date", today),
      supabase.from("customer_payments").select("amount").eq("payment_date", today),
      supabase.from("customers").select("opening_balance, advance_payment").eq("is_active", true),
      supabase.from("product_stock").select("stock_quantity"),
    ]);

    const totalSalesAmount = (todaySales || []).reduce((acc, s) => acc + (s.quantity * s.rate_per_bag), 0);
    const totalCashReceived = (todaySales || []).reduce((acc, s) => acc + (Number(s.cash_received) || 0), 0) +
                              (todayPayments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const totalExpenses = (todayExpenses || []).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const totalReceivable = (customers || []).reduce((acc, c) => acc + (Number(c.opening_balance) || 0), 0);
    const totalAdvance = (customers || []).reduce((acc, c) => acc + (Number(c.advance_payment) || 0), 0);
    const totalStockBags = (stock || []).reduce((acc, s) => acc + (Number(s.stock_quantity) || 0), 0);

    return NextResponse.json({
      todaySalesAmount: totalSalesAmount,
      todayCashReceived: totalCashReceived,
      todayExpenses: totalExpenses,
      netCash: totalCashReceived - totalExpenses,
      totalReceivable,
      totalAdvance,
      totalStockBags,
      todaySalesCount: (todaySales || []).length,
    });
  } catch (err: any) {
    return NextResponse.json({
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
