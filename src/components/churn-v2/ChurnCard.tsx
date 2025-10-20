"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AnalyticsPayload } from "@/lib/analytics/churnV2Types";
import { useFilters } from "@/lib/analytics/filtersContext";

function formatMonth(month: string) {
  return month?.slice(0, 7) ?? month;
}

export function ChurnCard({ data }: { data: AnalyticsPayload }) {
  const { category, segment } = useFilters();

  const rows = useMemo(() => {
    if (category === "all") {
      const rateKey =
        segment === "subscribers" ? "churn_rate_subscribers" : segment === "onetime" ? "churn_rate_onetime" : "churn_rate_total";
      const churnedKey =
        segment === "subscribers"
          ? "churned_subscribers"
          : segment === "onetime"
            ? "churned_onetime"
            : "churned_total";
      return data.churnOverall
        .map((row) => ({
          month: formatMonth(row.month),
          churned: row[churnedKey] ?? 0,
          rate: ((row[rateKey] as number | undefined) ?? 0) * 100,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
    }

    return data.churnByCategory
      .filter((row) => row.category.toLowerCase() === category)
      .map((row) => ({
        month: formatMonth(row.month),
        churned: row.churned,
        rate: Number(row.churn_rate ?? 0) * 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [category, data.churnByCategory, data.churnOverall, segment]);

  if (!rows.length) return null;

  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="mb-2 text-sm font-semibold">
        Monthly churn {category === "all" ? "(overall)" : `(${category})`} · {segment}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis yAxisId="counts" />
          <YAxis yAxisId="percent" orientation="right" tickFormatter={(value) => `${value.toFixed(0)}%`} />
          <Tooltip
            formatter={(value: number, name: string) =>
              name === "Churn rate" ? [`${value.toFixed(2)}%`, name] : [value, name]
            }
          />
          <Legend />
          <Bar yAxisId="counts" dataKey="churned" name="Churned" fill="#f97316" />
          <Line yAxisId="percent" type="monotone" dataKey="rate" name="Churn rate" stroke="#1d4ed8" dot />
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}
