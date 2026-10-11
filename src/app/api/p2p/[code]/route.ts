import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { p2pSessions } from "@/db/schema";
import {
  apiError,
  findTransfer,
  getVisitor,
  rateLimited,
} from "@/lib/transfer-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ code: string }>;
};

const validStatuses = ["waiting", "requested", "accepted"];

export async function GET(request: Request, { params }: Context) {
  try {
    if (rateLimited(request, "p2p-status", 60)) {
      return apiError("درخواست‌های زیادی ارسال شده است.", 429);
    }

    const { code } = await params;
    const transfer = await findTransfer(code);
    if (!transfer) return apiError("کد معتبر نیست.", 404);

    const visitor = await getVisitor();
    if (!visitor) return apiError("دستگاه شناسایی نشد.", 403);

    const [session] = await db
      .select()
      .from(p2pSessions)
      .where(and(
        eq(p2pSessions.transferId, transfer.id),
        gt(p2pSessions.expiresAt, new Date())
      ))
      .limit(1);

    if (!session) return Response.json({ status: "none" });

    if (
      visitor !== session.senderId &&
      visitor !== session.receiverId
    ) {
      return apiError("اجازه مشاهده اتصال را ندارید.", 403);
    }

    return Response.json({
      status: session.status,
      role: visitor === session.senderId ? "sender" : "receiver",
    });
  } catch (error) {
    console.error("P2P status:", error);
    return apiError("بررسی اتصال ممکن نشد.", 500);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    if (rateLimited(request, "p2p-action", 30)) {
      return apiError("لطفاً کمی صبر کنید.", 429);
    }

    const { code } = await params;
    const transfer = await findTransfer(code);

    if (!transfer || transfer.status !== "pending") {
      return apiError("انتقال فعال پیدا نشد.", 404);
    }

    const visitor = await getVisitor(true);
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (!["start", "request", "accept"].includes(action)) {
      return apiError("عملیات نامعتبر است.");
    }

    if (action === "start") {
      if (visitor !== transfer.ownerId || transfer.kind !== "send") {
        return apiError("فقط فرستنده مجاز است.", 403);
      }

      const [existing] = await db
        .select()
        .from(p2pSessions)
        .where(eq(p2pSessions.transferId, transfer.id))
        .limit(1);

      if (existing) {
        if (existing.status !== "closed" &&
            existing.expiresAt > new Date()) {
          return Response.json({ status: existing.status });
        }

        await db.delete(p2pSessions)
          .where(eq(p2pSessions.id, existing.id));
      }

      await db.insert(p2pSessions).values({
        transferId: transfer.id,
        senderId: visitor!,
        status: "waiting",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      return Response.json({ status: "waiting" });
    }

    if (action === "request") {
      if (visitor === transfer.ownerId) {
        return apiError("فرستنده نمی‌تواند گیرنده خودش باشد.", 403);
      }

      const [updated] = await db
        .update(p2pSessions)
        .set({
          receiverId: visitor,
          status: "requested",
        })
        .where(and(
          eq(p2pSessions.transferId, transfer.id),
          eq(p2pSessions.status, "waiting"),
          isNull(p2pSessions.receiverId),
          gt(p2pSessions.expiresAt, new Date())
        ))
        .returning();

      if (!updated) {
        return apiError("اتصال آماده نیست یا گیرنده دیگری متصل شده است.", 409);
      }

      return Response.json({ status: "requested" });
    }

    if (action === "accept") {
      if (visitor !== transfer.ownerId) {
        return apiError("فقط فرستنده می‌تواند تأیید کند.", 403);
      }

      const [updated] = await db
        .update(p2pSessions)
        .set({ status: "accepted" })
        .where(and(
          eq(p2pSessions.transferId, transfer.id),
          eq(p2pSessions.senderId, visitor!),
          eq(p2pSessions.status, "requested"),
          gt(p2pSessions.expiresAt, new Date())
        ))
        .returning();

      if (!updated) {
        return apiError("درخواست معتبری برای تأیید وجود ندارد.", 409);
      }

      return Response.json({ status: "accepted" });
    }

    return apiError("عملیات نامعتبر است.");
  } catch (error) {
    console.error("P2P action:", error);
    return apiError("برقراری ارتباط ممکن نشد.", 500);
  }
}
