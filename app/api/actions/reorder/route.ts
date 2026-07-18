import { NextResponse } from "next/server";
import { z } from "zod";
import { composeSupplierMessage } from "@/lib/tools";
import { generateMorningBrief } from "@/lib/brief/generate";
import { friendlyErrorMessage, logServerError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  product_ids: z.array(z.string().min(1)).min(1).max(20).optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected an optional product_ids array." },
      { status: 400 },
    );
  }

  try {
    let productIds = parsed.data.product_ids;

    if (!productIds || productIds.length === 0) {
      const brief = await generateMorningBrief({});
      productIds = brief.items.find((item) => item.action?.kind === "reorder")
        ?.action?.productIds;
    }

    if (!productIds || productIds.length === 0) {
      return NextResponse.json(
        { error: "Nothing is close to stocking out right now." },
        { status: 404 },
      );
    }

    const result = await composeSupplierMessage({ product_ids: productIds });

    return NextResponse.json(result);
  } catch (error) {
    logServerError("actions:reorder", error);

    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Could not draft the reorder.") },
      { status: 500 },
    );
  }
}
