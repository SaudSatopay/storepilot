import { describe, expect, it } from "vitest";
import {
  calculateStockoutForecast,
  calculateStockoutForecasts,
  type ForecastProductInput,
} from "./forecast";

const now = new Date("2026-07-18T12:00:00.000Z");

function product(overrides: Partial<ForecastProductInput>): ForecastProductInput {
  return {
    productId: "product-1",
    sku: "SKU-001",
    name: "Test product",
    category: "Test",
    stockQty: 20,
    reorderPoint: 10,
    soldQty: 14,
    lookbackDays: 14,
    ...overrides,
  };
}

describe("calculateStockoutForecast", () => {
  it("flags stockouts inside the horizon using moving-average velocity", () => {
    const forecast = calculateStockoutForecast(
      product({ stockQty: 10, reorderPoint: 10, soldQty: 28 }),
      7,
      now,
    );

    expect(forecast.dailyVelocity).toBe(2);
    expect(forecast.daysUntilStockout).toBe(5);
    expect(forecast.projectedQtyAtHorizon).toBe(0);
    expect(forecast.stockoutDate).toBe("2026-07-23");
    expect(forecast.severity).toBe("warning");
    expect(forecast.recommendedReorderQty).toBe(18);
  });

  it("marks products as critical when coverage is three days or less", () => {
    const forecast = calculateStockoutForecast(
      product({ stockQty: 6, reorderPoint: 10, soldQty: 28 }),
      14,
      now,
    );

    expect(forecast.daysUntilStockout).toBe(3);
    expect(forecast.severity).toBe("critical");
    expect(forecast.recommendedReorderQty).toBe(22);
  });

  it("does not invent a stockout date when velocity is zero", () => {
    const forecast = calculateStockoutForecast(
      product({ stockQty: 24, reorderPoint: 10, soldQty: 0 }),
      14,
      now,
    );

    expect(forecast.dailyVelocity).toBe(0);
    expect(forecast.daysUntilStockout).toBeNull();
    expect(forecast.stockoutDate).toBeNull();
    expect(forecast.projectedQtyAtHorizon).toBe(24);
    expect(forecast.severity).toBe("healthy");
    expect(forecast.recommendedReorderQty).toBe(0);
  });

  it("keeps no-velocity products on the watchlist when stock is below reorder point", () => {
    const forecast = calculateStockoutForecast(
      product({ stockQty: 8, reorderPoint: 10, soldQty: 0 }),
      14,
      now,
    );

    expect(forecast.severity).toBe("watch");
    expect(forecast.recommendedReorderQty).toBe(12);
  });
});

describe("calculateStockoutForecasts", () => {
  it("sorts urgent products before watchlist and healthy products", () => {
    const forecasts = calculateStockoutForecasts(
      [
        product({
          productId: "healthy",
          sku: "HEALTHY",
          stockQty: 80,
          reorderPoint: 10,
          soldQty: 14,
        }),
        product({
          productId: "warning",
          sku: "WARNING",
          stockQty: 10,
          reorderPoint: 10,
          soldQty: 28,
        }),
        product({
          productId: "critical",
          sku: "CRITICAL",
          stockQty: 4,
          reorderPoint: 10,
          soldQty: 28,
        }),
        product({
          productId: "watch",
          sku: "WATCH",
          stockQty: 8,
          reorderPoint: 10,
          soldQty: 0,
        }),
      ],
      7,
      now,
    );

    expect(forecasts.map((forecast) => forecast.productId)).toEqual([
      "critical",
      "warning",
      "watch",
      "healthy",
    ]);
  });
});
