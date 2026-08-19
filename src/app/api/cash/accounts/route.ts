import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("cash_accounts").select("*").order("id", { ascending: true });

    if (error || !data || data.length === 0) {
      return NextResponse.json({
        accounts: [
          { id: 1, name: "Shop Cash Drawer" },
          { id: 2, name: "Farmhouse Cash Drawer" },
          { id: 3, name: "Bank Account" },
          { id: 4, name: "Owner Reserve" },
        ],
      });
    }

    return NextResponse.json({ accounts: data });
  } catch {
    return NextResponse.json({
      accounts: [
        { id: 1, name: "Shop Cash Drawer" },
        { id: 2, name: "Farmhouse Cash Drawer" },
        { id: 3, name: "Bank Account" },
        { id: 4, name: "Owner Reserve" },
      ],
    });
  }
}
