import { createHash, timingSafeEqual } from "node:crypto";
import { purgeExpiredTransfers } from "@/lib/transfer-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response(null, { status: 404 });

  const authorization = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))) {
    return new Response(null, { status: 401 });
  }

  try {
    const result = await purgeExpiredTransfers();
    return Response.json(result, { status: result.failed ? 503 : 200 });
  } catch (error) {
    console.error("Transfer cleanup failed:", error);
    return Response.json({ error: "Transfer cleanup failed" }, { status: 503 });
  }
}
