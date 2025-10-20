"use client";

import { createContext, useContext, useMemo, useState } from "react";

import type { Category, Segment } from "./churnV2Types";
import type { Metric } from "./types";

type CategoryFilter = Category | "all";
type SegmentFilter = Segment | "total";
type CategoryMode = "first" | "ever";

interface FiltersState {
  category: CategoryFilter;
  setCategory: (value: CategoryFilter) => void;
  segment: SegmentFilter;
  setSegment: (value: SegmentFilter) => void;
  metric: Metric;
  setMetric: (value: Metric) => void;
  categoryMode: CategoryMode;
  setCategoryMode: (value: CategoryMode) => void;
}

const FiltersContext = createContext<FiltersState | null>(null);

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [segment, setSegment] = useState<SegmentFilter>("total");
  const [metric, setMetric] = useState<Metric>("any");
  const [categoryMode, setCategoryMode] = useState<CategoryMode>("first");

  const value = useMemo(
    () => ({
      category,
      setCategory,
      segment,
      setSegment,
      metric,
      setMetric,
      categoryMode,
      setCategoryMode,
    }),
    [category, segment, metric, categoryMode],
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const state = useContext(FiltersContext);
  if (!state) {
    throw new Error("useFilters must be used within FiltersProvider");
  }
  return state;
}
