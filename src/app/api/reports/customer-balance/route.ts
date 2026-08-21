import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id");

    if (customerId) {
      const [{ data: customer }, { data: sales }, { data: payments }, { data: purchases }] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId).single(),
        supabase.from("sales").select("*, products(*)").eq("customer_id", customerId).order("sale_date", { ascending: true }),
        supabase.from("customer_payments").select("*").eq("customer_id", customerId).order("payment_date", { ascending: true }),
        supabase.from("purchases").select("*, products(*)").eq("settled_by_customer_id", customerId).order("purchase_date", { ascending: true }),
      ]);

      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }

      const totalSales = (sales || []).reduce((acc, s) => {
        const q = Number(s.quantity) || 0;
        const r = Number(s.rate_per_bag) || 0;
        const f = Number(s.rickshaw_fare) || 0;
        return acc + (q * r) + f;
      }, 0);

      const totalCashPaidAtSale = (sales || []).reduce((acc, s) => acc + (Number(s.cash_received) || 0), 0);
      const totalCustomerPayments = (payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      const totalPaid = totalCashPaidAtSale + totalCustomerPayments;

      const totalGoodsValue = (purchases || []).reduce((acc, p) => {
        const q = Number(p.quantity) || 0;
        const r = Number(p.rate_per_bag) || 0;
        const cp = Number(p.cash_paid) || 0;
        const totalVal = q * r;
        const debtReduction = Math.max(0, totalVal - cp);
        return acc + debtReduction;
      }, 0);

      const opening = Number(customer.opening_balance) || 0;
      const advance = Number(customer.advance_payment) || 0;
      const balanceDue = (opening + totalSales) - totalPaid - totalGoodsValue - advance;

      return NextResponse.json({
        customer,
        sales: sales || [],
        payments: payments || [],
        purchases: purchases || [],
        opening_balance: opening,
        total_bill: totalSales,
        total_cash_paid: totalPaid,
        total_goods_value: totalGoodsValue,
        advance_payment: advance,
        balance_due: balanceDue,
        totalSales,
        totalPaid,
        currentBalance: balanceDue,
      });
    }

    // All customers balance summary
    const [
      { data: customers, error: cErr },
      { data: allSales },
      { data: allPayments },
      { data: allPurchases },
    ] = await Promise.all([
      supabase.from("customers").select("*").order("name", { ascending: true }),
      supabase.from("sales").select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received"),
      supabase.from("customer_payments").select("customer_id, amount"),
      supabase.from("purchases").select("settled_by_customer_id, quantity, rate_per_bag, cash_paid"),
    ]);

    if (cErr) {
      return NextResponse.json({ customers: [], balances: {}, error: cErr.message }, { status: 200 });
    }

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

    const balancesMap: Record<number, any> = {};
    const customersWithBalances = (customers || []).map((c: any) => {
      const cId = Number(c.id);
      const opening = Number(c.opening_balance) || 0;
      const advance = Number(c.advance_payment) || 0;
      const totalBill = salesMap[cId]?.bill || 0;
      const totalCashPaid = (salesMap[cId]?.cash || 0) + (paymentsMap[cId] || 0);
      const totalGoodsValue = goodsMap[cId] || 0;
      const balanceDue = (opening + totalBill) - totalCashPaid - totalGoodsValue - advance;

      const row = {
        opening_balance: opening,
        total_bill: totalBill,
        total_cash_paid: totalCashPaid,
        total_goods_value: totalGoodsValue,
        advance_payment: advance,
        balance_due: balanceDue,
      };

      balancesMap[cId] = row;
      return {
        ...c,
        ...row,
      };
    });

    // Provide both indexed dictionary and array for compatibility
    return NextResponse.json({
      ...balancesMap,
      balances: balancesMap,
      customers: customersWithBalances,
    });
  } catch (err: any) {
    return NextResponse.json({ customers: [], balances: {}, error: err.message }, { status: 500 });
  }
}
