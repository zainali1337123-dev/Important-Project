import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || new Date().toISOString().split("T")[0];
    const to = searchParams.get("to") || from;
    const locationId = searchParams.get("location_id");

    let salesQuery = supabase.from("sales").select("*, customers(*), products(*)").gte("sale_date", from).lte("sale_date", to);
    let purchasesQuery = supabase.from("purchases").select("*, suppliers(*), products(*)").gte("purchase_date", from).lte("purchase_date", to);
    let expensesQuery = supabase.from("expenses").select("*").gte("expense_date", from).lte("expense_date", to);
    let customerPaymentsQuery = supabase.from("customer_payments").select("*, customers(*)").gte("payment_date", from).lte("payment_date", to);
    let labourPaymentsQuery = supabase.from("labour_payments").select("*, labours(*)").gte("payment_date", from).lte("payment_date", to);

    if (locationId && locationId !== "all") {
      salesQuery = salesQuery.eq("location_id", locationId);
      purchasesQuery = purchasesQuery.eq("location_id", locationId);
      expensesQuery = expensesQuery.eq("location_id", locationId);
      customerPaymentsQuery = customerPaymentsQuery.eq("location_id", locationId);
      labourPaymentsQuery = labourPaymentsQuery.eq("location_id", locationId);
    }

    const [
      { data: sales },
      { data: purchases },
      { data: expenses },
      { data: customerPayments },
      { data: labourPayments },
    ] = await Promise.all([
      salesQuery,
      purchasesQuery,
      expensesQuery,
      customerPaymentsQuery,
      labourPaymentsQuery,
    ]);

    const salesList = sales || [];
    const purchasesList = purchases || [];
    const expensesList = expenses || [];
    const customerPaymentsList = customerPayments || [];
    const labourPaymentsList = labourPayments || [];

    // Bags sold calculation
    const totalBagsSold = salesList.reduce((acc, s) => {
      const q = Number(s.quantity) || 0;
      const bw = Number(s.bag_weight_kg) || 40;
      return acc + (s.unit_type === "kg" ? q / bw : q);
    }, 0);

    // Total billed
    const totalBilled = salesList.reduce((acc, s) => {
      const q = Number(s.quantity) || 0;
      const r = Number(s.rate_per_bag) || 0;
      const fare = Number(s.rickshaw_fare) || 0;
      return acc + (q * r) + fare;
    }, 0);

    // Cash received directly on sales
    const cashFromSales = salesList.reduce((acc, s) => acc + (Number(s.cash_received) || 0), 0);

    // Cash from customer payments
    const cashFromCustomerPayments = customerPaymentsList.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

    // Breakdown from credit vs cash customers
    let fromCreditCustomers = cashFromCustomerPayments;
    let fromCashCustomers = 0;

    for (const s of salesList) {
      const cType = s.customers?.type;
      const sCash = Number(s.cash_received) || 0;
      if (cType === "credit") {
        fromCreditCustomers += sCash;
      } else {
        fromCashCustomers += sCash;
      }
    }

    const totalExpensesOnly = expensesList.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const totalLabourPaid = labourPaymentsList.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
    const totalExpenses = totalExpensesOnly + totalLabourPaid;

    const cashPaidPurchases = purchasesList.reduce((acc, p) => acc + (Number(p.cash_paid) || 0), 0);

    const totalCashIn = cashFromSales + cashFromCustomerPayments;
    const totalCashOut = totalExpenses + cashPaidPurchases;
    const expectedCashInHand = totalCashIn - totalCashOut;

    const payload = {
      from,
      to,
      total_bags_sold: totalBagsSold,
      total_billed: totalBilled,
      cash_received: totalCashIn,
      from_credit_customers: fromCreditCustomers,
      from_cash_customers: fromCashCustomers,
      total_expenses: totalExpenses,
      total_cash_in: totalCashIn,
      total_cash_out: totalCashOut,
      expected_cash_in_hand: expectedCashInHand,
      sales: salesList,
      purchases: purchasesList,
      expenses: expensesList,
      customerPayments: customerPaymentsList,
      labourPayments: labourPaymentsList,
      summary: {
        totalSalesRevenue: totalBilled,
        totalBagsSold,
        totalCashIn,
        cashFromSales,
        cashFromCustomerPayments,
        fromCreditCustomers,
        fromCashCustomers,
        totalCashOut,
        cashPaidPurchases,
        totalExpenses,
        totalLabourPaid,
        netCashFlow: expectedCashInHand,
      },
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      {
        total_bags_sold: 0,
        total_billed: 0,
        cash_received: 0,
        from_credit_customers: 0,
        from_cash_customers: 0,
        total_expenses: 0,
        total_cash_in: 0,
        total_cash_out: 0,
        expected_cash_in_hand: 0,
        error: err.message,
        summary: {},
      },
      { status: 500 }
    );
  }
}
