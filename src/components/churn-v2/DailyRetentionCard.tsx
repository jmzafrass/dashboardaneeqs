"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AnalyticsPayload, Segment } from "@/lib/analytics/churnV2Types";

type FilterSegment = Segment | "all";

export function DailyRetentionCard({ data }: { data: AnalyticsPayload }) {
  const [segment, setSegment] = useState<FilterSegment>("all");

  const chartRows = useMemo(() => {
    const relevant = data.dailyRetention.filter((row) => (segment === "all" ? true : row.segment === segment));
    const map = new Map<string, Record<string, number | string>>();
    relevant.forEach((row) => {
      const bucket = map.get(row.date) ?? { date: row.date };
      const key = `${row.segment}_7d`;
      const value = row.retention_rate_7d != null ? Number(row.retention_rate_7d) : Number(row.retention_rate);
      bucket[key] = value * 100;
      map.set(row.date, bucket);
    });
    return Array.from(map.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [data.dailyRetention, segment]);

  if (!chartRows.length) return null;

  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span>Daily retention (7-day rolling)</span>
        <div className="ml-auto flex gap-2 text-xs">
          {(["all", "subscribers", "onetime", "total"] as FilterSegment[]).map((option) => {
            const active = segment === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setSegment(option)}
                className={`rounded-full border px-2 py-1 ${
                  active ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-gray-100 text-gray-700"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartRows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" minTickGap={20} />
          <YAxis tickFormatter={(value) => `${value.toFixed(0)}%`} />
          <Tooltip formatter={(value: number) => [`${value.toFixed(2)}%`, "Retention (7d)"]} />
          <Legend />
          {(segment === "all" || segment === "subscribers") && (
            <Line type="monotone" dataKey="subscribers_7d" name="Subscribers (7d)" stroke="#1d4ed8" dot={false} />
          )}
          {(segment === "all" || segment === "onetime") && (
            <Line type="monotone" dataKey="onetime_7d" name="One-time (7d)" stroke="#f97316" dot={false} />
          )}
          {(segment === "all" || segment === "total") && (
            <Line type="monotone" dataKey="total_7d" name="Total (7d)" stroke="#16a34a" dot={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-gray-500">
        Derived from coverage windows; reflects the share of active customers retained day-over-day. The 7-day average smooths
        out cadence-driven steps.
      </p>
    </section>
  );
}
