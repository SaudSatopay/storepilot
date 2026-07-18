import { prisma } from "@/lib/prisma";
import {
  getOpenAIClient,
  hasUsableOpenAIKey,
  storePilotModel,
} from "@/lib/openai";
import {
  analyzeStore,
  type BriefProductInput,
  type BriefSaleInput,
  type StoreAnalysis,
} from "@/lib/brief/analyze";
import { composeBrief } from "@/lib/brief/compose";
import type { MorningBrief } from "@/lib/brief/types";

const briefCache = new Map<string, MorningBrief>();

export async function generateMorningBrief(options: {
  fresh?: boolean;
}): Promise<MorningBrief> {
  const [storeProfile, products, sales] = await Promise.all([
    prisma.storeProfile.findFirst(),
    prisma.product.findMany({
      include: {
        supplier: { select: { name: true } },
        stockLevel: { select: { qty: true } },
      },
    }),
    prisma.sale.findMany({
      select: {
        productId: true,
        qty: true,
        unitPrice: true,
        soldAt: true,
      },
    }),
  ]);

  const storeName = storeProfile?.name ?? "Demo store";
  const analysisInput = {
    products: products.map(
      (product): BriefProductInput => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        price: Number(product.price),
        cost: Number(product.cost),
        reorderPoint: product.reorderPoint,
        stockQty: product.stockLevel?.qty ?? 0,
        supplierName: product.supplier.name,
      }),
    ),
    sales: sales.map(
      (sale): BriefSaleInput => ({
        productId: sale.productId,
        qty: sale.qty,
        revenue: sale.qty * Number(sale.unitPrice),
        soldAt: sale.soldAt,
      }),
    ),
  };

  const analysis = analyzeStore(analysisInput);

  if (!analysis) {
    return emptyBrief(storeName);
  }

  const base = composeBrief(analysis, { storeName });
  const wantsModel = hasUsableOpenAIKey();
  const cacheKey = `${base.asOfDate}:${sales.length}:${wantsModel ? "model" : "local"}`;

  if (!options.fresh) {
    const cached = briefCache.get(cacheKey);

    if (cached) {
      return cached;
    }
  }

  let brief = base;

  if (wantsModel) {
    try {
      brief = await rewriteWithModel(base, analysis);
    } catch (error) {
      console.error("Morning brief model rewrite failed, using local copy.", error);
      brief = base;
    }
  }

  briefCache.set(cacheKey, brief);
  return brief;
}

const briefRewriteSchema = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "One lead sentence for the top of the brief, under 90 characters.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: {
            type: "string",
            description: "Punchy card title under 70 characters.",
          },
          body: {
            type: "string",
            description:
              "Two to three sentences. Keep every number from the facts exactly as given.",
          },
        },
        required: ["id", "title", "body"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "items"],
  additionalProperties: false,
} as const;

async function rewriteWithModel(
  base: MorningBrief,
  analysis: StoreAnalysis,
): Promise<MorningBrief> {
  const client = getOpenAIClient();
  const facts = {
    storeName: base.storeName,
    asOfLabel: base.asOfLabel,
    items: base.items.map((item) => ({
      id: item.id,
      type: item.type,
      severity: item.severity,
      draftTitle: item.title,
      draftBody: item.body,
      metric: item.metric,
      metricLabel: item.metricLabel,
    })),
    stockoutRisks: analysis.stockoutRisks.map((risk) => ({
      name: risk.name,
      sku: risk.sku,
      stockQty: risk.stockQty,
      dailyVelocity: risk.dailyVelocity,
      daysUntilStockout: risk.daysUntilStockout,
      recommendedReorderQty: risk.recommendedReorderQty,
    })),
    anomaly: analysis.anomaly,
    slowMovers: analysis.slowMovers,
  };

  const response = await client.responses.create(
    {
      model: storePilotModel,
      instructions: [
        "You are StorePilot, a pragmatic store manager writing the owner's morning brief.",
        "Rewrite the draft titles and bodies so they read sharp and human, like a trusted manager talking.",
        "Keep every number, SKU, product name, and unit exactly as given in the facts. Never invent data.",
        "No exclamation marks, no emoji, no em dashes. Plain confident language.",
        "Return one rewritten entry for every draft item id.",
      ].join("\n"),
      input: JSON.stringify(facts),
      text: {
        format: {
          type: "json_schema",
          name: "morning_brief_rewrite",
          schema: briefRewriteSchema as unknown as Record<string, unknown>,
          strict: true,
        },
      },
      max_output_tokens: 900,
    },
    { timeout: 25000 },
  );

  const parsed = JSON.parse(response.output_text) as {
    headline: string;
    items: Array<{ id: string; title: string; body: string }>;
  };
  const rewriteById = new Map(parsed.items.map((item) => [item.id, item]));

  return {
    ...base,
    mode: "model",
    headline: parsed.headline || base.headline,
    items: base.items.map((item) => {
      const rewrite = rewriteById.get(item.id);

      if (!rewrite) {
        return item;
      }

      return {
        ...item,
        title: rewrite.title || item.title,
        body: rewrite.body || item.body,
      };
    }),
  };
}

function emptyBrief(storeName: string): MorningBrief {
  const now = new Date();

  return {
    generatedAt: now.toISOString(),
    asOfDate: now.toISOString().slice(0, 10),
    asOfLabel: new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(now),
    storeName,
    mode: "local",
    headline: "No sales data yet. Import data or run the seed to get a brief.",
    priority: "low",
    items: [],
  };
}
