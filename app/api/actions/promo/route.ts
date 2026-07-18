import { NextResponse } from "next/server";
import { z } from "zod";
import { draftPromo } from "@/lib/tools";
import { generateMorningBrief } from "@/lib/brief/generate";
import { withDbRetry } from "@/lib/db-retry";
import { friendlyErrorMessage, logServerError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  product_ids: z.array(z.string().min(1)).min(1).max(10).optional(),
  discount_percent: z.number().int().min(5).max(40).optional(),
  channel: z.enum(["whatsapp", "sms", "in_store"]).optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected optional product_ids, discount_percent, channel." },
      { status: 400 },
    );
  }

  try {
    let productIds = parsed.data.product_ids;

    if (!productIds || productIds.length === 0) {
      const brief = await generateMorningBrief({});
      productIds = brief.items.find((item) => item.action?.kind === "promo")
        ?.action?.productIds;
    }

    if (!productIds || productIds.length === 0) {
      return NextResponse.json(
        { error: "No slow movers with promo-ready stock right now." },
        { status: 404 },
      );
    }

    const ids = productIds;
    const result = await withDbRetry(() =>
      draftPromo({
        product_ids: ids,
        discount_percent: parsed.data.discount_percent ?? 15,
        channel: parsed.data.channel ?? "whatsapp",
      }),
    );

    return NextResponse.json(result);
  } catch (error) {
    logServerError("actions:promo", error);

    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Could not draft the promo.") },
      { status: 500 },
    );
  }
}
