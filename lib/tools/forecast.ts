export type ForecastSeverity = "critical" | "warning" | "watch" | "healthy";

export type ForecastProductInput = {
  productId: string;
  sku: string;
  name: string;
  category: string;
  stockQty: number;
  reorderPoint: number;
  soldQty: number;
  lookbackDays: number;
};

export type StockoutForecast = {
  productId: string;
  sku: string;
  name: string;
  category: string;
  stockQty: number;
  reorderPoint: number;
  soldQty: number;
  lookbackDays: number;
  dailyVelocity: number;
  daysUntilStockout: number | null;
  projectedQtyAtHorizon: number;
  stockoutDate: string | null;
  severity: ForecastSeverity;
  recommendedReorderQty: number;
};

const severityRank: Record<ForecastSeverity, number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  healthy: 3,
};

export function calculateStockoutForecast(
  product: ForecastProductInput,
  horizonDays: number,
  now = new Date(),
): StockoutForecast {
  const dailyVelocity = round(product.soldQty / product.lookbackDays, 2);
  const daysUntilStockout =
    dailyVelocity > 0 ? round(product.stockQty / dailyVelocity, 1) : null;
  const projectedQtyAtHorizon = Math.max(
    0,
    Math.floor(product.stockQty - dailyVelocity * horizonDays),
  );
  const stockoutDate =
    daysUntilStockout === null
      ? null
      : addDays(now, Math.ceil(daysUntilStockout)).toISOString().slice(0, 10);
  const severity = getSeverity(
    product.stockQty,
    product.reorderPoint,
    daysUntilStockout,
    horizonDays,
  );
  const coverageTargetDays = Math.max(horizonDays, 14);
  const targetQty = Math.max(
    product.reorderPoint * 2,
    Math.ceil(dailyVelocity * coverageTargetDays),
  );
  const recommendedReorderQty =
    severity === "healthy" ? 0 : Math.max(0, targetQty - product.stockQty);

  return {
    productId: product.productId,
    sku: product.sku,
    name: product.name,
    category: product.category,
    stockQty: product.stockQty,
    reorderPoint: product.reorderPoint,
    soldQty: product.soldQty,
    lookbackDays: product.lookbackDays,
    dailyVelocity,
    daysUntilStockout,
    projectedQtyAtHorizon,
    stockoutDate,
    severity,
    recommendedReorderQty,
  };
}

export function calculateStockoutForecasts(
  products: ForecastProductInput[],
  horizonDays: number,
  now = new Date(),
) {
  return products
    .map((product) => calculateStockoutForecast(product, horizonDays, now))
    .sort((left, right) => {
      const severityDelta = severityRank[left.severity] - severityRank[right.severity];

      if (severityDelta !== 0) {
        return severityDelta;
      }

      return (
        (left.daysUntilStockout ?? Number.POSITIVE_INFINITY) -
        (right.daysUntilStockout ?? Number.POSITIVE_INFINITY)
      );
    });
}

function getSeverity(
  stockQty: number,
  reorderPoint: number,
  daysUntilStockout: number | null,
  horizonDays: number,
): ForecastSeverity {
  if (stockQty <= 0) {
    return "critical";
  }

  if (daysUntilStockout !== null && daysUntilStockout <= horizonDays) {
    return daysUntilStockout <= 3 ? "critical" : "warning";
  }

  if (stockQty <= reorderPoint) {
    return "watch";
  }

  return "healthy";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function round(value: number, precision: number) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}
