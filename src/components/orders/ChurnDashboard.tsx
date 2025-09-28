'use client';

import { useEffect, useMemo, useState } from "react";

import type { ChurnByCategoryRow, ChurnSummary } from "@/lib/orders/types";

interface ChurnResponse {
  churn: ChurnSummary;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

export function ChurnDashboard() {
  const [data, setData] = useState<ChurnSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchChurn() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/orders/compute?source=default", { method: "POST" });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Request failed");
      }
      const payload = (await response.json()) as ChurnResponse;
      setData(payload.churn);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchChurn();
  }, []);

  const overviewRows = useMemo(() => {
    if (!data) return [] as Array<Record<string, string | number>>;
    return data.overview.map((row) => ({
      Month: row.month,
      Segment: row.label,
      "Prev active": row.prevActive,
      Retained: row.retained,
      Churned: row.churned,
      "Churn rate": formatPercent(row.churnRate),
      Reactivated: row.reactivated,
    }));
  }, [data]);

  const categoryRows = useMemo(() => {
    if (!data) return [] as Array<Record<string, string | number>>;
    return data.byCategory.map((row: ChurnByCategoryRow) => ({
      Month: row.month,
      Category: row.category,
      "Prev active": row.prevActive,
      Retained: row.retained,
      Churned: row.churned,
      "Churn rate": formatPercent(row.churnRate),
      Reactivated: row.reactivated,
    }));
  }, [data]);

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-3">
        <button
          className="px-4 py-2 rounded-md bg-blue-600 text-white disabled:opacity-60"
          onClick={() => fetchChurn()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh churn"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
        <span className="text-xs text-gray-500">
          Delivered orders only • Subscriptions defined as POM HL & POM BG coverage windows.
        </span>
      </section>

      {data && (
        <div className="space-y-5">
          <DataTable title="Logo churn overview" rows={overviewRows} />
          <DataTable title="Churn by category" rows={categoryRows} />
        </div>
      )}
    </div>
  );
}

function DataTable({ title, rows }: { title: string; rows: Array<Record<string, string | number>> }) {
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 text-sm font-semibold text-slate-900">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap bg-gray-50 px-3 py-2 text-left font-medium text-gray-600">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, index) => (
              <tr key={`${row[columns[0]]}-${index}`} className="hover:bg-gray-50">
                {columns.map((column) => (
                  <td key={`${column}-${index}`} className="whitespace-nowrap px-3 py-2 text-gray-700">
                    {row[column]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
