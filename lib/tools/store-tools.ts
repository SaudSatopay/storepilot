import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calculateStockoutForecasts,
  type ForecastProductInput,
} from "@/lib/tools/forecast";
import {
  composeSupplierMessageInputSchema,
  draftPromoInputSchema,
  forecastStockoutsInputSchema,
  getInventoryInputSchema,
  normalizeQuerySalesInput,
  querySalesInputSchema,
  type DraftPromoInput,
  type ForecastStockoutsInput,
  type GetInventoryInput,
  type NormalizedQuerySalesInput,
  type QuerySalesInput,
} from "@/lib/tools/schemas";

type SalesGroupBy = QuerySalesInput["group_by"];

type SaleRecord = {
  qty: number;
  unitPrice: Prisma.Decimal;
  soldAt: Date;
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    supplier: {
      id: string;
      name: string;
    };
  };
};

type SalesGroup = {
  key: string;
  label: string;
  units: number;
  revenue: number;
  orderCount: number;
};

export async function querySales(input: unknown) {
  const params = normalizeQuerySalesInput(querySalesInputSchema.parse(input));
  const sales = await prisma.sale.findMany({
    where: buildSaleWhere(params),
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          category: true,
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      soldAt: "asc",
    },
  });

  const groups = groupSales(sales, params.group_by);
  const sortedGroups = sortSalesGroups(groups, params.group_by, params.metric).slice(
    0,
    params.limit,
  );
  const totals = groups.reduce(
    (acc, group) => ({
      units: acc.units + group.units,
      revenue: acc.revenue + group.revenue,
      orderCount: acc.orderCount + group.orderCount,
    }),
    { units: 0, revenue: 0, orderCount: 0 },
  );

  return {
    filters: describeSalesFilters(params),
    groupBy: params.group_by,
    totals: {
      ...totals,
      revenue: roundMoney(totals.revenue),
      averageUnitPrice:
        totals.units > 0 ? roundMoney(totals.revenue / totals.units) : 0,
    },
    rows: sortedGroups.map((group) => ({
      ...group,
      revenue: roundMoney(group.revenue),
      averageUnitPrice:
        group.units > 0 ? roundMoney(group.revenue / group.units) : 0,
    })),
  };
}

export async function getInventory(input: unknown) {
  const params = getInventoryInputSchema.parse(input);
  const products = await prisma.product.findMany({
    where: buildProductWhere(params),
    include: {
      supplier: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      stockLevel: {
        select: {
          qty: true,
          updatedAt: true,
        },
      },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: params.stock_status === "all" ? params.limit : 200,
  });

  const items = products
    .map((product) => {
      const stockQty = product.stockLevel?.qty ?? 0;
      const stockStatus = getStockStatus(stockQty, product.reorderPoint);

      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        supplier: product.supplier,
        price: Number(product.price),
        cost: Number(product.cost),
        reorderPoint: product.reorderPoint,
        stockQty,
        stockStatus,
        updatedAt: product.stockLevel?.updatedAt.toISOString() ?? null,
      };
    })
    .filter(
      (item) =>
        params.stock_status === "all" || item.stockStatus === params.stock_status,
    )
    .slice(0, params.limit);

  const summary = items.reduce(
    (acc, item) => ({
      totalProducts: acc.totalProducts + 1,
      out: acc.out + (item.stockStatus === "out" ? 1 : 0),
      low: acc.low + (item.stockStatus === "low" ? 1 : 0),
      healthy: acc.healthy + (item.stockStatus === "healthy" ? 1 : 0),
      inventoryValue: acc.inventoryValue + item.stockQty * item.cost,
    }),
    {
      totalProducts: 0,
      out: 0,
      low: 0,
      healthy: 0,
      inventoryValue: 0,
    },
  );

  return {
    filters: describeInventoryFilters(params),
    summary: {
      ...summary,
      inventoryValue: roundMoney(summary.inventoryValue),
    },
    items,
  };
}

export async function forecastStockouts(input: unknown) {
  const params = forecastStockoutsInputSchema.parse(input);
  const products = await fetchForecastProducts(params);
  const forecasts = calculateStockoutForecasts(
    products,
    params.horizon_days,
    new Date(),
  );

  return {
    generatedAt: new Date().toISOString(),
    horizonDays: params.horizon_days,
    lookbackDays: params.lookback_days,
    stockouts: forecasts.filter(
      (item) =>
        item.daysUntilStockout !== null &&
        item.daysUntilStockout <= params.horizon_days,
    ),
    watchlist: forecasts.filter((item) => item.severity === "watch").slice(0, 15),
  };
}

