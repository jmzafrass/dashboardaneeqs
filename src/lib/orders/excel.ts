import ExcelJS from "exceljs";
import type { MomOrdersByVerticalRow, MomOrdersRow } from "./processOrders";

export async function buildOrdersWorkbook(
  headline: MomOrdersRow[],
  byVertical: MomOrdersByVerticalRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const s1 = workbook.addWorksheet("MoM Orders (Delivered)");
  s1.columns = [
    { header: "month", key: "month", width: 14 },
    { header: "orders", key: "orders", width: 12 },
    { header: "orders_mom_abs", key: "orders_mom_abs", width: 16 },
    { header: "orders_mom_pct", key: "orders_mom_pct", width: 16 },
    { header: "ado", key: "ado", width: 12 },
    { header: "ado_pacing", key: "ado_pacing", width: 14 },
    { header: "is_partial", key: "is_partial", width: 12 },
  ];
  headline.forEach((row) => s1.addRow(row));
  s1.getColumn("month").numFmt = "yyyy-mm-dd";
  s1.getColumn("orders_mom_pct").numFmt = "0.00%";
  s1.getColumn("ado").numFmt = "0.000";
  s1.getColumn("ado_pacing").numFmt = "0.000";
  s1.views = [{ state: "frozen", ySplit: 1 }];
  s1.autoFilter = "A1:G1";

  const s2 = workbook.addWorksheet("MoM by Vertical (Delivered)");
  s2.columns = [
    { header: "month", key: "month", width: 14 },
    { header: "vertical", key: "vertical", width: 12 },
    { header: "orders", key: "orders", width: 12 },
    { header: "orders_mom_abs", key: "orders_mom_abs", width: 16 },
    { header: "orders_mom_pct", key: "orders_mom_pct", width: 16 },
    { header: "ado_vertical", key: "ado_vertical", width: 16 },
    { header: "ado_vertical_pacing", key: "ado_vertical_pacing", width: 20 },
    { header: "is_partial", key: "is_partial", width: 12 },
  ];
  byVertical.forEach((row) => s2.addRow(row));
  s2.getColumn("month").numFmt = "yyyy-mm-dd";
  s2.getColumn("orders_mom_pct").numFmt = "0.00%";
  s2.getColumn("ado_vertical").numFmt = "0.000";
  s2.getColumn("ado_vertical_pacing").numFmt = "0.000";
  s2.views = [{ state: "frozen", ySplit: 1 }];
  s2.autoFilter = "A1:H1";

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
