import { z } from "zod";

const stringList = z.array(z.string().min(1)).max(50);

export const querySalesInputSchema = z
  .object({
    start_date: z.coerce.date().optional(),
    end_date: z.coerce.date().optional(),
    product_ids: stringList.optional(),
    skus: stringList.optional(),
    categories: stringList.optional(),
    supplier_ids: stringList.optional(),
    group_by: z.enum(["day", "product", "category", "supplier"]).default("day"),
    metric: z.enum(["revenue", "units"]).default("revenue"),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .refine(
    (value) =>
      !value.start_date || !value.end_date || value.start_date <= value.end_date,
    {
      message: "start_date must be before end_date",
      path: ["start_date"],
    },
  );

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
