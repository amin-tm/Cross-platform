
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { p2pSessions, transfers } from "@/db/schema";
import { apiError, getVisitor, rateLimited } from "@/lib/p2p-server";
import { generateCode } from "@/lib/p2p-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (rateLimited(request, "p2p-create", 30)) {
      return apiError("درخواست‌های زیادی ارسال شده است.", 429);
    }

    const visitor = await getVisitor(true);
    if (!visitor) {
      return apiError("شناسایی دستگاه ممکن نشد.", 500);
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = await generateCode();
      const transferId = randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      const [created] = await db.transaction(async (tx) => {
        await tx.insert(transfers).values({
          id: transferId,
          code,
          ownerId: visitor,
          kind: "send",
          status: "pending",
          expiresAt,
        });

        return tx.insert(p2pSessions).values({
          transferId,
          code,
          senderId: visitor,
          status: "waiting",
          expiresAt,
        }).returning();
      });

      if (created) {
        return Response.json(
          { code, status: "waiting" },
          { status: 201 }
        );
      }
    }

    return apiError("ساخت کد اتصال ممکن نشد.", 503);
  } catch (error) {
    console.error("P2P create:", error);
    return apiError("ساخت اتاق اتصال ممکن نشد.", 500);
  }
}
