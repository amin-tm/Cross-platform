import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { p2pSessions } from "@/db/schema";
import { apiError, findLiveSession, getVisitor, rateLimited } from "@/lib/p2p-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    if (rateLimited(request, "p2p-status", 240)) return apiError("درخواست‌های زیادی ارسال شده است.", 429);
    const { code } = await params;
    const session = await findLiveSession(code);
    if (!session) return apiError("کد معتبر نیست یا منقضی شده است.", 404);
    const visitor = await getVisitor();
    if (!visitor || (visitor !== session.senderId && visitor !== session.receiverId)) {
      return apiError("اجازه مشاهده اتصال را ندارید.", 403);
    }
    return Response.json(
      { status: session.status, role: visitor === session.senderId ? "sender" : "receiver" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("P2P status:", error);
    return apiError("بررسی اتصال ممکن نشد.", 500);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    if (rateLimited(request, "p2p-action", 60)) return apiError("لطفاً کمی صبر کنید.", 429);
    const { code } = await params;
    const session = await findLiveSession(code);
    if (!session) return apiError("اتاق فعالی با این کد پیدا نشد.", 404);
    const visitor = (await getVisitor(true))!;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action);

    if (action === "request") {
      if (visitor === session.senderId) return apiError("فرستنده نمی‌تواند گیرنده خودش باشد.", 403);
      const [updated] = await db
        .update(p2pSessions)
        .set({ receiverId: visitor, status: "requested" })
        .where(and(eq(p2pSessions.id, session.id), eq(p2pSessions.status, "waiting"), isNull(p2pSessions.receiverId), gt(p2pSessions.expiresAt, new Date())))
        .returning();
      if (!updated) {
        // Same receiver re-requesting is fine (page reload).
        if (session.receiverId === visitor) return Response.json({ status: session.status });
        return apiError("اتصال آماده نیست یا گیرنده دیگری متصل شده است.", 409);
      }
      return Response.json({ status: "requested" });
    }

    if (action === "accept") {
      if (visitor !== session.senderId) return apiError("فقط فرستنده می‌تواند تأیید کند.", 403);
      const [updated] = await db
        .update(p2pSessions)
        .set({ status: "accepted" })
        .where(and(eq(p2pSessions.id, session.id), eq(p2pSessions.status, "requested")))
        .returning();
      if (!updated) return apiError("درخواست معتبری برای تأیید وجود ندارد.", 409);
      return Response.json({ status: "accepted" });
    }

    if (action === "close") {
      if (visitor !== session.senderId && visitor !== session.receiverId) return apiError("مجاز نیست.", 403);
      await db.update(p2pSessions).set({ status: "closed" }).where(eq(p2pSessions.id, session.id));
      return Response.json({ status: "closed" });
    }

    return apiError("عملیات نامعتبر است.");
  } catch (error) {
    console.error("P2P action:", error);
    return apiError("برقراری ارتباط ممکن نشد.", 500);
  }
}
