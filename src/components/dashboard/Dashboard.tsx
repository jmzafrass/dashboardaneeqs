'use client';

import { useEffect, useMemo, useState } from "react";

import { LtvFilters } from "@/components/filters/LtvFilters";
import { RetentionFilters } from "@/components/filters/RetentionFilters";
import { LtvHeatmap } from "@/components/tables/LtvHeatmap";
import { HeatmapRow, RetentionHeatmap } from "@/components/tables/RetentionHeatmap";
import { useLtvData } from "@/hooks/useLtvData";
import { useRetentionData } from "@/hooks/useRetentionData";
import { RETENTION_URL, LTV_URL } from "@/lib/analytics/constants";
import { addMonths, classNames, monthKeyFromDate, monthsDiff } from "@/lib/analytics/utils";
import type { Dimension, Measure, Metric, LtvRow, RetentionRow } from "@/lib/analytics/types";

interface PivotResult {
  rows: HeatmapRow[];
  maxMonth: number;
  maxValue?: number;
}

function buildRetentionPivot(
  rows: RetentionRow[],
  filters: {
    dimension: Dimension;
    metric: Metric;
    firstValue: string;
    startMonth: string;
    endMonth: string;
  },
  lastObservedMonth: string,
): PivotResult {
  const filtered = rows.filter((row) => {
    if (row.dimension !== filters.dimension) return false;
    if (filters.dimension !== "overall" && row.first_value !== filters.firstValue) return false;
    if (row.metric !== filters.metric) return false;
    if (filters.startMonth && row.cohortMonthKey < filters.startMonth) return false;
    if (filters.endMonth && row.cohortMonthKey > filters.endMonth) return false;
    if (filters.dimension === "overall" && row.first_value !== "ALL") return false;
    return true;
  });

  const byMonth = new Map<string, { size: number; values: Record<number, number | undefined> }>();
  for (const row of filtered) {
    if (!byMonth.has(row.cohortMonthKey)) {
      byMonth.set(row.cohortMonthKey, { size: row.cohort_size, values: {} });
    }
    const group = byMonth.get(row.cohortMonthKey)!;
    const allowed = lastObservedMonth ? monthsDiff(row.cohortMonthKey, lastObservedMonth) : Number.MAX_SAFE_INTEGER;
    if (lastObservedMonth && row.m > allowed) continue;
    group.values[row.m] = row.retention;
  }

  const ordered = Array.from(byMonth.entries())
    .map(([cohortMonth, group]) => ({
      cohortMonth,
      cohortSize: group.size,
      values: group.values,
    }))
    .sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth));

  const maxMonth = filtered.length
    ? lastObservedMonth
      ? Math.max(0, ...filtered.map((row) => monthsDiff(row.cohortMonthKey, lastObservedMonth)))
      : Math.max(0, ...filtered.map((row) => row.m))
    : 0;

  return { rows: ordered, maxMonth };
}

function buildLtvPivot(
  rows: LtvRow[],
  filters: {
    dimension: Dimension;
    metric: Metric;
    measure: Measure;
    firstValue: string;
    startMonth: string;
    endMonth: string;
  },
  lastObservedMonth: string,
): PivotResult {
  const filtered = rows.filter((row) => {
    if (row.dimension !== filters.dimension) return false;
    if (filters.dimension !== "overall" && row.first_value !== filters.firstValue) return false;
    if (row.metric !== filters.metric) return false;
    if (row.measure !== filters.measure) return false;
    if (filters.startMonth && row.cohortMonthKey < filters.startMonth) return false;
    if (filters.endMonth && row.cohortMonthKey > filters.endMonth) return false;
    if (lastObservedMonth && row.cohortMonthKey >= lastObservedMonth) return false;
    if (filters.dimension === "overall" && row.first_value !== "ALL") return false;
    return true;
  });

  const byMonth = new Map<string, { size: number; values: Record<number, number | undefined> }>();
  let maxValue = 0;

  for (const row of filtered) {
    if (!byMonth.has(row.cohortMonthKey)) {
      byMonth.set(row.cohortMonthKey, { size: row.cohort_size, values: {} });
    }
    const group = byMonth.get(row.cohortMonthKey)!;
    const allowed = lastObservedMonth ? monthsDiff(row.cohortMonthKey, lastObservedMonth) : Number.MAX_SAFE_INTEGER;
    if (lastObservedMonth && row.m > allowed) continue;
    if (row.ltv_per_user <= 0) continue;
    group.values[row.m] = row.ltv_per_user;
    if (row.ltv_per_user > maxValue) maxValue = row.ltv_per_user;
  }

  const ordered = Array.from(byMonth.entries())
    .map(([cohortMonth, group]) => ({
      cohortMonth,
      cohortSize: group.size,
      values: group.values,
    }))
    .sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth));

  const maxMonth = filtered.length
    ? lastObservedMonth
      ? Math.max(0, ...filtered.map((row) => monthsDiff(row.cohortMonthKey, lastObservedMonth)))
      : Math.max(0, ...filtered.map((row) => row.m))
    : 0;

  return { rows: ordered, maxMonth, maxValue };
}

