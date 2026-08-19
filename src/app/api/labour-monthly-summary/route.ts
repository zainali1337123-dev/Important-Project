import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || new Date().toISOString().slice(0, 7);

    const from = `${month}-01`;
    // Calculate last day of month
    const [year, m] = month.split("-").map(Number);
    const lastDay = new Date(year, m, 0).getDate();
    const to = `${month}-${String(lastDay).padStart(2, "0")}`;

    const [{ data: labours }, { data: wages }, { data: payments }] = await Promise.all([
      supabase.from("labours").select("*, locations(*)").eq("is_active", true).order("name", { ascending: true }),
      supabase.from("labour_daily_wages").select("*").gte("wage_date", from).lte("wage_date", to),
      supabase.from("labour_payments").select("*").gte("payment_date", from).lte("payment_date", to),
    ]);

    const summaries = (labours || []).map((labour: any) => {
      const labourWages = (wages || []).filter((w: any) => w.labour_id === labour.id);
      const labourPayments = (payments || []).filter((p: any) => p.labour_id === labour.id);

      const total_earned = labourWages.reduce((sum: number, w: any) => sum + (Number(w.amount) || 0), 0);
      const total_paid = labourPayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
      const balance_due = total_earned - total_paid;

      return {
        labour_id: labour.id,
        month,
        total_earned,
        total_paid,
        balance_due,
        status: balance_due <= 0 ? "paid" : "not_paid",
        wage_count: labourWages.length,
        payment_count: labourPayments.length,
        labour,
      };
    });

    return NextResponse.json({ summaries });
  } catch (err: any) {
    return NextResponse.json({ summaries: [], error: err.message }, { status: 500 });
  }
}
