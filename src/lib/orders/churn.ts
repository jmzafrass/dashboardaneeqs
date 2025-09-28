import { addDays, addMonths, startOfDay, startOfMonth } from "date-fns";

import { CHURN_CUTOFF_KEY, SKU_CATEGORY_MAP, SUBSCRIPTION_CATEGORIES } from "./constants";
import type { ChurnByCategoryRow, ChurnRow, ChurnSummary, ProcessedOrderRow } from "./types";

const CUTOFF_DATE = new Date(CHURN_CUTOFF_KEY);
const CUTOFF_KEY = CHURN_CUTOFF_KEY;

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

function markDaily(store: Map<string, Set<string>>, start: Date, endExclusive: Date, customerId: string) {
  let current = startOfDay(start);
  const cutoff = startOfDay(CUTOFF_DATE);
  while (current < endExclusive && current <= cutoff) {
    const key = current.toISOString().slice(0, 10);
    if (!store.has(key)) store.set(key, new Set());
    store.get(key)!.add(customerId);
    current = addDays(current, 1);
  }
}

export function computeChurnSummary(orders: ProcessedOrderRow[]): ChurnSummary {
  const monthSet = new Set<string>();
  const subActive = new Map<string, Set<string>>();
  const oneTimeActive = new Map<string, Set<string>>();
  const categoryActive = new Map<string, Map<string, Set<string>>>();
  const dailySubs = new Map<string, Set<string>>();
  const dailyOneTime = new Map<string, Set<string>>();

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
    if (order.order_month > CUTOFF_KEY) continue;
    monthSet.add(order.order_month);

    const categories = Array.from(new Set(order.skuNames.map((sku) => SKU_CATEGORY_MAP[sku] ?? "Unknown")));
    const isSubscription = categories.some((category) => SUBSCRIPTION_CATEGORIES.has(category));
    const customerId = order.customerId;
    if (!customerId) continue;

    if (isSubscription) {
      const period = Math.max(1, parseCadence(order.notes));
      for (let i = 0; i < period; i += 1) {
        const key = addMonthKey(order.order_month, i);
        if (key > CUTOFF_KEY) break;
        monthSet.add(key);
        ensureMonthSet(subActive, key).add(customerId);
        categories.forEach((category) => {
          if (SUBSCRIPTION_CATEGORIES.has(category)) {
            ensureCategoryMonthSet(category, key).add(customerId);
          }
        });
      }

      const start = order.order_ts;
      const end = addMonths(start, period);
      markDaily(dailySubs, start, end, customerId);
    } else {
      const monthKeyCurrent = order.order_month;
      ensureMonthSet(oneTimeActive, monthKeyCurrent).add(customerId);
      categories.forEach((category) => {
        ensureCategoryMonthSet(category, monthKeyCurrent).add(customerId);
      });

      const spillKey = monthKey(addDays(order.order_ts, 30));
      if (spillKey !== monthKeyCurrent && spillKey <= CUTOFF_KEY) {
        monthSet.add(spillKey);
        ensureMonthSet(oneTimeActive, spillKey).add(customerId);
        categories.forEach((category) => {
          ensureCategoryMonthSet(category, spillKey).add(customerId);
        });
      }

      const start = order.order_ts;
      const end = addDays(start, 30);
      markDaily(dailyOneTime, start, end, customerId);
    }
  }

  const months = Array.from(monthSet).sort();
  if (!months.length) {
    return { months: [], overview: [], byCategory: [], daily: [] };
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
        category,
        prevActive: prevSize,
        retained,
        churned,
        churnRate,
        reactivated,
      });
    }
  }

  const dailyKeys = new Set<string>([...dailySubs.keys(), ...dailyOneTime.keys()]);
  const daily = Array.from(dailyKeys)
    .sort()
    .filter((key) => key <= CUTOFF_KEY)
    .map((key) => {
      const subs = dailySubs.get(key) ?? new Set();
      const ones = dailyOneTime.get(key) ?? new Set();
      const total = new Set<string>();
      subs.forEach((id) => total.add(id));
      ones.forEach((id) => total.add(id));
      return {
        date: key,
        subscribers: subs.size,
        onetime: ones.size,
        total: total.size,
      };
    });

  return { months, overview, byCategory, daily };
}
