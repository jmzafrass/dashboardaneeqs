import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  AnalyticsPayload,
  RetentionV2CsvRow,
  LtvV2CsvRow,
  ChurnOverallCsvRow,
  ChurnByCategoryCsvRow,
  WaterfallCsvRow,
  SurvivalCsvRow,
  DailyRetentionCsvRow,
} from "@/lib/analytics/churnV2Types";

const DATA_DIR = path.join(process.cwd(), "public", "data");

async function readCsv<T>(filename: string): Promise<T[]> {
  const filePath = path.join(DATA_DIR, filename);
  const buffer = await fs.readFile(filePath);
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true }) as T[];
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parsePercent(value: unknown): number {
  if (value == null) return 0;
  const stringified = String(value).trim();
  if (!stringified.length) return 0;
  if (stringified.endsWith("%")) {
    const numeric = Number(stringified.slice(0, -1));
    return Number.isFinite(numeric) ? numeric / 100 : 0;
  }
  return toNumber(stringified);
}

export async function GET() {
  try {
    const [
      retention,
      ltv,
      churnOverall,
      churnByCategory,
      waterfall,
      survival,
      dailyRetention,
    ] = await Promise.all([
      readCsv<RetentionV2CsvRow>("purchase_retention.csv"),
      readCsv<LtvV2CsvRow>("ltv_purchase_revenue.csv").catch(() => []),
      readCsv<ChurnOverallCsvRow>("churn_overall_by_month.csv"),
      readCsv<ChurnByCategoryCsvRow>("churn_by_vertical_by_month.csv"),
      readCsv<WaterfallCsvRow>("active_waterfall_by_category.csv"),
      readCsv<SurvivalCsvRow>("subscriber_survival_by_cohort.csv").catch(() => []),
      readCsv<DailyRetentionCsvRow>("daily_retention_rate.csv").catch(() => []),
    ]);

    retention.forEach((row) => {
      row.cohort_size = toNumber(row.cohort_size);
      if (typeof row.retention === "string") {
        row.retention = parsePercent(row.retention);
      } else {
        row.retention = toNumber(row.retention);
      }
    });

    ltv.forEach((row) => {
      row.cohort_size = toNumber(row.cohort_size);
      row.ltv_per_user = toNumber(row.ltv_per_user);
    });

    churnOverall.forEach((row) => {
      row.churn_rate_total = parsePercent(row.churn_rate_total);
      row.churn_rate_subscribers = parsePercent(row.churn_rate_subscribers);
      row.churn_rate_onetime = parsePercent(row.churn_rate_onetime);
    });

    churnByCategory.forEach((row) => {
      row.churn_rate = parsePercent(row.churn_rate);
    });

    survival.forEach((row) => {
      row.survival_rate = toNumber(row.survival_rate);
    });

    dailyRetention.forEach((row) => {
      row.retention_rate = toNumber(row.retention_rate);
      row.churn_rate = toNumber(row.churn_rate);
      if (row.retention_rate_7d != null) {
        row.retention_rate_7d = toNumber(row.retention_rate_7d);
      }
    });

    const categorySet = new Set<string>();
    retention
      .filter((row) => row.dimension === "category")
      .forEach((row) => categorySet.add(row.first_value.toLowerCase()));
    churnByCategory.forEach((row) => categorySet.add(row.category.toLowerCase()));
    waterfall.forEach((row) => categorySet.add(row.category.toLowerCase()));
    survival.forEach((row) => {
      if (row.category) categorySet.add(row.category.toLowerCase());
    });

    const categories = Array.from(categorySet).sort();
    const monthKeys = [
      ...retention.map((row) => row.cohort_month),
      ...churnOverall.map((row) => row.month),
      ...waterfall.map((row) => row.month),
      ...survival.map((row) => row.cohort_month),
    ]
      .filter(Boolean)
      .sort();
    const asOfMonth = monthKeys.length ? monthKeys[monthKeys.length - 1].slice(0, 7) : "—";

    const payload: AnalyticsPayload = {
      asOfMonth,
      categories,
      retention,
      ltv,
      churnOverall,
      churnByCategory,
      waterfall,
      survival,
      dailyRetention,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load analytics data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
