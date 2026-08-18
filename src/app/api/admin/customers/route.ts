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
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await Service.create(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const result = await Service.update(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const result = await Service.remove(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