export async function composeSupplierMessage(input: unknown) {
  const params = composeSupplierMessageInputSchema.parse(input);
  const products = await fetchProductsForActions(
    params.product_ids,
    params.lookback_days,
  );
  const forecasts = calculateStockoutForecasts(
    products.map((product) => toForecastProduct(product, params.lookback_days)),
    14,
  );
  const forecastById = new Map(forecasts.map((forecast) => [forecast.productId, forecast]));
  const bySupplier = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      phone: string;
      lines: string[];
      productIds: string[];
    }
  >();

  for (const product of products) {
    const forecast = forecastById.get(product.id);
    const reorderQty = Math.max(
      forecast?.recommendedReorderQty ?? 0,
      product.reorderPoint,
    );
    const supplier = bySupplier.get(product.supplier.id) ?? {
      supplierId: product.supplier.id,
      supplierName: product.supplier.name,
      phone: product.supplier.phone,
      lines: [],
      productIds: [],
    };

    supplier.productIds.push(product.id);
    supplier.lines.push(
      `- ${product.name} (${product.sku}): ${reorderQty} units, current stock ${product.stockLevel?.qty ?? 0}`,
    );
    bySupplier.set(product.supplier.id, supplier);
  }

  return {
    generatedAt: new Date().toISOString(),
    messages: Array.from(bySupplier.values()).map((supplier) => ({
      ...supplier,
      message: [
        `Hi ${supplier.supplierName},`,
        "",
        "Please quote and confirm availability for:",
        ...supplier.lines,
        "",
        "Needed this week for Cedar Electronics. Thanks.",
      ].join("\n"),
    })),
  };
}

export async function draftPromo(input: unknown) {
  const params = draftPromoInputSchema.parse(input);
  const products = await fetchProductsForActions(params.product_ids, 28);
  const productSummaries = products.map((product) => {
    const recentSold = sumSalesSince(product.sales, 7);
    const priorSold = product.sales
      .filter((sale) => daysAgo(sale.soldAt) > 7)
      .reduce((sum, sale) => sum + sale.qty, 0);
    const stockQty = product.stockLevel?.qty ?? 0;
    const trend =
      priorSold > 0 ? Math.round(((recentSold - priorSold / 3) / (priorSold / 3)) * 100) : 0;

    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      price: Number(product.price),
      stockQty,
      recentSold,
      priorSold,
      trendPercent: trend,
      reason:
        stockQty > product.reorderPoint * 2
          ? "healthy stock"
          : "needs more weekend demand",
    };
  });
  const productNames = productSummaries.map((product) => product.name).join(", ");
  const channelCopy = buildPromoCopy(params, productNames);

  return {
    generatedAt: new Date().toISOString(),
    channel: params.channel,
    discountPercent: params.discount_percent,
    products: productSummaries,
    copy: channelCopy,
  };
}

export const storePilotTools = {
  query_sales: {
    description: "Summarize sales with validated filters and safe grouping.",
    inputSchema: querySalesInputSchema,
    execute: querySales,
  },
  get_inventory: {
    description: "Return inventory, suppliers, reorder points, and stock status.",
    inputSchema: getInventoryInputSchema,
    execute: getInventory,
  },
  forecast_stockouts: {
    description: "Forecast products likely to stock out inside a horizon.",
    inputSchema: forecastStockoutsInputSchema,
    execute: forecastStockouts,
  },
  compose_supplier_message: {
    description: "Draft WhatsApp-ready reorder messages grouped by supplier.",
    inputSchema: composeSupplierMessageInputSchema,
    execute: composeSupplierMessage,
  },
  draft_promo: {
    description: "Draft promotion copy for selected products.",
    inputSchema: draftPromoInputSchema,
    execute: draftPromo,
  },
};

export type StorePilotToolName = keyof typeof storePilotTools;

type ProductFilterInput = {
  product_ids?: string[];
  skus?: string[];
  categories?: string[];
  supplier_ids?: string[];
  search?: string;
};

function buildSaleWhere(params: NormalizedQuerySalesInput): Prisma.SaleWhereInput {
  const where: Prisma.SaleWhereInput = {};

  if (params.start_date || params.end_date) {
    where.soldAt = {
      gte: params.start_date,
      lte: params.end_date,
    };
  }

  const productWhere = buildProductWhere(params);
  if (Object.keys(productWhere).length > 0) {
    where.product = productWhere;
  }

  return where;
}

