import { NextResponse } from "next/server";
import { Service } from "@/lib/service";

export async function GET(request: Request) {
  try {
    const data = await Service.list(request);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
