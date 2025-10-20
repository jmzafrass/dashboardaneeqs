export type Segment = "subscribers" | "onetime" | "total";

export type Category = "pom hl" | "pom bg" | "pom sh" | "otc hl" | "otc sh" | "otc sk";

export interface RetentionV2CsvRow {
  cohort_month: string;
  dimension: "overall" | "category" | "sku";
  first_value: string;
  m: number;
  metric: "any" | "same";
  cohort_size: number;
  retention: string | number;
}

export interface LtvV2CsvRow {
  cohort_type: string;
  cohort_month: string;
  dimension: "overall" | "category" | "sku";
  first_value: string;
  m: number;
  metric: "any" | "same";
  measure: "revenue" | "gm";
  cohort_size: number | string;
  ltv_per_user: number | string;
}

export interface ChurnOverallCsvRow {
  month: string;
  prev_active_total?: number;
  retained_total?: number;
  churned_total?: number;
  churn_rate_total?: number | string;
  prev_active_subscribers?: number;
  retained_subscribers?: number;
  churned_subscribers?: number;
  churn_rate_subscribers?: number | string;
  prev_active_onetime?: number;
  retained_onetime?: number;
  churned_onetime?: number;
  churn_rate_onetime?: number | string;
}

export interface ChurnByCategoryCsvRow {
  month: string;
  category: string;
  prev_active: number;
  retained: number;
  churned: number;
  churn_rate: number | string;
}

export interface WaterfallCsvRow {
  month: string;
  category: string;
  start_active: number;
  new_active: number;
  reactivated: number;
  churned: number;
  end_active: number;
}

export interface SurvivalCsvRow {
  cohort_month: string;
  category: string;
  m: number;
  cohort_size: number;
  survival_rate: number | string;
}

export interface DailyRetentionCsvRow {
  date: string;
  segment: Segment;
  prev_active: number;
  retained: number;
  churned: number;
  retention_rate: number | string;
  churn_rate: number | string;
  retention_rate_7d?: number | string;
}

export interface AnalyticsPayload {
  asOfMonth: string;
  categories: string[];
  retention: RetentionV2CsvRow[];
  ltv: LtvV2CsvRow[];
  churnOverall: ChurnOverallCsvRow[];
  churnByCategory: ChurnByCategoryCsvRow[];
  waterfall: WaterfallCsvRow[];
  survival: SurvivalCsvRow[];
  dailyRetention: DailyRetentionCsvRow[];
}