function buildProductWhere(params: ProductFilterInput): Prisma.ProductWhereInput {
  const conditions: Prisma.ProductWhereInput[] = [];

  if (params.product_ids?.length) {
    conditions.push({
      OR: [
        { id: { in: params.product_ids } },
        { sku: { in: params.product_ids } },
      ],
    });
  }

  if (params.skus?.length) {
    conditions.push({ sku: { in: params.skus } });
  }

  if (params.categories?.length) {
    conditions.push({ category: { in: params.categories } });
  }

  if (params.supplier_ids?.length) {
    conditions.push({ supplierId: { in: params.supplier_ids } });
  }

  if (params.search) {
    conditions.push({
      OR: [
        { name: { contains: params.search, mode: "insensitive" } },
        { sku: { contains: params.search, mode: "insensitive" } },
        { category: { contains: params.search, mode: "insensitive" } },
      ],
    });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

function groupSales(sales: SaleRecord[], groupBy: SalesGroupBy) {
  const groups = new Map<string, SalesGroup>();

  for (const sale of sales) {
    const group = getSalesGroup(sale, groupBy);
    const current =
      groups.get(group.key) ??
      ({
        ...group,
        units: 0,
        revenue: 0,
        orderCount: 0,
      } satisfies SalesGroup);

    current.units += sale.qty;
    current.revenue += sale.qty * Number(sale.unitPrice);
    current.orderCount += 1;
    groups.set(group.key, current);
  }

  return Array.from(groups.values());
}

function getSalesGroup(sale: SaleRecord, groupBy: SalesGroupBy) {
  switch (groupBy) {
    case "product":
      return {
        key: sale.product.id,
        label: `${sale.product.name} (${sale.product.sku})`,
      };
    case "category":
      return {
        key: sale.product.category,
        label: sale.product.category,
      };
    case "supplier":
      return {
        key: sale.product.supplier.id,
        label: sale.product.supplier.name,
      };
    case "day":
    default:
      return {
        key: sale.soldAt.toISOString().slice(0, 10),
        label: sale.soldAt.toISOString().slice(0, 10),
      };
  }
}

function sortSalesGroups(
  groups: SalesGroup[],
  groupBy: SalesGroupBy,
  metric: QuerySalesInput["metric"],
) {
  if (groupBy === "day") {
    return groups.sort((left, right) => right.key.localeCompare(left.key));
  }

  return groups.sort((left, right) => right[metric] - left[metric]);
}

function getStockStatus(stockQty: number, reorderPoint: number) {
  if (stockQty <= 0) {
    return "out" as const;
  }

  if (stockQty <= reorderPoint) {
    return "low" as const;
  }

  return "healthy" as const;
}

async function fetchForecastProducts(params: ForecastStockoutsInput) {
  const since = daysBefore(params.lookback_days);
  const products = await prisma.product.findMany({
    where: buildProductWhere(params),
    include: {
      stockLevel: true,
      sales: {
        where: {
          soldAt: {
            gte: since,
          },
        },
        select: {
          qty: true,
        },
      },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return products.map((product) => ({
    productId: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    stockQty: product.stockLevel?.qty ?? 0,
    reorderPoint: product.reorderPoint,
    soldQty: product.sales.reduce((sum, sale) => sum + sale.qty, 0),
    lookbackDays: params.lookback_days,
  }));
}

async function fetchProductsForActions(productIds: string[], lookbackDays: number) {
  return prisma.product.findMany({
    where: buildProductWhere({ product_ids: productIds }),
    include: {
      supplier: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      stockLevel: {
        select: {
          qty: true,
          updatedAt: true,
        },
      },
      sales: {
        where: {
          soldAt: {
            gte: daysBefore(lookbackDays),
          },
        },
        select: {
          qty: true,
          soldAt: true,
        },
      },
    },
  });
}

function toForecastProduct(
  product: Awaited<ReturnType<typeof fetchProductsForActions>>[number],
  lookbackDays: number,
): ForecastProductInput {
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    stockQty: product.stockLevel?.qty ?? 0,
    reorderPoint: product.reorderPoint,
    soldQty: product.sales.reduce((sum, sale) => sum + sale.qty, 0),
    lookbackDays,
  };
}

function buildPromoCopy(params: DraftPromoInput, productNames: string) {
  if (params.channel === "sms") {
    return `Weekend deal: save ${params.discount_percent}% on ${productNames} at Cedar Electronics. Limited stock.`;
  }

  if (params.channel === "in_store") {
    return `Weekend bundle: ${params.discount_percent}% off ${productNames}. Ask our team before checkout.`;
  }

  return `Weekend offer at Cedar Electronics: save ${params.discount_percent}% on ${productNames}. Available while stock lasts.`;
}

function sumSalesSince(
  sales: Array<{ qty: number; soldAt: Date }>,
  withinDays: number,
) {
  return sales
    .filter((sale) => daysAgo(sale.soldAt) <= withinDays)
    .reduce((sum, sale) => sum + sale.qty, 0);
}

function daysAgo(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function daysBefore(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function describeSalesFilters(params: NormalizedQuerySalesInput) {
  return {
    startDate: params.start_date?.toISOString() ?? null,
    endDate: params.end_date?.toISOString() ?? null,
    productIds: params.product_ids ?? [],
    skus: params.skus ?? [],
    categories: params.categories ?? [],
    supplierIds: params.supplier_ids ?? [],
  };
}

function describeInventoryFilters(params: GetInventoryInput) {
  return {
    productIds: params.product_ids ?? [],
    skus: params.skus ?? [],
    categories: params.categories ?? [],
    supplierIds: params.supplier_ids ?? [],
    search: params.search ?? null,
    stockStatus: params.stock_status,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
