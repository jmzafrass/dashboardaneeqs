'use client';

import { useEffect, useState } from "react";

import { FiltersProvider } from "./FiltersContext";
import type { ComputeAllResult } from "@/lib/orders/compute";

import { FiltersBar } from "./FiltersBar";
import { WaterfallCard } from "./WaterfallCard";
import { ChurnCard } from "./ChurnCard";
import { RetentionHeatmapCard } from "./RetentionHeatmapCard";
import { SurvivalCard } from "./SurvivalCard";
import { DailyRetentionCard } from "./DailyRetentionCard";

export function ChurnV2Dashboard() {
  const [data, setData] = useState<ComputeAllResult | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/orders/compute?source=default", { method: "POST", cache: "no-store" });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as {
          churn: ComputeAllResult["churn"];
          retention: ComputeAllResult["retention"];
          ltv: ComputeAllResult["ltv"];
          survival: ComputeAllResult["survival"];
          waterfall: ComputeAllResult["waterfall"];
          asOfMonth: string;
        };

        const result: ComputeAllResult = {
          churn: payload.churn,
          retention: payload.retention,
          ltv: payload.ltv,
          survival: payload.survival,
          waterfall: payload.waterfall,
          asOfMonth: payload.asOfMonth,
        };

        const categorySet = new Set<string>();
        result.churn.byCategory.forEach((row) => categorySet.add(row.category.toLowerCase()));
        result.waterfall.forEach((row) => categorySet.add(row.category.toLowerCase()));
        result.survival.forEach((row) => categorySet.add(row.category.toLowerCase()));
        result.retention
          .filter((row) => row.dimension === "category")
          .forEach((row) => categorySet.add(row.first_value.toLowerCase()));

        setCategories(Array.from(categorySet).sort());
        setData(result);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load analytics data");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading && !data) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-gray-600 shadow">
        Loading analytics data…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-red-600 shadow">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <FiltersProvider>
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Churn &amp; Retention overview (as of {data.asOfMonth})</h2>
          {error && <span className="text-xs text-red-600">Latest load error: {error}</span>}
        </div>

        <FiltersBar categories={categories} />

        <WaterfallCard data={data} />
        <ChurnCard data={data} />
        <RetentionHeatmapCard data={data} />
        <SurvivalCard data={data} />
        <DailyRetentionCard data={data} />
      </section>
    </FiltersProvider>
  );
}
