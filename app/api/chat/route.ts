import OpenAI from "openai";
import type {
  FunctionTool,
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import { z } from "zod";
import { friendlyErrorMessage, logServerError } from "@/lib/errors";
import {
  getOpenAIClient,
  hasUsableOpenAIKey,
  storePilotModel,
} from "@/lib/openai";
import {
  forecastStockouts,
  getInventory,
  querySales,
  storePilotTools,
  type StorePilotToolName,
} from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatStreamEvent =
  | { type: "status"; message: string }
  | { type: "evidence"; toolName: string; label: string; chips: string[] }
  | { type: "delta"; text: string }
  | { type: "done"; responseId?: string; fallback?: boolean }
  | { type: "error"; message: string };

const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(24),
});

const systemPrompt = [
  "You are StorePilot, a pragmatic AI store manager for a small electronics retailer.",
  "You open with operational judgment, not generic dashboard language.",
  "Use tools whenever a question depends on sales, stock, suppliers, forecasts, reorders, or promos.",
  "Always cite the numbers behind claims using product names, SKUs, units, revenue, stock, velocity, or dates.",
  "Keep answers concise and action-oriented. Prefer the top three actions unless the user asks for more.",
  "If evidence is incomplete, say what you checked and what remains uncertain.",
].join("\n");

const toolExecutors = {
  query_sales: querySales,
  get_inventory: getInventory,
  forecast_stockouts: forecastStockouts,
  compose_supplier_message: storePilotTools.compose_supplier_message.execute,
  draft_promo: storePilotTools.draft_promo.execute,
} satisfies Record<StorePilotToolName, (input: unknown) => Promise<unknown>>;

export async function POST(request: Request) {
  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { error: "Expected messages with role and content." },
      { status: 400 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const recentMessages = parsed.data.messages.slice(-12);

        if (!hasUsableOpenAIKey()) {
          await runLocalGroundedFallback(recentMessages, send);
          send({ type: "done", fallback: true });
          return;
        }

        await runOpenAIChat(recentMessages, send);
      } catch (error) {
        logServerError("chat", error);
        send({
          type: "error",
          message: friendlyErrorMessage(
            error,
            "StorePilot hit an error answering that. Try again in a moment.",
          ),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function runOpenAIChat(
  messages: ChatMessage[],
  send: (event: ChatStreamEvent) => void,
) {
  const client = getOpenAIClient();
  const tools = getOpenAITools();
  let input = toResponseInput(messages);
  let responseId: string | undefined;

  for (let step = 0; step < 4; step += 1) {
    send({ type: "status", message: step === 0 ? "Checking store data" : "Checking follow-up tool calls" });

    const response = await client.responses.create({
      model: storePilotModel as OpenAI.Responses.ResponseCreateParams["model"],
      instructions: systemPrompt,
      input,
      tools,
      tool_choice: "auto",
      parallel_tool_calls: true,
      max_output_tokens: 700,
    });

    responseId = response.id;
    const functionCalls = response.output.filter(
      (item): item is ResponseFunctionToolCall => item.type === "function_call",
    );

    if (functionCalls.length === 0) {
      await emitText(response.output_text || "I could not find enough data to answer.", send);
      send({ type: "done", responseId });
      return;
    }

    const toolOutputs: ResponseInputItem[] = [];

    for (const call of functionCalls) {
      const output = await executeToolCall(call, send);
      toolOutputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(output),
      });
    }

    const replayableOutput = response.output as unknown as ResponseInputItem[];
    input = [...input, ...replayableOutput, ...toolOutputs];
  }

  send({ type: "status", message: "Preparing final answer" });

  const stream = await client.responses.create({
    model: storePilotModel as OpenAI.Responses.ResponseCreateParams["model"],
    instructions: systemPrompt,
    input,
    tools,
    tool_choice: "none",
    stream: true,
    max_output_tokens: 700,
  });

  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      send({ type: "delta", text: event.delta });
    }

    if (event.type === "response.completed") {
      send({ type: "done", responseId: event.response.id });
    }

    if (event.type === "response.failed") {
      send({
        type: "error",
        message: event.response.error?.message ?? "OpenAI response failed.",
      });
    }
  }
}

async function executeToolCall(
  call: ResponseFunctionToolCall,
  send: (event: ChatStreamEvent) => void,
) {
  if (!isStorePilotTool(call.name)) {
    throw new Error(`Unsupported tool: ${call.name}`);
  }

  const args = call.arguments ? JSON.parse(call.arguments) : {};
  send({ type: "status", message: `Running ${call.name}` });
  const result = await toolExecutors[call.name](args);
  send({
    type: "evidence",
    toolName: call.name,
    label: evidenceLabel(call.name),
    chips: evidenceChips(call.name, result),
  });
  return result;
}

