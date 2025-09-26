import { NextResponse } from "next/server";
import { buildOrdersWorkbook } from "@/lib/orders/excel";
import { processOrdersCSV } from "@/lib/orders/processOrders";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return new NextResponse("file_required", { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = processOrdersCSV(buffer);
    const workbook = await buildOrdersWorkbook(result.momOrders, result.momOrdersByVertical);
    const bytes = Uint8Array.from(workbook);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=\"mom_orders_outputs.xlsx\"",
      },
    });
  } catch (error: unknown) {
    console.error("orders/compute.xlsx", error);
    return new NextResponse("processing_failed", { status: 500 });
  }
}
