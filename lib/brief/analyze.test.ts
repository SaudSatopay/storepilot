import { describe, expect, it } from "vitest";
import {
  analyzeStore,
  toDayKey,
  type BriefProductInput,
  type BriefSaleInput,
} from "./analyze";
import { composeBrief } from "./compose";

const END = new Date(2026, 6, 17, 12, 0, 0, 0);
const DAYS = 60;

function dateDaysAgo(daysAgo: number, hour = 14) {
  const date = new Date(END);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function product(overrides: Partial<BriefProductInput>): BriefProductInput {
  return {
    id: "p-base",
    sku: "BASE-001",
    name: "Base product",
    category: "Base",
    price: 100,
    cost: 60,
    reorderPoint: 10,
    stockQty: 40,
    supplierName: "Base Supplier",
    ...overrides,
  };
}

function buildFixture() {
  const products: BriefProductInput[] = [
    product({
      id: "p-steady",
      sku: "STD-001",
      name: "Steady seller",
      category: "Steady",
      stockQty: 200,
    }),
    product({
      id: "p-spike",
      sku: "SPK-001",
      name: "Spiking gadget",
      category: "Spiky",
      stockQty: 120,
    }),
    product({
      id: "p-slow",
      sku: "SLW-001",
      name: "Slowing gadget",
      category: "Slowing",
      cost: 40,
      stockQty: 60,
      reorderPoint: 12,
    }),
    product({
      id: "p-runout",
      sku: "OUT-001",
      name: "Running out gadget",
      category: "Runout",
      stockQty: 6,
      reorderPoint: 8,
    }),
  ];

  const sales: BriefSaleInput[] = [];

  for (let daysAgo = 0; daysAgo < DAYS; daysAgo += 1) {
    const soldAt = dateDaysAgo(daysAgo);

    sales.push({ productId: "p-steady", qty: 10, revenue: 1000, soldAt });

    sales.push({ productId: "p-spike", qty: daysAgo === 4 ? 40 : 8, revenue: daysAgo === 4 ? 4000 : 800, soldAt });

    const slowQty = daysAgo < 7 ? 1 : 3;
    sales.push({
      productId: "p-slow",
      qty: slowQty,
      revenue: slowQty * 100,
      soldAt,
    });

    if (daysAgo < 14) {
      sales.push({ productId: "p-runout", qty: 3, revenue: 300, soldAt });
    }
  }

  return { products, sales };
}

describe("analyzeStore", () => {
  const analysis = analyzeStore(buildFixture());

  it("anchors to the latest sale day", () => {
    expect(analysis).not.toBeNull();
    expect(analysis?.asOfKey).toBe(toDayKey(END));
    expect(analysis?.weekdayName).toBe("Friday");
  });

  it("computes a weekday baseline and pace delta", () => {
    expect(analysis?.weekdayBaselineRevenue).toBeGreaterThan(0);
    expect(analysis?.pctVsBaseline).not.toBeNull();
  });

  it("finds the planted category spike", () => {
    expect(analysis?.anomaly).not.toBeNull();
    expect(analysis?.anomaly?.category).toBe("Spiky");
    expect(analysis?.anomaly?.ratio).toBeGreaterThanOrEqual(1.9);
    expect(analysis?.anomaly?.topProduct?.sku).toBe("SPK-001");
  });

  it("flags the product about to run out", () => {
    const skus = analysis?.stockoutRisks.map((risk) => risk.sku) ?? [];
    expect(skus).toContain("OUT-001");
  });

  it("finds slow movers with stock above reorder point", () => {
    const skus = analysis?.slowMovers.map((mover) => mover.sku) ?? [];
    expect(skus).toContain("SLW-001");
    const slow = analysis?.slowMovers.find((mover) => mover.sku === "SLW-001");
    expect(slow?.dropPercent).toBeGreaterThanOrEqual(35);
    expect(slow?.tiedUpValue).toBe(2400);
  });

  it("returns null when there is no data", () => {
    expect(analyzeStore({ sales: [], products: [] })).toBeNull();
  });
});

describe("composeBrief", () => {
  const analysis = analyzeStore(buildFixture());

  it("leads with the stockout story and carries action product ids", () => {
    expect(analysis).not.toBeNull();

    if (!analysis) {
      return;
    }

    const brief = composeBrief(analysis, {
      storeName: "Test Store",
      generatedAt: new Date(2026, 6, 18, 8, 0, 0, 0),
    });

    expect(brief.priority).toBe("high");
    expect(brief.items[0]?.type).toBe("stockout");
    expect(brief.items[0]?.action?.kind).toBe("reorder");
    expect(brief.items[0]?.action?.productIds).toContain("p-runout");

    const promo = brief.items.find((item) => item.action?.kind === "promo");
    expect(promo?.action?.productIds).toContain("p-slow");

    const types = brief.items.map((item) => item.type);
    expect(types).toContain("summary");
    expect(types).toContain("anomaly");
    expect(brief.headline.length).toBeGreaterThan(10);
    expect(brief.mode).toBe("local");
  });
});
