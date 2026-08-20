import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  const defaultLocations = [
    { id: 2, name: "Shop" },
    { id: 1, name: "Farm" },
  ];

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("locations").select("*").order("id", { ascending: false });

    if (error || !data || data.length === 0) {
      // Try to seed locations table if accessible
      try {
        await supabase.from("locations").upsert([
          { id: 2, name: "Shop" },
          { id: 1, name: "Farm" },
        ]);
      } catch {}

      return NextResponse.json({ locations: defaultLocations });
    }

    // Normalize any "Farmhouse" to "Farm" if user requested "shop" and "farm"
    const normalizedLocations = data.map((loc) => ({
      ...loc,
      name: loc.name === "Farmhouse" ? "Farm" : loc.name,
    }));

    return NextResponse.json({ locations: normalizedLocations });
  } catch {
    return NextResponse.json({ locations: defaultLocations });
  }
}
