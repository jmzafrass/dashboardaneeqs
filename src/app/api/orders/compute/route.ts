import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { processOrdersCSV } from "@/lib/orders/processOrders";

async function loadDefaultOrders() {
  const filePath = path.join(process.cwd(), "public", "data", "allorders.csv");
  return fs.readFile(filePath);
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source");

    let buffer: Buffer;

    if (source === "default") {
      buffer = await loadDefaultOrders();
    } else {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "file_required" }, { status: 400 });
      }

      buffer = Buffer.from(await file.arrayBuffer());
    }

    const result = processOrdersCSV(buffer);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("orders/compute", error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
