export type Dimension = "overall" | "category" | "sku";
export type Metric = "any" | "same";
export type Measure = "revenue" | "gm";

export interface RetentionRawRow {
  cohort_month: string;
  dimension?: Dimension;
  first_value?: string;
  m?: number;
  metric?: Metric;
  cohort_size?: number;
  retention?: string | number;
  [key: string]: unknown;
}

export interface RetentionRow {
  cohortMonth: Date;
  cohortMonthKey: string;
  dimension: Dimension;
  first_value: string;
  m: number;
  metric: Metric;
  cohort_size: number;
  retention: number;
}

export interface LtvRawRow {
  cohort_type?: string;
  cohort_month: string;
  dimension?: Dimension;
  first_value?: string;
  m?: number;
  metric?: Metric;
  measure?: Measure | string;
  cohort_size?: number;
  ltv_per_user?: number | string;
  [key: string]: unknown;
}

export interface LtvRow {
  cohort_type: string;
  cohortMonth: Date;
  cohortMonthKey: string;
  dimension: Dimension;
  first_value: string;
  m: number;
  metric: Metric;
  measure: Measure;
  cohort_size: number;
  ltv_per_user: number;
}
