import { NextResponse } from "next/server";
import { processOrdersCSV } from "@/lib/orders/processOrders";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file_required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = processOrdersCSV(buffer);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("orders/compute", error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
