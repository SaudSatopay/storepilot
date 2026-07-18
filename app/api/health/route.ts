import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [storeProfiles, suppliers, products, sales, stockLevels, salesRange] =
      await Promise.all([
        prisma.storeProfile.count(),
        prisma.supplier.count(),
        prisma.product.count(),
        prisma.sale.count(),
        prisma.stockLevel.count(),
        prisma.sale.aggregate({
          _min: { soldAt: true },
          _max: { soldAt: true },
        }),
      ]);

    return NextResponse.json({
      status: "ok",
      generatedAt: new Date().toISOString(),
      counts: {
        storeProfiles,
        suppliers,
        products,
        sales,
        stockLevels,
      },
      salesDays: getInclusiveDaySpan(
        salesRange._min.soldAt,
        salesRange._max.soldAt,
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";

    return NextResponse.json(
      {
        status: "error",
        generatedAt: new Date().toISOString(),
        message,
      },
      { status: 500 },
    );
  }
}

function getInclusiveDaySpan(start: Date | null, end: Date | null) {
  if (!start || !end) {
    return 0;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const startUtc = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  return Math.floor((endUtc - startUtc) / dayMs) + 1;
}
