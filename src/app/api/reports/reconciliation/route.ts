import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || new Date().toISOString().split("T")[0];
    const to = searchParams.get("to") || from;

    const [
      { data: sales },
      { data: purchases },
      { data: expenses },
      { data: customerPayments },
      { data: labourPayments },
    ] = await Promise.all([
      supabase.from("sales").select("*, customers(*), products(*)").gte("sale_date", from).lte("sale_date", to),
      supabase.from("purchases").select("*, suppliers(*), products(*)").gte("purchase_date", from).lte("purchase_date", to),
      supabase.from("expenses").select("*").gte("expense_date", from).lte("expense_date", to),
      supabase.from("customer_payments").select("*, customers(*)").gte("payment_date", from).lte("payment_date", to),
      supabase.from("labour_payments").select("*, labours(*)").gte("payment_date", from).lte("payment_date", to),
    ]);

    const totalSalesRevenue = (sales || []).reduce((acc, s) => acc + (s.quantity * s.rate_per_bag), 0);
    const cashFromSales = (sales || []).reduce((acc, s) => acc + (Number(s.cash_received) || 0), 0);
    const cashFromCustomerPayments = (customerPayments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const totalCashIn = cashFromSales + cashFromCustomerPayments;

    const cashPaidPurchases = (purchases || []).reduce((acc, p) => acc + (Number(p.cash_paid) || 0), 0);
    const totalExpenses = (expenses || []).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const totalLabourPaid = (labourPayments || []).reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
    const totalCashOut = cashPaidPurchases + totalExpenses + totalLabourPaid;

    return NextResponse.json({
      from,
      to,
      sales: sales || [],
      purchases: purchases || [],
      expenses: expenses || [],
      customerPayments: customerPayments || [],
      labourPayments: labourPayments || [],
      summary: {
        totalSalesRevenue,
        totalCashIn,
        cashFromSales,
        cashFromCustomerPayments,
        totalCashOut,
        cashPaidPurchases,
        totalExpenses,
        totalLabourPaid,
        netCashFlow: totalCashIn - totalCashOut,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, summary: {} }, { status: 500 });
  }
}
