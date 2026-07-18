import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storeProfiles = await prisma.storeProfile.count();
    const suppliers = await prisma.supplier.count();
    const products = await prisma.product.count();
    const sales = await prisma.sale.count();
    const stockLevels = await prisma.stockLevel.count();

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
