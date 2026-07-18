import type { StoreAnalysis } from "@/lib/brief/analyze";
import type { BriefItem, BriefSeverity, MorningBrief } from "@/lib/brief/types";

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function composeBrief(
  analysis: StoreAnalysis,
  options: { storeName: string; generatedAt?: Date },
): MorningBrief {
  const items: BriefItem[] = [];
  const summaryItem = composeSummary(analysis);
  const stockoutItem = composeStockouts(analysis);
  const anomalyItem = composeAnomaly(analysis);
  const opportunityItem = composeOpportunity(analysis);

  if (stockoutItem) {
    items.push(stockoutItem);
  }

  if (summaryItem) {
    items.push(summaryItem);
  }

  if (anomalyItem) {
    items.push(anomalyItem);
  }

  if (opportunityItem) {
    items.push(opportunityItem);
  }

  const priority = derivePriority(items);
  const headline = deriveHeadline(analysis, items);

  return {
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    asOfDate: analysis.asOfKey,
    asOfLabel: formatDayLabel(analysis.asOfDate),
    storeName: options.storeName,
    mode: "local",
    headline,
    priority,
    items,
  };
}

function composeSummary(analysis: StoreAnalysis): BriefItem | null {
  const { latestDay, weekdayName, weekdayBaselineRevenue, pctVsBaseline } =
    analysis;

  if (pctVsBaseline === null || weekdayBaselineRevenue === null) {
    return {
      id: "summary",
      type: "summary",
      severity: "low",
      title: `${weekdayName} closed at ${sar(latestDay.revenue)}`,
      body: `${latestDay.units} units sold across the day. Not enough history yet to compare against a typical ${weekdayName}.`,
      metric: sar(latestDay.revenue),
      metricLabel: "Latest day revenue",
      action: null,
    };
  }

  const direction = pctVsBaseline >= 0 ? "above" : "below";
  const pct = Math.round(Math.abs(pctVsBaseline));
  const lead = analysis.topCategoryLatest;
  const leadSentence = lead
    ? ` ${lead.category} led the day at ${sar(lead.revenue)}.`
    : "";

  return {
    id: "summary",
    type: "summary",
    severity: pctVsBaseline <= -15 ? "medium" : "low",
    title: `${weekdayName} closed ${pct}% ${direction} its usual pace`,
    body: `Revenue reached ${sar(latestDay.revenue)} against a ${sar(
      weekdayBaselineRevenue,
    )} average for recent ${weekdayName}s.${leadSentence}`,
    metric: `${pctVsBaseline >= 0 ? "+" : "-"}${pct}%`,
    metricLabel: `vs typical ${weekdayName}`,
    action: null,
  };
}

function composeStockouts(analysis: StoreAnalysis): BriefItem | null {
  const risks = analysis.stockoutRisks;

  if (risks.length === 0) {
    return null;
  }

  const first = risks[0];
  const minDays = Math.min(
    ...risks.map((risk) => risk.daysUntilStockout ?? Number.POSITIVE_INFINITY),
  );
  const title =
    risks.length === 1
      ? `${first.name} runs out in about ${formatDays(minDays)}`
      : `${risks.length} products run out within ${formatDays(
          Math.max(
            ...risks.map(
              (risk) => risk.daysUntilStockout ?? 0,
            ),
          ),
        )}`;
  const body = risks
    .map(
      (risk) =>
        `${risk.name} (${risk.sku}) has ${risk.stockQty} left, selling ${risk.dailyVelocity} per day, about ${formatDays(
          risk.daysUntilStockout ?? 0,
        )} of cover.`,
    )
    .join(" ");

  return {
    id: "stockout",
    type: "stockout",
    severity: "high",
    title,
    body: `${body} Recommended reorder quantities are ready for the supplier message.`,
    metric: `${formatDays(minDays)}`,
    metricLabel: "Shortest cover",
    action: {
      kind: "reorder",
      label: "Draft reorder",
      productIds: risks.map((risk) => risk.productId),
    },
  };
}

function composeAnomaly(analysis: StoreAnalysis): BriefItem | null {
  const anomaly = analysis.anomaly;

  if (!anomaly) {
    return null;
  }

  const topProduct = anomaly.topProduct;
  const topSentence = topProduct
    ? ` ${topProduct.name} (${topProduct.sku}) drove it with ${topProduct.units} units.`
    : "";

  return {
    id: "anomaly",
    type: "anomaly",
    severity: "medium",
    title: `${anomaly.category} spiked to ${anomaly.ratio}x normal on ${formatDayLabel(
      anomaly.date,
    )}`,
    body: `${anomaly.units} units sold against a typical ${anomaly.typicalUnits} for that weekday.${topSentence} Worth checking whether a bulk buyer or an event drove it.`,
    metric: `${anomaly.ratio}x`,
    metricLabel: "vs typical day",
    action: null,
  };
}

function composeOpportunity(analysis: StoreAnalysis): BriefItem | null {
  const movers = analysis.slowMovers;

  if (movers.length === 0) {
    return null;
  }

  const names = movers
    .map((mover) => `${mover.name} (${mover.sku})`)
    .join(", ");
  const avgDrop = Math.round(
    movers.reduce((sum, mover) => sum + mover.dropPercent, 0) / movers.length,
  );

  return {
    id: "opportunity",
    type: "opportunity",
    severity: "medium",
    title: `${sar(analysis.slowMoverValue)} is sitting in slow movers`,
    body: `${names} are pacing about ${avgDrop}% below their prior three weeks while stock sits above reorder point. A weekend promo frees the cash.`,
    metric: `-${avgDrop}%`,
    metricLabel: "vs prior 3 weeks",
    action: {
      kind: "promo",
      label: "Draft promo",
      productIds: movers.map((mover) => mover.productId),
    },
  };
}

function derivePriority(items: BriefItem[]): BriefSeverity {
  if (items.some((item) => item.severity === "high")) {
    return "high";
  }

  if (items.some((item) => item.severity === "medium")) {
    return "medium";
  }

  return "low";
}

function deriveHeadline(analysis: StoreAnalysis, items: BriefItem[]) {
  const firstRisk = analysis.stockoutRisks[0];

  if (firstRisk && firstRisk.stockoutDate) {
    return `Reorder ${firstRisk.name} before ${formatDayLabel(
      new Date(`${firstRisk.stockoutDate}T12:00:00`),
    )}`;
  }

  return items[0]?.title ?? "All quiet. Store is pacing normally.";
}

export function sar(value: number) {
  return `SAR ${numberFormat.format(Math.round(value))}`;
}

function formatDays(days: number) {
  const rounded = Math.round(days * 10) / 10;
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

export function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}