function retentionCellColor(value?: number) {
  if (value === undefined) return "bg-gray-50 text-gray-400";
  if (value >= 0.9) return "bg-sky-600 text-white";
  if (value >= 0.75) return "bg-sky-500 text-white";
  if (value >= 0.6) return "bg-sky-400 text-white";
  if (value >= 0.45) return "bg-sky-300";
  if (value >= 0.3) return "bg-sky-200";
  if (value >= 0.15) return "bg-sky-100";
  return "bg-sky-50";
}

function ltvCellColor(value: number | undefined, max: number) {
  if (value === undefined) return "bg-gray-50 text-gray-400";
  if (max <= 0) return "bg-sky-50";
  const ratio = value / max;
  if (ratio >= 0.9) return "bg-sky-600 text-white";
  if (ratio >= 0.75) return "bg-sky-500 text-white";
  if (ratio >= 0.6) return "bg-sky-400 text-white";
  if (ratio >= 0.45) return "bg-sky-300";
  if (ratio >= 0.3) return "bg-sky-200";
  if (ratio >= 0.15) return "bg-sky-100";
  return "bg-sky-50";
}

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<"retention" | "ltv">("retention");
  const [refreshKey, setRefreshKey] = useState(() => Date.now());

  const {
    rows: retentionRows,
    error: retentionError,
    isLoading: retentionLoading,
    usingFallback: retentionFallback,
  } = useRetentionData(refreshKey);

  const { rows: ltvRows, error: ltvError, isLoading: ltvLoading, usingFallback: ltvFallback } = useLtvData(refreshKey);

  const [dimension, setDimension] = useState<Dimension>("overall");
  const [metric, setMetric] = useState<Metric>("any");
  const [firstValue, setFirstValue] = useState("ALL");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");

  const [ltvDimension, setLtvDimension] = useState<Dimension>("overall");
  const [ltvMetric, setLtvMetric] = useState<Metric>("any");
  const [ltvFirstValue, setLtvFirstValue] = useState("ALL");
  const [ltvMeasure, setLtvMeasure] = useState<Measure>("revenue");
  const [ltvStartMonth, setLtvStartMonth] = useState("");
  const [ltvEndMonth, setLtvEndMonth] = useState("");

  const uniqueRetention = useMemo(() => {
    const categories = Array.from(
      new Set(retentionRows.filter((row) => row.dimension === "category").map((row) => row.first_value)),
    )
      .filter(Boolean)
      .sort();
    const skus = Array.from(
      new Set(retentionRows.filter((row) => row.dimension === "sku").map((row) => row.first_value)),
    )
      .filter(Boolean)
      .sort();
    const months = Array.from(new Set(retentionRows.map((row) => row.cohortMonthKey))).sort();
    return { categories, skus, months };
  }, [retentionRows]);

  const uniqueLtv = useMemo(() => {
    const categories = Array.from(new Set(ltvRows.filter((row) => row.dimension === "category").map((row) => row.first_value)))
      .filter(Boolean)
      .sort();
    const skus = Array.from(new Set(ltvRows.filter((row) => row.dimension === "sku").map((row) => row.first_value)))
      .filter(Boolean)
      .sort();
    const months = Array.from(new Set(ltvRows.map((row) => row.cohortMonthKey))).sort();
    return { categories, skus, months };
  }, [ltvRows]);

  useEffect(() => {
    if (!startMonth && uniqueRetention.months.length) {
      setStartMonth(uniqueRetention.months[0]);
    }
    if (!endMonth && uniqueRetention.months.length) {
      setEndMonth(uniqueRetention.months[uniqueRetention.months.length - 1]);
    }
  }, [uniqueRetention.months, startMonth, endMonth]);

  useEffect(() => {
    if (!ltvStartMonth && uniqueLtv.months.length) {
      setLtvStartMonth(uniqueLtv.months[0]);
    }
    if (!ltvEndMonth && uniqueLtv.months.length) {
      setLtvEndMonth(uniqueLtv.months[uniqueLtv.months.length - 1]);
    }
  }, [uniqueLtv.months, ltvStartMonth, ltvEndMonth]);

  useEffect(() => {
    if (dimension === "category" && !uniqueRetention.categories.includes(firstValue)) {
      setFirstValue(uniqueRetention.categories[0] ?? "");
    }
    if (dimension === "sku" && !uniqueRetention.skus.includes(firstValue)) {
      setFirstValue(uniqueRetention.skus[0] ?? "");
    }
  }, [dimension, firstValue, uniqueRetention.categories, uniqueRetention.skus]);

  useEffect(() => {
    if (ltvDimension === "category" && !uniqueLtv.categories.includes(ltvFirstValue)) {
      setLtvFirstValue(uniqueLtv.categories[0] ?? "");
    }
    if (ltvDimension === "sku" && !uniqueLtv.skus.includes(ltvFirstValue)) {
      setLtvFirstValue(uniqueLtv.skus[0] ?? "");
    }
  }, [ltvDimension, ltvFirstValue, uniqueLtv.categories, uniqueLtv.skus]);

  const lastObservedRetentionMonth = useMemo(() => {
    const cohortZero = retentionRows.filter((row) => row.m === 0);
    if (!cohortZero.length) return "";
    const lastKey = cohortZero.reduce((latest, row) => (row.cohortMonthKey > latest ? row.cohortMonthKey : latest), "");
    if (!lastKey) return "";
    const [year, month] = lastKey.split("-").map((value) => Number.parseInt(value, 10));
    if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
    const end = addMonths(new Date(year, month - 1, 1), 1);
    return monthKeyFromDate(end);
  }, [retentionRows]);

  const lastObservedLtvMonth = lastObservedRetentionMonth;

  const effectiveMetric = dimension === "overall" ? "any" : metric;
  const effectiveFirstValue = dimension === "overall" ? "ALL" : firstValue;

  const effectiveLtvMetric = ltvDimension === "overall" ? "any" : ltvMetric;
  const effectiveLtvFirstValue = ltvDimension === "overall" ? "ALL" : ltvFirstValue;

  const retentionPivot = useMemo(
    () =>
      buildRetentionPivot(
        retentionRows,
        {
          dimension,
          metric: effectiveMetric,
          firstValue: effectiveFirstValue,
          startMonth,
          endMonth,
        },
        lastObservedRetentionMonth,
      ),
    [retentionRows, dimension, effectiveMetric, effectiveFirstValue, startMonth, endMonth, lastObservedRetentionMonth],
  );

  const ltvPivot = useMemo(
    () =>
      buildLtvPivot(
        ltvRows,
        {
          dimension: ltvDimension,
          metric: effectiveLtvMetric,
          measure: ltvMeasure,
          firstValue: effectiveLtvFirstValue,
          startMonth: ltvStartMonth,
          endMonth: ltvEndMonth,
        },
        lastObservedLtvMonth,
      ),
    [
      ltvRows,
      ltvDimension,
      effectiveLtvMetric,
      ltvMeasure,
      effectiveLtvFirstValue,
      ltvStartMonth,
      ltvEndMonth,
      lastObservedLtvMonth,
    ],
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="p-6 max-w-[1400px] mx-auto">
        <h1 className="text-2xl font-bold mb-6">Customer Analytics Dashboard</h1>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="bg-white p-4 rounded-xl shadow">
            <div className="text-sm font-medium mb-1">Retention data source</div>
            <div className="text-xs text-gray-600 break-all">
              {retentionFallback
                ? "Embedded fallback sample"
                : `Local CSV asset (${RETENTION_URL})`}
            </div>
            <div className="text-[11px] text-gray-500 mt-2">Parsed rows: {retentionRows.length}</div>
            {retentionError && <div className="mt-2 text-xs text-red-600">{String(retentionError)}</div>}
          </div>
          <div className="bg-white p-4 rounded-xl shadow">
            <div className="text-sm font-medium mb-1">LTV data source</div>
            <div className="text-xs text-gray-600 break-all">
              {ltvFallback ? "Embedded fallback sample" : `Local CSV asset (${LTV_URL})`}
            </div>
            <div className="text-[11px] text-gray-500 mt-2">Parsed rows: {ltvRows.length}</div>
            {ltvError && <div className="mt-2 text-xs text-red-600">{String(ltvError)}</div>}
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            className={classNames(
              "px-4 py-2 rounded-lg text-sm font-medium",
              activeTab === "retention" ? "bg-blue-600 text-white" : "bg-gray-200",
            )}
            onClick={() => setActiveTab("retention")}
          >
            Retention
          </button>
          <button
            className={classNames(
              "px-4 py-2 rounded-lg text-sm font-medium",
              activeTab === "ltv" ? "bg-blue-600 text-white" : "bg-gray-200",
            )}
            onClick={() => setActiveTab("ltv")}
          >
            LTV
          </button>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200"
            onClick={() => setRefreshKey(Date.now())}
            title="Re-run data fetches"
          >
            Refresh
          </button>
        </div>

        {activeTab === "retention" && (
          <div className="space-y-4">
            <RetentionFilters
              dimension={dimension}
              metric={effectiveMetric}
              firstValue={effectiveFirstValue}
              startMonth={startMonth}
              endMonth={endMonth}
              months={uniqueRetention.months}
              categories={uniqueRetention.categories}
              skus={uniqueRetention.skus}
              onDimensionChange={(value) => {
                setDimension(value);
                if (value === "overall") {
                  setMetric("any");
                  setFirstValue("ALL");
                } else if (value === "category") {
                  setFirstValue(uniqueRetention.categories[0] ?? "");
                } else {
                  setFirstValue(uniqueRetention.skus[0] ?? "");
                }
              }}
              onMetricChange={(value) => setMetric(value)}
              onFirstValueChange={(value) => setFirstValue(value)}
              onStartMonthChange={setStartMonth}
              onEndMonthChange={setEndMonth}
            />

            <RetentionHeatmap
              rows={retentionPivot.rows}
              maxMonth={retentionPivot.maxMonth}
              cellColor={retentionCellColor}
            />

            <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded">
              <p>
                <strong>Notes:</strong> Retention uses delivered-only purchases; dates are parsed day-first (dd/mm/yyyy) in the
                source pipeline. &quot;Any&quot; counts any-product repurchase; &quot;Same&quot; counts stickiness within the first category/SKU.
              </p>
              {(retentionLoading || !retentionRows.length) && <p className="mt-1">Loading retention data…</p>}
            </div>
          </div>
        )}

        {activeTab === "ltv" && (
          <div className="space-y-4">
            <LtvFilters
              dimension={ltvDimension}
              metric={effectiveLtvMetric}
              measure={ltvMeasure}
              firstValue={effectiveLtvFirstValue}
              startMonth={ltvStartMonth}
              endMonth={ltvEndMonth}
              months={uniqueLtv.months}
              categories={uniqueLtv.categories}
              skus={uniqueLtv.skus}
              onDimensionChange={(value) => {
                setLtvDimension(value);
                if (value === "overall") {
                  setLtvMetric("any");
                  setLtvFirstValue("ALL");
                } else if (value === "category") {
                  setLtvFirstValue(uniqueLtv.categories[0] ?? "");
                } else {
                  setLtvFirstValue(uniqueLtv.skus[0] ?? "");
                }
              }}
              onMetricChange={(value) => setLtvMetric(value)}
              onMeasureChange={(value) => setLtvMeasure(value)}
              onFirstValueChange={(value) => setLtvFirstValue(value)}
              onStartMonthChange={setLtvStartMonth}
              onEndMonthChange={setLtvEndMonth}
            />

            <LtvHeatmap
              rows={ltvPivot.rows}
              maxMonth={ltvPivot.maxMonth}
              maxValue={ltvPivot.maxValue ?? 0}
              cellColor={ltvCellColor}
            />

            <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded">
              <p>
                <strong>Notes:</strong> LTV is cumulative per-user revenue or gross margin for each cohort (delivered-only).
                <em> Any</em> includes all spend; <em>Same</em> includes only the same category/SKU as the first purchase. Dates parsed
                day-first (dd/mm/yyyy). No right-censoring beyond data coverage.
              </p>
              {(ltvLoading || !ltvRows.length) && <p className="mt-1">Loading LTV data…</p>}
              {ltvError && <p className="mt-1 text-red-600">{String(ltvError)}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
