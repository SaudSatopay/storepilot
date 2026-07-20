import { generateMorningBrief } from "@/lib/brief/generate";
import { toDayKey } from "@/lib/brief/analyze";
import {
  forecastStockouts,
  getInventory,
  querySales,
} from "@/lib/tools";

export type LocalEvidence = {
  toolName: string;
  label: string;
  chips: string[];
};

export type LocalAnswer = {
  text: string;
  evidence: LocalEvidence[];
};

export type LocalIntent =
  | "greeting"
  | "sku"
  | "reorder"
  | "promo"
  | "sales"
  | "inventory"
  | "snapshot";

const SKU_PATTERN = /\b([a-z]{3})-(\d{3})\b/i;

export function classifyIntent(question: string): LocalIntent {
  const q = question.toLowerCase().trim();

  if (SKU_PATTERN.test(q)) {
    return "sku";
  }

  if (
    q.length <= 28 &&
    /^(hi|hey|hello|yo|salam|salaam|marhaba|hala|good (morning|afternoon|evening)|how are you)\b/.test(
      q,
    )
  ) {
    return "greeting";
  }

  if (/(reorder|restock|replenish|run(ning)?\s+out|stock\s*-?\s*out|order more|running low|about to run)/.test(q)) {
    return "reorder";
  }

  if (/(promo|promotion|discount|offer|slow mover|slow-moving|bundle|clearance|weekend deal|sale copy|move stock)/.test(q)) {
    return "promo";
  }

  if (/(sales|revenue|sold|seller|top (product|categor)|best|how did|how's|pace|money|made|earn|performance)/.test(q)) {
    return "sales";
  }

  if (/(stock|inventory|on hand|how many|available|supplier|reorder point)/.test(q)) {
    return "inventory";
  }

  return "snapshot";
}

export async function answerLocally(question: string): Promise<LocalAnswer> {
  const intent = classifyIntent(question);

  switch (intent) {
    case "greeting":
      return greetingAnswer();
    case "sku":
      return skuAnswer(question);
    case "reorder":
      return reorderAnswer();
    case "promo":
      return promoAnswer();
    case "sales":
      return salesAnswer();
    case "inventory":
      return inventoryAnswer();
    default:
      return snapshotAnswer();
  }
}

function greetingAnswer(): LocalAnswer {
  return {
    text: "Morning. The brief on the left has today's stories. You can ask me things like: What should I reorder this week? How were sales this week? What is slow right now? Or paste a SKU like CHG-001 and I will pull it up.",
    evidence: [],
  };
}

async function skuAnswer(question: string): Promise<LocalAnswer> {
  const match = question.match(SKU_PATTERN);
  const sku = match ? match[0].toUpperCase() : "";
  const inventory = await getInventory({ skus: [sku], limit: 1 });
  const item = inventory.items[0];

  if (!item) {
    return {
      text: `I could not find ${sku} in the catalog. Check the SKU and try again, or ask me about a product by name.`,
      evidence: [],
    };
  }

  const statusLine =
    item.stockStatus === "out"
      ? "It is out of stock."
      : item.stockStatus === "low"
        ? "It is at or below its reorder point, so it belongs on the next supplier order."
        : "Stock is healthy.";

  return {
    text: `${item.name} (${item.sku}): ${item.stockQty} in stock against a reorder point of ${item.reorderPoint}, priced at SAR ${item.price}. Supplier is ${item.supplier.name}. ${statusLine}`,
    evidence: [
      {
        toolName: "get_inventory",
        label: "Inventory lookup",
        chips: [
          `${item.sku}: ${item.stockQty} stock, reorder ${item.reorderPoint}`,
          `${item.supplier.name}`,
        ],
      },
    ],
  };
}

async function reorderAnswer(): Promise<LocalAnswer> {
  const forecast = await forecastStockouts({ horizon_days: 7, lookback_days: 14 });
  const stockouts = forecast.stockouts.slice(0, 3);

  if (stockouts.length === 0) {
    return {
      text: "I checked the 7-day stockout forecast and nothing runs out this week. Stock levels are covering current velocity.",
      evidence: [],
    };
  }

  const lines = stockouts.map(
    (item) =>
      `${item.name} (${item.sku}): ${item.stockQty} in stock, selling ${item.dailyVelocity}/day, about ${item.daysUntilStockout} days of cover, recommended reorder ${item.recommendedReorderQty} units.`,
  );

  return {
    text: `Reorder these first this week: ${stockouts
      .map((item) => `${item.name} (${item.sku})`)
      .join(", ")}. ${lines.join(" ")} Tap Draft reorder below and the supplier message is ready to send.`,
    evidence: [
      {
        toolName: "forecast_stockouts",
        label: "Stockout forecast",
        chips: stockouts.map(
          (item) =>
            `${item.sku}: ${item.stockQty} stock, ${item.dailyVelocity}/day, ${item.daysUntilStockout} days`,
        ),
      },
    ],
  };
}

async function promoAnswer(): Promise<LocalAnswer> {
  const brief = await generateMorningBrief({});
  const opportunity = brief.items.find((item) => item.type === "opportunity");

  if (!opportunity) {
    return {
      text: "Nothing qualifies as a slow mover with promo-ready stock right now. Sales pace and stock levels look balanced.",
      evidence: [],
    };
  }

  return {
    text: `${opportunity.title}. ${opportunity.body} Tap Draft promo below to get the copy with a discount and channel picker.`,
    evidence: [
      {
        toolName: "brief",
        label: "Slow mover analysis",
        chips: [`${opportunity.metric} ${opportunity.metricLabel}`],
      },
    ],
  };
}

async function salesAnswer(): Promise<LocalAnswer> {
  const { start, end } = lastDaysRange(7);
  const sales = await querySales({
    start_date: start,
    end_date: end,
    group_by: "category",
    metric: "revenue",
    limit: 3,
  });
  const totals = sales.totals;
  const top = sales.rows;

  if (totals.units === 0) {
    return {
      text: "I found no sales in the last 7 days. Import data or reseed the demo store.",
      evidence: [],
    };
  }

  const topLine =
    top.length > 0
      ? ` ${top[0].label} led at SAR ${Math.round(top[0].revenue).toLocaleString("en-US")}${
          top[1]
            ? `, then ${top[1].label} at SAR ${Math.round(top[1].revenue).toLocaleString("en-US")}`
            : ""
        }.`
      : "";

  return {
    text: `Last 7 days: SAR ${Math.round(totals.revenue).toLocaleString("en-US")} across ${totals.units} units.${topLine} Ask about any category or product for a closer look.`,
    evidence: [
      {
        toolName: "query_sales",
        label: "Sales, last 7 days",
        chips: [
          `SAR ${Math.round(totals.revenue).toLocaleString("en-US")} revenue`,
          `${totals.units} units`,
          ...top.slice(0, 2).map(
            (row) => `${row.label}: SAR ${Math.round(row.revenue).toLocaleString("en-US")}`,
          ),
        ],
      },
    ],
  };
}

async function inventoryAnswer(): Promise<LocalAnswer> {
  const inventory = await getInventory({ stock_status: "low", limit: 5 });
  const items = inventory.items;

  if (items.length === 0) {
    return {
      text: "No products are below their reorder points right now. The shelf is in good shape.",
      evidence: [],
    };
  }

  return {
    text: `${items.length} product${items.length === 1 ? " is" : "s are"} at or below reorder point: ${items
      .map((item) => `${item.name} (${item.sku}, ${item.stockQty} left)`)
      .join(", ")}. Ask what to reorder this week and I will rank them by risk.`,
    evidence: [
      {
        toolName: "get_inventory",
        label: "Low stock",
        chips: items
          .slice(0, 4)
          .map((item) => `${item.sku}: ${item.stockQty} stock, reorder ${item.reorderPoint}`),
      },
    ],
  };
}

async function snapshotAnswer(): Promise<LocalAnswer> {
  const { start, end } = lastDaysRange(7);
  const [sales, forecast] = await Promise.all([
    querySales({
      start_date: start,
      end_date: end,
      group_by: "category",
      metric: "revenue",
      limit: 1,
    }),
    forecastStockouts({ horizon_days: 7, lookback_days: 14 }),
  ]);
  const riskCount = forecast.stockouts.length;
  const top = sales.rows[0];

  return {
    text: `Here is the store at a glance: SAR ${Math.round(sales.totals.revenue).toLocaleString(
      "en-US",
    )} in sales over the last 7 days${top ? `, led by ${top.label}` : ""}, and ${
      riskCount === 0 ? "nothing" : `${riskCount} product${riskCount === 1 ? "" : "s"}`
    } close to stocking out. Ask me what to reorder, how sales are pacing, or what deserves a weekend promo.`,
    evidence: [
      {
        toolName: "query_sales",
        label: "Store snapshot",
        chips: [
          `SAR ${Math.round(sales.totals.revenue).toLocaleString("en-US")} last 7 days`,
          `${riskCount} stockout risk${riskCount === 1 ? "" : "s"}`,
        ],
      },
    ],
  };
}

function lastDaysRange(days: number) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (days - 1));

  return { start: toDayKey(startDate), end: toDayKey(now) };
}
