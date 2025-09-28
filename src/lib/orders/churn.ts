import { addDays, addMonths, startOfMonth } from "date-fns";

import { SKU_CATEGORY_MAP, SUBSCRIPTION_CATEGORIES, CHURN_CUTOFF_KEY } from "./constants";
import type { ChurnByCategoryRow, ChurnRow, ChurnSummary, ProcessedOrderRow } from "./types";

function monthKey(date: Date) {
  return startOfMonth(date).toISOString().slice(0, 10);
}

function addMonthKey(key: string, monthsToAdd: number) {
  const [year, month] = key.split("-").map((value) => Number.parseInt(value, 10));
  const date = new Date(year, month - 1, 1);
  const plus = addMonths(date, monthsToAdd);
  return monthKey(plus);
}

function parseCadence(notes: string): number {
  const matches = notes.match(/(\d+)\s*(?:month|months|mo|mos)/gi);
  if (!matches) return 1;
  return matches
    .map((match) => Number.parseInt(match, 10))
    .filter((value) => Number.isFinite(value))
    .reduce((acc, value) => acc + value, 0) || 1;
}

export function computeChurnSummary(orders: ProcessedOrderRow[]): ChurnSummary {
  const cutoff = CHURN_CUTOFF_KEY;
  const monthSet = new Set<string>();

  const subActive = new Map<string, Set<string>>();
  const oneTimeActive = new Map<string, Set<string>>();
  const categoryActive = new Map<string, Map<string, Set<string>>>();

  const ensureMonthSet = (store: Map<string, Set<string>>, key: string) => {
    if (!store.has(key)) store.set(key, new Set());
    return store.get(key)!;
  };

  const ensureCategoryMonthSet = (category: string, month: string) => {
    if (!categoryActive.has(category)) categoryActive.set(category, new Map());
    const categoryMap = categoryActive.get(category)!;
    if (!categoryMap.has(month)) categoryMap.set(month, new Set());
    return categoryMap.get(month)!;
  };

  for (const order of orders) {
    if (order.order_month > cutoff) continue;
    monthSet.add(order.order_month);
    const categories = Array.from(new Set(order.skuNames.map((sku) => SKU_CATEGORY_MAP[sku] ?? "Unknown")));
    const isSubscription = categories.some((category) => SUBSCRIPTION_CATEGORIES.has(category));
    const customerId = order.customerId;
    if (!customerId) continue;
    if (isSubscription) {
      const period = Math.max(1, parseCadence(order.notes));
      for (let i = 0; i < period; i += 1) {
        const key = addMonthKey(order.order_month, i);
        if (key > cutoff) break;
        monthSet.add(key);
        ensureMonthSet(subActive, key).add(customerId);
        categories.forEach((category) => {
          if (SUBSCRIPTION_CATEGORIES.has(category)) {
            ensureCategoryMonthSet(category, key).add(customerId);
          }
        });
      }
    } else {
      const monthKeyCurrent = order.order_month;
      ensureMonthSet(oneTimeActive, monthKeyCurrent).add(customerId);
      categories.forEach((category) => {
        ensureCategoryMonthSet(category, monthKeyCurrent).add(customerId);
      });
      const futureKey = monthKey(addDays(order.order_ts, 30));
      if (futureKey !== monthKeyCurrent && futureKey <= cutoff) {
        monthSet.add(futureKey);
        ensureMonthSet(oneTimeActive, futureKey).add(customerId);
        categories.forEach((category) => {
          ensureCategoryMonthSet(category, futureKey).add(customerId);
        });
      }
    }
  }

  const months = Array.from(monthSet).sort();
  if (!months.length) {
    return { months: [], overview: [], byCategory: [] };
  }

  const totalActive = new Map<string, Set<string>>();
  for (const month of months) {
    const total = new Set<string>();
    const subs = subActive.get(month);
    const ones = oneTimeActive.get(month);
    if (subs) subs.forEach((id) => total.add(id));
    if (ones) ones.forEach((id) => total.add(id));
    totalActive.set(month, total);
  }

  const buildChurnSeries = (label: "subscribers" | "onetime" | "total", sets: Map<string, Set<string>>): ChurnRow[] => {
    const series: ChurnRow[] = [];
    for (let i = 1; i < months.length; i += 1) {
      const prev = sets.get(months[i - 1]) ?? new Set();
      const curr = sets.get(months[i]) ?? new Set();
      const prevSize = prev.size;
      const retained = Array.from(prev).filter((id) => curr.has(id)).length;
      const churned = prevSize - retained;
      const reactivated = Array.from(curr).filter((id) => !prev.has(id)).length;
      const churnRate = prevSize === 0 ? 0 : churned / prevSize;
      series.push({
        month: months[i],
        label,
        prevActive: prevSize,
        retained,
        churned,
        churnRate,
        reactivated,
      });
    }
    return series;
  };

  const overview: ChurnRow[] = [
    ...buildChurnSeries("subscribers", subActive),
    ...buildChurnSeries("onetime", oneTimeActive),
    ...buildChurnSeries("total", totalActive),
  ];

  const byCategory: ChurnByCategoryRow[] = [];
  for (const [category, monthMap] of categoryActive.entries()) {
    const label = category;
    for (let i = 1; i < months.length; i += 1) {
      const prev = monthMap.get(months[i - 1]) ?? new Set();
      const curr = monthMap.get(months[i]) ?? new Set();
      const prevSize = prev.size;
      const retained = Array.from(prev).filter((id) => curr.has(id)).length;
      const churned = prevSize - retained;
      const reactivated = Array.from(curr).filter((id) => !prev.has(id)).length;
      const churnRate = prevSize === 0 ? 0 : churned / prevSize;
      byCategory.push({
        month: months[i],
        category: label,
        prevActive: prevSize,
        retained,
        churned,
        churnRate,
        reactivated,
      });
    }
  }

  return { months, overview, byCategory };
}
