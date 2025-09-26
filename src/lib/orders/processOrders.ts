import { parse as csvParse } from "csv-parse/sync";
import {
  format as formatDate,
  getDate,
  getDaysInMonth,
  isValid,
  max as maxDate,
  parse as parseDate,
  startOfMonth,
} from "date-fns";

export type Vertical = "pom hl" | "pom sh" | "otc hl" | "otc sh" | "otc sk" | "pom bg";

export interface MomOrdersRow {
  month: string;
  orders: number;
  orders_mom_abs: number | null;
  orders_mom_pct: number | null;
  ado: number;
  ado_pacing: number | null;
  is_partial: 0 | 1;
}

export interface MomOrdersByVerticalRow {
  month: string;
  vertical: Vertical;
  orders: number;
  orders_mom_abs: number | null;
  orders_mom_pct: number | null;
  ado_vertical: number;
  ado_vertical_pacing: number | null;
  is_partial: 0 | 1;
}

export interface ProcessResult {
  momOrders: MomOrdersRow[];
  momOrdersByVertical: MomOrdersByVerticalRow[];
  qa: {
    noVerticalPct: number;
    multiVerticalPct: number;
    unknownCount: number;
    headlineVsVerticals: Array<{ month: string; headline: number; vertical_sum: number; delta: number }>;
  };
}

type RawRow = Record<string, unknown>;

type ProcessedOrder = {
  order_key: string;
  order_ts: Date;
  order_month: string;
  verticals: Set<Vertical>;
};

const VERTICALS: Vertical[] = ["pom hl", "pom sh", "otc hl", "otc sh", "otc sk", "pom bg"];

const SKU_TO_VERTICAL: Record<string, Vertical> = {
  "ultimate revival": "pom hl",
  "power regrowth": "pom hl",
  "essential boost": "pom hl",
  "oral mix": "pom hl",
  "oral minoxidil": "pom hl",
  "vital recharge": "pom sh",
  "max power": "pom sh",
  "delay spray": "otc sh",
  "essential routine": "otc sk",
  "advanced routine": "otc sk",
  cleanser: "otc sk",
  "moisturizer spf": "otc sk",
  moisturizer: "otc sk",
  "eye cream": "otc sk",
  serum: "otc sk",
  shampoo: "otc hl",
  conditioner: "otc hl",
  "regrowth hair pack": "otc hl",
  "regrowth pack": "otc hl",
  "beard growth serum": "pom bg",
};

const SKU_PATTERNS = Object.keys(SKU_TO_VERTICAL).sort((a, b) => b.length - a.length);

const CATEGORY_COMPACT_MAP: Record<string, Vertical> = {
  pomhl: "pom hl",
  pomsh: "pom sh",
  otchl: "otc hl",
  otcsh: "otc sh",
  otcsk: "otc sk",
  pombg: "pom bg",
};

