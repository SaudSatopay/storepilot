import { z } from "zod";

const stringList = z.array(z.string().min(1)).max(50);
const dateString = z.string().min(1).max(40);

export const querySalesInputSchema = z
  .object({
    start_date: dateString.optional(),
    end_date: dateString.optional(),
    product_ids: stringList.optional(),
    skus: stringList.optional(),
    categories: stringList.optional(),
    supplier_ids: stringList.optional(),
    group_by: z.enum(["day", "product", "category", "supplier"]).default("day"),
    metric: z.enum(["revenue", "units"]).default("revenue"),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .superRefine((value, context) => {
    const startDate = value.start_date ? parseToolDate(value.start_date) : null;
    const endDate = value.end_date ? parseToolDate(value.end_date) : null;

    if (value.start_date && !startDate) {
      context.addIssue({
        code: "custom",
        message: "start_date must be a valid date",
        path: ["start_date"],
      });
    }

    if (value.end_date && !endDate) {
      context.addIssue({
        code: "custom",
        message: "end_date must be a valid date",
        path: ["end_date"],
      });
    }

    if (startDate && endDate && startDate > toEndOfUtcDay(endDate)) {
      context.addIssue({
        code: "custom",
        message: "start_date must be before end_date",
        path: ["start_date"],
      });
    }
  });

export const getInventoryInputSchema = z.object({
  product_ids: stringList.optional(),
  skus: stringList.optional(),
  categories: stringList.optional(),
  supplier_ids: stringList.optional(),
  search: z.string().min(1).max(80).optional(),
  stock_status: z.enum(["all", "out", "low", "healthy"]).default("all"),
  limit: z.number().int().min(1).max(100).default(50),
});

export const forecastStockoutsInputSchema = z.object({
  horizon_days: z.number().int().min(1).max(90).default(14),
  lookback_days: z.number().int().min(3).max(60).default(14),
  product_ids: stringList.optional(),
  skus: stringList.optional(),
  categories: stringList.optional(),
});

export const composeSupplierMessageInputSchema = z.object({
  product_ids: z.array(z.string().min(1)).min(1).max(20),
  lookback_days: z.number().int().min(3).max(60).default(14),
});

export const draftPromoInputSchema = z.object({
  product_ids: z.array(z.string().min(1)).min(1).max(10),
  discount_percent: z.number().int().min(5).max(40).default(15),
  channel: z.enum(["whatsapp", "sms", "in_store"]).default("whatsapp"),
});

export type QuerySalesInput = z.infer<typeof querySalesInputSchema>;
export type GetInventoryInput = z.infer<typeof getInventoryInputSchema>;
export type ForecastStockoutsInput = z.infer<typeof forecastStockoutsInputSchema>;
export type ComposeSupplierMessageInput = z.infer<
  typeof composeSupplierMessageInputSchema
>;
export type DraftPromoInput = z.infer<typeof draftPromoInputSchema>;

export type NormalizedQuerySalesInput = Omit<
  QuerySalesInput,
  "start_date" | "end_date"
> & {
  start_date?: Date;
  end_date?: Date;
};

export function normalizeQuerySalesInput(
  input: QuerySalesInput,
): NormalizedQuerySalesInput {
  const startDate = input.start_date ? parseToolDate(input.start_date) : null;
  const endDate = input.end_date ? parseToolDate(input.end_date) : null;

  return {
    ...input,
    start_date: startDate ?? undefined,
    end_date: endDate ? toEndOfUtcDay(endDate) : undefined,
  };
}

function parseToolDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toEndOfUtcDay(date: Date) {
  const endDate = new Date(date);
  endDate.setUTCHours(23, 59, 59, 999);
  return endDate;
}
