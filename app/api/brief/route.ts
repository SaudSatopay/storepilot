import { NextResponse } from "next/server";
import { generateMorningBrief } from "@/lib/brief/generate";
import { friendlyErrorMessage, logServerError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fresh = url.searchParams.get("fresh") === "1";
    const brief = await generateMorningBrief({ fresh });

    return NextResponse.json({ brief });
  } catch (error) {
    logServerError("brief", error);

    return NextResponse.json(
      { error: friendlyErrorMessage(error, "Could not generate the brief.") },
      { status: 500 },
    );
  }
}
