
import { randomInt } from "node:crypto";
import { and, desc, eq, gt, or } from "drizzle-orm";
import { db } from "@/db";
import { transfers } from "@/db/schema";
import {
  apiError,
  cleanupExpired,
  getVisitor,
  rateLimited,
  serializeTransfer,
} from "@/lib/transfer-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const visitor = await getVisitor(true);
    await cleanupExpired();

    const items = await db
      .select()
      .from(transfers)
      .where(
        and(
          or(
            eq(transfers.ownerId, visitor!),
            eq(transfers.contributorId, visitor!)
          ),
          eq(transfers.status, "ready"),
          gt(transfers.expiresAt, new Date())
        )
      )
      .orderBy(desc(transfers.createdAt))
      .limit(50);

    return Response.json({
      transfers: await Promise.all(
        items.map((item) => serializeTransfer(item, visitor))
      ),
    });
  } catch (error) {
    console.error("Transfer history:", error);
    return apiError(
      "دریافت انتقال‌ها ممکن نشد. دوباره تلاش کنید.",
      500
    );
  }
}

export async function POST(request: Request) {
  try {
    if (rateLimited(request, "create", 30)) {
      return apiError(
        "لطفاً یک دقیقه صبر کنید و دوباره تلاش کنید.",
        429
      );
    }

    const body = await request.json().catch(() => ({}));

    const kind = body.kind === "inbox" ? "inbox" : "send";

    const textContent =
      typeof body.textContent === "string"
        ? body.textContent.trim()
        : null;

    if (
      textContent !== null &&
      (textContent.length === 0 || textContent.length > 20000)
    ) {
      return apiError(
        "متن باید بین ۱ تا ۲۰۰۰۰ کاراکتر باشد.",
        422
      );
    }

    if (textContent !== null && kind !== "send") {
      return apiError("نوع انتقال متن نامعتبر است.", 400);
    }

    const visitor = await getVisitor(true);
    await cleanupExpired();

    if (kind === "inbox" && !body.fresh) {
      const [existing] = await db
        .select()
        .from(transfers)
        .where(
          and(
            eq(transfers.ownerId, visitor!),
            eq(transfers.kind, "inbox"),
            eq(transfers.status, "pending"),
            gt(transfers.expiresAt, new Date())
          )
        )
        .orderBy(desc(transfers.createdAt))
        .limit(1);

      if (existing) {
        return Response.json(
          await serializeTransfer(existing, visitor)
        );
      }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const [created] = await db
        .insert(transfers)
        .values({
          code: String(randomInt(100000, 1000000)),
          ownerId: visitor!,
          kind,
          textContent,
          status: textContent !== null ? "ready" : "pending",
          completedAt:
            textContent !== null ? new Date() : null,
          expiresAt: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ),
        })
        .onConflictDoNothing()
        .returning();

      if (created) {
        return Response.json(
          await serializeTransfer(created, visitor),
          { status: 201 }
        );
      }
    }

    return apiError(
      "ساخت کد اتصال ممکن نشد. دوباره تلاش کنید.",
      503
    );
  } catch (error) {
    console.error("Create transfer:", error);
    return apiError(
      "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
      500
    );
  }
}
