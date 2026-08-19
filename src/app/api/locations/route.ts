import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("locations").select("*").order("id", { ascending: true });

    if (error || !data || data.length === 0) {
      // Default standard fallback locations
      return NextResponse.json({
        locations: [
          { id: 1, name: "Farmhouse" },
          { id: 2, name: "Shop" },
        ],
      });
    }

    return NextResponse.json({ locations: data });
  } catch {
    return NextResponse.json({
      locations: [
        { id: 1, name: "Farmhouse" },
        { id: 2, name: "Shop" },
      ],
    });
  }
}