async function runLocalGroundedFallback(
  messages: ChatMessage[],
  send: (event: ChatStreamEvent) => void,
) {
  const question = messages[messages.length - 1]?.content.toLowerCase() ?? "";

  send({
    type: "status",
    message: "Using local demo mode because OPENAI_API_KEY is not set",
  });

  if (question.includes("reorder") || question.includes("stock")) {
    const forecast = await forecastStockouts({
      horizon_days: 7,
      lookback_days: 14,
    });
    const stockouts = "stockouts" in forecast ? forecast.stockouts.slice(0, 3) : [];

    send({
      type: "evidence",
      toolName: "forecast_stockouts",
      label: "Stockout forecast",
      chips: evidenceChips("forecast_stockouts", forecast),
    });

    const answer =
      stockouts.length > 0
        ? [
            `Reorder these first this week: ${stockouts
              .map((item) => `${item.name} (${item.sku})`)
              .join(", ")}.`,
            ...stockouts.map(
              (item) =>
                `${item.sku}: ${item.stockQty} in stock, selling ${item.dailyVelocity}/day, about ${item.daysUntilStockout} days of cover, recommended reorder ${item.recommendedReorderQty} units.`,
            ),
            "These are ranked by stockout risk from the seeded demo data.",
          ].join(" ")
        : "I checked the 7-day stockout forecast and do not see an item running out this week.";

    await emitText(answer, send);
    return;
  }

  const inventory = await getInventory({ stock_status: "low", limit: 5 });
  send({
    type: "evidence",
    toolName: "get_inventory",
    label: "Low-stock inventory",
    chips: evidenceChips("get_inventory", inventory),
  });
  await emitText(
    "I checked low-stock inventory first. Ask me what to reorder this week and I will rank the items by stockout risk, daily velocity, and current stock.",
    send,
  );
}

function toResponseInput(messages: ChatMessage[]): ResponseInput {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    type: "message",
  }));
}

function getOpenAITools(): FunctionTool[] {
  return Object.entries(storePilotTools).map(([name, tool]) => ({
    type: "function",
    name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.inputSchema) as Record<string, unknown>,
    strict: false,
  }));
}

function isStorePilotTool(name: string): name is StorePilotToolName {
  return name in storePilotTools;
}

function evidenceLabel(toolName: StorePilotToolName) {
  const labels: Record<StorePilotToolName, string> = {
    query_sales: "Sales query",
    get_inventory: "Inventory",
    forecast_stockouts: "Stockout forecast",
    compose_supplier_message: "Supplier draft",
    draft_promo: "Promo draft",
  };

  return labels[toolName];
}

function evidenceChips(toolName: StorePilotToolName, result: unknown) {
  const data = result as Record<string, unknown>;

  if (toolName === "forecast_stockouts") {
    const stockouts = Array.isArray(data.stockouts) ? data.stockouts.slice(0, 4) : [];
    return stockouts.map((item) => {
      const forecast = item as Record<string, unknown>;
      return `${forecast.sku}: ${forecast.stockQty} stock, ${forecast.dailyVelocity}/day, ${forecast.daysUntilStockout} days`;
    });
  }

  if (toolName === "get_inventory") {
    const items = Array.isArray(data.items) ? data.items.slice(0, 4) : [];
    return items.map((item) => {
      const product = item as Record<string, unknown>;
      return `${product.sku}: ${product.stockQty} stock, reorder ${product.reorderPoint}`;
    });
  }

  if (toolName === "query_sales") {
    const totals = data.totals as Record<string, unknown> | undefined;
    return totals
      ? [
          `${totals.units} units`,
          `SAR ${totals.revenue} revenue`,
          `${totals.orderCount} sales rows`,
        ]
      : [];
  }

  if (toolName === "compose_supplier_message") {
    const messages = Array.isArray(data.messages) ? data.messages : [];
    return [`${messages.length} supplier message${messages.length === 1 ? "" : "s"}`];
  }

  if (toolName === "draft_promo") {
    const products = Array.isArray(data.products) ? data.products : [];
    return [`${products.length} promo product${products.length === 1 ? "" : "s"}`];
  }

  return [];
}

async function emitText(
  text: string,
  send: (event: ChatStreamEvent) => void,
) {
  const chunkSize = 28;

  for (let index = 0; index < text.length; index += chunkSize) {
    send({ type: "delta", text: text.slice(index, index + chunkSize) });
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
}
