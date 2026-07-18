export type BriefItemType = "summary" | "stockout" | "anomaly" | "opportunity";

export type BriefSeverity = "low" | "medium" | "high";

export type BriefActionKind = "reorder" | "promo";

export type BriefAction = {
  kind: BriefActionKind;
  label: string;
  productIds: string[];
};

export type BriefItem = {
  id: string;
  type: BriefItemType;
  severity: BriefSeverity;
  title: string;
  body: string;
  metric: string;
  metricLabel: string;
  action: BriefAction | null;
};

export type MorningBrief = {
  generatedAt: string;
  asOfDate: string;
  asOfLabel: string;
  storeName: string;
  mode: "model" | "local";
  headline: string;
  priority: BriefSeverity;
  items: BriefItem[];
};
