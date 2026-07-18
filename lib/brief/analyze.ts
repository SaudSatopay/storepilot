import {
  calculateStockoutForecasts,
  type StockoutForecast,
} from "@/lib/tools/forecast";

export type BriefSaleInput = {
  productId: string;
  qty: number;
  revenue: number;
  soldAt: Date;
};

export type BriefProductInput = {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  reorderPoint: number;
  stockQty: number;
  supplierName: string;
};

export type DayStat = {
  key: string;
  date: Date;
  revenue: number;
  units: number;
};

export type CategoryAnomaly = {
  category: string;
  dayKey: string;
  date: Date;
  units: number;
  typicalUnits: number;
  ratio: number;
  topProduct: {
    productId: string;
    sku: string;
    name: string;
    units: number;
  } | null;
};

export type SlowMover = {
  productId: string;
  sku: string;
  name: string;
  category: string;
  stockQty: number;
  reorderPoint: number;
  recentDailyUnits: number;
  priorDailyUnits: number;
  dropPercent: number;
  tiedUpValue: number;
};

export type StoreAnalysis = {
  asOfKey: string;
  asOfDate: Date;
  latestDay: DayStat;
  weekdayName: string;
  weekdayBaselineRevenue: number | null;
  weekdayBaselineCount: number;
  pctVsBaseline: number | null;
  topCategoryLatest: { category: string; revenue: number } | null;
  stockoutRisks: StockoutForecast[];
  anomaly: CategoryAnomaly | null;
  slowMovers: SlowMover[];
  slowMoverValue: number;
};

const ANOMALY_SCAN_DAYS = 14;
const ANOMALY_MIN_UNITS = 12;
const ANOMALY_MIN_RATIO = 1.9;
const SLOW_MOVER_MIN_PRIOR_DAILY = 0.5;
const SLOW_MOVER_MIN_DROP = 0.35;
const SLOW_MOVER_STOCK_FACTOR = 1.4;
const STOCKOUT_LOOKBACK_DAYS = 14;
const STOCKOUT_HORIZON_DAYS = 7;

export function analyzeStore(input: {
  sales: BriefSaleInput[];
  products: BriefProductInput[];
}): StoreAnalysis | null {
  const { sales, products } = input;

  if (sales.length === 0 || products.length === 0) {
    return null;
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const dailyByKey = new Map<string, DayStat>();
  const categoryDayUnits = new Map<string, number>();
  const productDayUnits = new Map<string, number>();

  for (const sale of sales) {
    const key = toDayKey(sale.soldAt);
    const stat =
      dailyByKey.get(key) ??
      ({
        key,
        date: dayKeyToDate(key),
        revenue: 0,
        units: 0,
      } satisfies DayStat);

    stat.revenue += sale.revenue;
    stat.units += sale.qty;
    dailyByKey.set(key, stat);

    const product = productById.get(sale.productId);

    if (product) {
      bumpMap(categoryDayUnits, `${product.category}|${key}`, sale.qty);
    }

    bumpMap(productDayUnits, `${sale.productId}|${key}`, sale.qty);
  }

  const days = Array.from(dailyByKey.values()).sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  const latestDay = days[days.length - 1];
  const asOfDate = latestDay.date;
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(asOfDate);

  const sameWeekdayPrior = days.filter(
    (day) =>
      day.key !== latestDay.key && day.date.getDay() === asOfDate.getDay(),
  );
  const baselineDays = sameWeekdayPrior.slice(-8);
  const weekdayBaselineRevenue =
    baselineDays.length >= 2
      ? baselineDays.reduce((sum, day) => sum + day.revenue, 0) /
        baselineDays.length
      : null;
  const pctVsBaseline =
    weekdayBaselineRevenue && weekdayBaselineRevenue > 0
      ? ((latestDay.revenue - weekdayBaselineRevenue) / weekdayBaselineRevenue) *
        100
      : null;

  const topCategoryLatest = findTopCategory(
    products,
    sales,
    productById,
    latestDay.key,
  );

  const stockoutRisks = findStockoutRisks(
    products,
    productDayUnits,
    days,
    asOfDate,
  );

  const anomaly = findCategoryAnomaly(
    products,
    productById,
    sales,
    categoryDayUnits,
    productDayUnits,
    days,
  );

  const slowMovers = findSlowMovers(products, productDayUnits, days);
  const slowMoverValue = slowMovers.reduce(
    (sum, mover) => sum + mover.tiedUpValue,
    0,
  );

  return {
    asOfKey: latestDay.key,
    asOfDate,
    latestDay,
    weekdayName,
    weekdayBaselineRevenue,
    weekdayBaselineCount: baselineDays.length,
    pctVsBaseline,
    topCategoryLatest,
    stockoutRisks,
    anomaly,
    slowMovers,
    slowMoverValue,
  };
}

function findTopCategory(
  products: BriefProductInput[],
  sales: BriefSaleInput[],
  productById: Map<string, BriefProductInput>,
  latestKey: string,
) {
  const revenueByCategory = new Map<string, number>();

  for (const sale of sales) {
    if (toDayKey(sale.soldAt) !== latestKey) {
      continue;
    }

    const product = productById.get(sale.productId);

    if (!product) {
      continue;
    }

    bumpMap(revenueByCategory, product.category, sale.revenue);
  }

  let top: { category: string; revenue: number } | null = null;

  for (const [category, revenue] of revenueByCategory) {
    if (!top || revenue > top.revenue) {
      top = { category, revenue };
    }
  }

  return top;
}

function findStockoutRisks(
  products: BriefProductInput[],
  productDayUnits: Map<string, number>,
  days: DayStat[],
  asOfDate: Date,
) {
  const lookbackKeys = lastDayKeys(days, STOCKOUT_LOOKBACK_DAYS);
  const forecasts = calculateStockoutForecasts(
    products.map((product) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      stockQty: product.stockQty,
      reorderPoint: product.reorderPoint,
      soldQty: sumProductUnits(productDayUnits, product.id, lookbackKeys),
      lookbackDays: STOCKOUT_LOOKBACK_DAYS,
    })),
    STOCKOUT_HORIZON_DAYS,
    asOfDate,
  );

  return forecasts
    .filter(
      (forecast) =>
        forecast.daysUntilStockout !== null &&
        forecast.daysUntilStockout <= STOCKOUT_HORIZON_DAYS,
    )
    .slice(0, 3);
}

