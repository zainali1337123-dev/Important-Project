import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id");

    if (customerId) {
      const [{ data: customer }, { data: sales }, { data: payments }] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId).single(),
        supabase.from("sales").select("*, products(*)").eq("customer_id", customerId).order("sale_date", { ascending: true }),
        supabase.from("customer_payments").select("*").eq("customer_id", customerId).order("payment_date", { ascending: true }),
      ]);

      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }

      const totalSales = (sales || []).reduce((acc, s) => acc + (s.quantity * s.rate_per_bag) + (Number(s.rickshaw_fare) || 0), 0);
      const totalCashPaidAtSale = (sales || []).reduce((acc, s) => acc + (Number(s.cash_received) || 0), 0);
      const totalCustomerPayments = (payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      const totalPaid = totalCashPaidAtSale + totalCustomerPayments;
      const opening = Number(customer.opening_balance) || 0;
      const advance = Number(customer.advance_payment) || 0;
      const currentBalance = (opening + totalSales) - totalPaid - advance;

      return NextResponse.json({
        customer,
        sales: sales || [],
        payments: payments || [],
        totalSales,
        totalPaid,
        currentBalance,
      });
    }

    // All customers balance summary
    const { data: customers, error } = await supabase
      .from("customers")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ customers: [], error: error.message }, { status: 200 });
    }

    return NextResponse.json({ customers: customers || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