function normalise(text: unknown): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseDayFirst(input: unknown): Date | null {
  const raw = normalise(input);
  if (!raw) return null;
  const formats = ["dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy", "dd.MM.yyyy", "d.M.yyyy"];
  for (const fmt of formats) {
    const parsed = parseDate(raw, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

function monthKey(date: Date) {
  return formatDate(startOfMonth(date), "yyyy-MM-01");
}

function categoriesToVerticals(value: unknown): Set<Vertical> {
  const result = new Set<Vertical>();
  if (!value) return result;
  const parts = String(value)
    .split(",")
    .map(normalise)
    .filter(Boolean);
  for (const part of parts) {
    if (VERTICALS.includes(part as Vertical)) {
      result.add(part as Vertical);
      continue;
    }
    const compact = part.replace(/\s+/g, "");
    const mapped = CATEGORY_COMPACT_MAP[compact];
    if (mapped) {
      result.add(mapped);
    }
  }
  return result;
}

function skusToVerticals(value: unknown): Set<Vertical> {
  const result = new Set<Vertical>();
  if (!value) return result;
  const items = String(value)
    .split(",")
    .map(normalise)
    .filter(Boolean);
  for (const item of items) {
    if (item.includes("beard growth serum")) {
      result.add("pom bg");
      continue;
    }
    if (SKU_TO_VERTICAL[item]) {
      result.add(SKU_TO_VERTICAL[item]);
      continue;
    }
    for (const pattern of SKU_PATTERNS) {
      if ((" " + item + " ").includes(" " + pattern + " ")) {
        result.add(SKU_TO_VERTICAL[pattern]);
        break;
      }
    }
  }
  return result;
}

function daysElapsedInMonth(date: Date, snapshotMonth: string): number {
  const key = monthKey(date);
  if (key !== snapshotMonth) {
    return getDaysInMonth(date);
  }
  return getDate(date);
}

function isPartialMonth(month: string, snapshotMonth: string) {
  return month === snapshotMonth ? 1 : 0;
}

export function processOrdersCSV(buffer: Buffer): ProcessResult {
  const rawRows = csvParse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as RawRow[];

  const processed: ProcessedOrder[] = [];
  const unknownOrderKeys = new Set<string>();

  for (const raw of rawRows) {
    const ts = parseDayFirst(raw["Order Date"]);
    if (!ts) continue;

    const status = normalise(raw["Status Order"]);
    if (status !== "delivered") continue;

    const orderIdRaw = normalise(raw["Order_id"]);
    const useProvidedId = orderIdRaw && orderIdRaw !== "stripe";
    const price = String(raw["Price"] ?? "");
    const type = normalise(raw["Type"]);
    const customer = normalise(raw["Customer"]);
    const orderKey = useProvidedId
      ? `id|${orderIdRaw}`
      : `syn|${customer}|${formatDate(ts, "yyyy-MM-dd")}|${price}|${type}`;

    const verticalsFromSkus = skusToVerticals(raw["SKUs"]);
    const verticalsFromCategories = categoriesToVerticals(raw["Category"]);
    const merged = new Set<Vertical>([...verticalsFromSkus, ...verticalsFromCategories]);

    const record: ProcessedOrder = {
      order_key: orderKey,
      order_ts: ts,
      order_month: monthKey(ts),
      verticals: merged,
    };

    if (merged.size === 0) {
      unknownOrderKeys.add(orderKey);
    }

    processed.push(record);
  }

  // Deduplicate headline orders by order_key
  const seenOrderKeys = new Set<string>();
  const headlineOrders = processed.filter((order) => {
    if (seenOrderKeys.has(order.order_key)) return false;
    seenOrderKeys.add(order.order_key);
    return true;
  });

  // Determine snapshot month (latest delivered order)
  const latestOrderDate = headlineOrders.reduce<Date | null>((acc, order) => {
    return acc ? (maxDate([acc, order.order_ts]) as Date) : order.order_ts;
  }, null);
  const snapshotMonth = latestOrderDate ? monthKey(latestOrderDate) : "";

  const months = Array.from(new Set(headlineOrders.map((order) => order.order_month))).sort();

  // Aggregate headline orders per month and track pacing denominator
  const ordersByMonth = new Map<string, number>();
  const pacingByMonth = new Map<string, number>();
  for (const month of months) {
    ordersByMonth.set(month, 0);
    pacingByMonth.set(month, 0);
  }
  for (const order of headlineOrders) {
    ordersByMonth.set(order.order_month, (ordersByMonth.get(order.order_month) || 0) + 1);
    const elapsed = daysElapsedInMonth(order.order_ts, snapshotMonth);
    pacingByMonth.set(order.order_month, Math.max(pacingByMonth.get(order.order_month) || 0, elapsed));
  }

  const momOrders: MomOrdersRow[] = [];
  for (let i = 0; i < months.length; i += 1) {
    const month = months[i];
    const currentOrders = ordersByMonth.get(month) || 0;
    const previousOrders = i > 0 ? ordersByMonth.get(months[i - 1]) || 0 : null;
    const diff = previousOrders == null ? null : currentOrders - previousOrders;
    const pct = previousOrders == null || previousOrders === 0 ? null : diff! / previousOrders;
    const daysInMonth = getDaysInMonth(new Date(month));
    const ado = currentOrders / daysInMonth;
    const isPartial = isPartialMonth(month, snapshotMonth);
    const pacingDenominator = pacingByMonth.get(month) || daysInMonth;
    const adoPacing = isPartial ? currentOrders / pacingDenominator : null;

    momOrders.push({
      month,
      orders: currentOrders,
      orders_mom_abs: diff,
      orders_mom_pct: pct,
      ado,
      ado_pacing: adoPacing,
      is_partial: isPartial,
    });
  }

  // Explode per vertical, deduplicating order-key-month-vertical combinations
  const seenOrderVerticalMonth = new Set<string>();
  const exploded: Array<{ order_key: string; order_month: string; vertical: Vertical; order_ts: Date }> = [];
  for (const order of processed) {
    if (order.verticals.size === 0) {
      continue;
    }
    for (const vertical of order.verticals) {
      const key = `${order.order_key}|${order.order_month}|${vertical}`;
      if (seenOrderVerticalMonth.has(key)) continue;
      seenOrderVerticalMonth.add(key);
      exploded.push({
        order_key: order.order_key,
        order_month: order.order_month,
        vertical,
        order_ts: order.order_ts,
      });
    }
  }

  const ordersByMonthVertical = new Map<string, number>();
  const pacingByMonthVertical = new Map<string, number>();
  const mvKey = (month: string, vertical: Vertical) => `${month}|${vertical}`;
  for (const month of months) {
    for (const vertical of VERTICALS) {
      ordersByMonthVertical.set(mvKey(month, vertical), 0);
      pacingByMonthVertical.set(mvKey(month, vertical), 0);
    }
  }
  for (const item of exploded) {
    const key = mvKey(item.order_month, item.vertical);
    ordersByMonthVertical.set(key, (ordersByMonthVertical.get(key) || 0) + 1);
    const elapsed = daysElapsedInMonth(item.order_ts, snapshotMonth);
    pacingByMonthVertical.set(key, Math.max(pacingByMonthVertical.get(key) || 0, elapsed));
  }

  const momOrdersByVertical: MomOrdersByVerticalRow[] = [];
  for (const vertical of VERTICALS) {
    for (let i = 0; i < months.length; i += 1) {
      const month = months[i];
      const currentOrders = ordersByMonthVertical.get(mvKey(month, vertical)) || 0;
      const previousOrders = i > 0 ? ordersByMonthVertical.get(mvKey(months[i - 1], vertical)) || 0 : null;
      const diff = previousOrders == null ? null : currentOrders - previousOrders;
      const pct = previousOrders == null || previousOrders === 0 ? null : diff! / previousOrders;
      const daysInMonth = getDaysInMonth(new Date(month));
      const ado = currentOrders / daysInMonth;
      const isPartial = isPartialMonth(month, snapshotMonth);
      const pacingDenominator = pacingByMonthVertical.get(mvKey(month, vertical)) || daysInMonth;
      const adoPacing = isPartial ? currentOrders / pacingDenominator : null;

      momOrdersByVertical.push({
        month,
        vertical,
        orders: currentOrders,
        orders_mom_abs: diff,
        orders_mom_pct: pct,
        ado_vertical: ado,
        ado_vertical_pacing: adoPacing,
        is_partial: isPartial,
      });
    }
  }

  const uniqueOrderVerticalSets = new Map<string, Set<Vertical>>();
  for (const order of processed) {
    const set = uniqueOrderVerticalSets.get(order.order_key) ?? new Set<Vertical>();
    order.verticals.forEach((vertical) => set.add(vertical));
    uniqueOrderVerticalSets.set(order.order_key, set);
  }

  const verticalSets = Array.from(uniqueOrderVerticalSets.values());
  const noVerticalPct = verticalSets.length === 0
    ? 0
    : (100 * verticalSets.filter((set) => set.size === 0).length) / verticalSets.length;
  const multiVerticalPct = verticalSets.length === 0
    ? 0
    : (100 * verticalSets.filter((set) => set.size > 1).length) / verticalSets.length;

  const headlineVsVerticals = months.map((month) => {
    const headline = ordersByMonth.get(month) || 0;
    const verticalSum = VERTICALS.reduce((acc, vertical) => acc + (ordersByMonthVertical.get(mvKey(month, vertical)) || 0), 0);
    return {
      month,
      headline,
      vertical_sum: verticalSum,
      delta: verticalSum - headline,
    };
  });

  return {
    momOrders,
    momOrdersByVertical,
    qa: {
      noVerticalPct,
      multiVerticalPct,
      unknownCount: unknownOrderKeys.size,
      headlineVsVerticals,
    },
  };
}