function findCategoryAnomaly(
  products: BriefProductInput[],
  productById: Map<string, BriefProductInput>,
  sales: BriefSaleInput[],
  categoryDayUnits: Map<string, number>,
  productDayUnits: Map<string, number>,
  days: DayStat[],
): CategoryAnomaly | null {
  const categories = Array.from(new Set(products.map((product) => product.category)));
  const scanKeys = lastDayKeys(days, ANOMALY_SCAN_DAYS);
  const scanKeySet = new Set(scanKeys);
  let best: CategoryAnomaly | null = null;

  for (const category of categories) {
    for (const day of days) {
      if (!scanKeySet.has(day.key)) {
        continue;
      }

      const units = categoryDayUnits.get(`${category}|${day.key}`) ?? 0;

      if (units < ANOMALY_MIN_UNITS) {
        continue;
      }

      const comparisonDays = days.filter(
        (candidate) =>
          candidate.key !== day.key &&
          candidate.date.getDay() === day.date.getDay(),
      );

      if (comparisonDays.length < 3) {
        continue;
      }

      const typicalUnits =
        comparisonDays.reduce(
          (sum, candidate) =>
            sum + (categoryDayUnits.get(`${category}|${candidate.key}`) ?? 0),
          0,
        ) / comparisonDays.length;

      if (typicalUnits <= 0) {
        continue;
      }

      const ratio = units / typicalUnits;

      if (ratio < ANOMALY_MIN_RATIO) {
        continue;
      }

      const isBetter =
        !best ||
        ratio > best.ratio ||
        (ratio === best.ratio && day.key > best.dayKey);

      if (isBetter) {
        best = {
          category,
          dayKey: day.key,
          date: day.date,
          units,
          typicalUnits: roundTo(typicalUnits, 1),
          ratio: roundTo(ratio, 1),
          topProduct: findTopProductForDay(
            products,
            productDayUnits,
            category,
            day.key,
          ),
        };
      }
    }
  }

  return best;
}

function findTopProductForDay(
  products: BriefProductInput[],
  productDayUnits: Map<string, number>,
  category: string,
  dayKey: string,
) {
  let top: CategoryAnomaly["topProduct"] = null;

  for (const product of products) {
    if (product.category !== category) {
      continue;
    }

    const units = productDayUnits.get(`${product.id}|${dayKey}`) ?? 0;

    if (units > 0 && (!top || units > top.units)) {
      top = {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        units,
      };
    }
  }

  return top;
}

function findSlowMovers(
  products: BriefProductInput[],
  productDayUnits: Map<string, number>,
  days: DayStat[],
): SlowMover[] {
  const recentKeys = lastDayKeys(days, 7);
  const priorKeys = lastDayKeys(days, 28).slice(0, 21);
  const movers: SlowMover[] = [];

  if (recentKeys.length < 5 || priorKeys.length < 10) {
    return movers;
  }

  for (const product of products) {
    const recentDaily =
      sumProductUnits(productDayUnits, product.id, recentKeys) /
      recentKeys.length;
    const priorDaily =
      sumProductUnits(productDayUnits, product.id, priorKeys) / priorKeys.length;

    if (priorDaily < SLOW_MOVER_MIN_PRIOR_DAILY) {
      continue;
    }

    const drop = 1 - recentDaily / priorDaily;

    if (drop < SLOW_MOVER_MIN_DROP) {
      continue;
    }

    if (product.stockQty < product.reorderPoint * SLOW_MOVER_STOCK_FACTOR) {
      continue;
    }

    movers.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      stockQty: product.stockQty,
      reorderPoint: product.reorderPoint,
      recentDailyUnits: roundTo(recentDaily, 2),
      priorDailyUnits: roundTo(priorDaily, 2),
      dropPercent: Math.round(drop * 100),
      tiedUpValue: roundTo(product.stockQty * product.cost, 2),
    });
  }

  return movers
    .sort((left, right) => right.tiedUpValue - left.tiedUpValue)
    .slice(0, 3);
}

function lastDayKeys(days: DayStat[], count: number) {
  return days.slice(-count).map((day) => day.key);
}

function sumProductUnits(
  productDayUnits: Map<string, number>,
  productId: string,
  dayKeys: string[],
) {
  return dayKeys.reduce(
    (sum, key) => sum + (productDayUnits.get(`${productId}|${key}`) ?? 0),
    0,
  );
}

function bumpMap(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function toDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dayKeyToDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function roundTo(value: number, precision: number) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}
