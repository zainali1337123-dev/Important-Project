import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    // 1. Fetch cash accounts
    const { data: accounts } = await supabase
      .from("cash_accounts")
      .select("*")
      .order("id", { ascending: true });

    const accountMap: Record<number, string> = {
      1: "Cash In Hand",
      2: "Cash In Locker",
      3: "Cash Online",
    };

    if (accounts && accounts.length > 0) {
      for (const acc of accounts) {
        accountMap[acc.id] = acc.name;
      }
    }

    // 2. Fetch cash ledger entries
    const { data: ledger } = await supabase.from("cash_ledger").select("*");

    const balances: Record<string, number> = {
      "Cash In Hand": 0,
      "Cash In Locker": 0,
      "Cash Online": 0,
      "1": 0,
      "2": 0,
      "3": 0,
    };

    if (ledger && ledger.length > 0) {
      for (const entry of ledger) {
        const accId = Number(entry.account_id) || 1;
        const amt = Number(entry.amount) || 0;
        const isOut = entry.type === "out" || entry.direction === "out";
        const delta = isOut ? -amt : amt;
        const accName = accountMap[accId] || (accId === 2 ? "Cash In Locker" : accId === 3 ? "Cash Online" : "Cash In Hand");

        balances[accId] = (balances[accId] || 0) + delta;
        balances[String(accId)] = (balances[String(accId)] || 0) + delta;
        balances[accName] = (balances[accName] || 0) + delta;
      }
    } else {
      // Fallback live compute if cash_ledger has not been populated
      const [salesRes, cpRes, expRes, purRes, labourRes, transfersRes] = await Promise.all([
        supabase.from("sales").select("cash_received"),
        supabase.from("customer_payments").select("amount"),
        supabase.from("expenses").select("amount"),
        supabase.from("purchases").select("cash_paid"),
        supabase.from("labour_payments").select("amount"),
        supabase.from("cash_transfers").select("*"),
      ]);

      const totalSalesCash = (salesRes.data || []).reduce((s, r) => s + (Number(r.cash_received) || 0), 0);
      const totalCpCash = (cpRes.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const totalExpCash = (expRes.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const totalPurCash = (purRes.data || []).reduce((s, r) => s + (Number(r.cash_paid) || 0), 0);
      const totalLabourCash = (labourRes.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);

      let netHand = totalSalesCash + totalCpCash - totalExpCash - totalPurCash - totalLabourCash;
      let locker = 0;
      let online = 0;

      for (const t of (transfersRes.data || [])) {
        const amt = Number(t.amount) || 0;
        const fromId = Number(t.from_account_id);
        const toId = Number(t.to_account_id);
        if (fromId === 1) netHand -= amt;
        if (fromId === 2) locker -= amt;
        if (fromId === 3) online -= amt;
        if (toId === 1) netHand += amt;
        if (toId === 2) locker += amt;
        if (toId === 3) online += amt;
      }

      balances["1"] = netHand;
      balances["2"] = locker;
      balances["3"] = online;
      balances["Cash In Hand"] = netHand;
      balances["Cash In Locker"] = locker;
      balances["Cash Online"] = online;
    }

    return NextResponse.json({ balances });
  } catch (err: any) {
    return NextResponse.json({ balances: {}, error: err.message }, { status: 500 });
  }
}
