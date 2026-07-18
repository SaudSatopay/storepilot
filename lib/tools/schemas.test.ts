import { describe, expect, it } from "vitest";
import { normalizeQuerySalesInput, querySalesInputSchema } from "./schemas";

describe("querySalesInputSchema", () => {
  it("normalizes end_date to include the full final day", () => {
    const parsed = normalizeQuerySalesInput(
      querySalesInputSchema.parse({
        start_date: "2026-07-01",
        end_date: "2026-07-18",
      }),
    );

    expect(parsed.end_date?.toISOString()).toBe("2026-07-18T23:59:59.999Z");
  });

  it("keeps start_date before the normalized end_date on the same day", () => {
    const parsed = normalizeQuerySalesInput(
      querySalesInputSchema.parse({
        start_date: "2026-07-18T18:30:00.000Z",
        end_date: "2026-07-18",
      }),
    );

    expect(parsed.start_date?.toISOString()).toBe("2026-07-18T18:30:00.000Z");
    expect(parsed.end_date?.toISOString()).toBe("2026-07-18T23:59:59.999Z");
  });
});
