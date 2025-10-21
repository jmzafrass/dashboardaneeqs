"use client";

import type { SubscriberForecast } from "@/lib/orders/compute";

const numberFormatter = new Intl.NumberFormat("en-US");

export function SubscriberForecastCard({ forecast }: { forecast: SubscriberForecast }) {
  const remaining = Math.max(0, forecast.estIncrementalTotal - forecast.mtdIncremental);

  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="mb-2 text-sm font-semibold">
        Subscriber forecast ({forecast.month})
      </div>
      <div className="mb-3 text-2xl font-semibold text-slate-900">
        {numberFormatter.format(forecast.forecastSubscribersEOM)}
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({numberFormatter.format(forecast.lower)} – {numberFormatter.format(forecast.upper)})
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
        <div>
          <dt className="text-gray-500">Carryover</dt>
          <dd className="font-medium text-slate-900">{numberFormatter.format(forecast.carryover)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">MTD incremental starts</dt>
          <dd className="font-medium text-slate-900">{numberFormatter.format(forecast.mtdIncremental)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Expected remaining</dt>
          <dd className="font-medium text-slate-900">{numberFormatter.format(Math.max(0, remaining))}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-gray-500">
        As of {forecast.asOfDate}. Remaining incremental starts estimated using the weighted day-of-month pattern
        from the previous three months.
      </p>
    </section>
  );
}
