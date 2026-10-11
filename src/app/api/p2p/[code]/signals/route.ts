
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { p2pSessions, p2pSignals } from "@/db/schema";
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

async function authorize(code: string) {
  const transfer = await findTransfer(code);
  const visitor = await getVisitor();

  if (!transfer || !visitor) return null;

  const [session] = await db
    .select()
    .from(p2pSessions)
    .where(
      and(
        eq(p2pSessions.transferId, transfer.id),
        eq(p2pSessions.status, "accepted"),
        gt(p2pSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (
    !session ||
    !session.receiverId ||
    (visitor !== session.senderId &&
      visitor !== session.receiverId)
  ) {
    return null;
  }

  return {
    session,
    visitor,
    recipient:
      visitor === session.senderId
        ? session.receiverId
        : session.senderId,
  };
}

export async function GET(
  request: Request,
  { params }: Context
) {
  try {
    if (rateLimited(request, "p2p-signal-read", 90)) {
      return apiError(
        "درخواست‌های زیادی ارسال شده است.",
        429
      );
    }

    const { code } = await params;
    const auth = await authorize(code);

    if (!auth) {
      return apiError(
        "اتصال تأیید نشده یا دسترسی مجاز نیست.",
        403
      );
    }

    const afterText =
      new URL(request.url).searchParams.get("after") || "0";

    if (!/^\d{1,16}$/.test(afterText)) {
      return apiError("شناسه پیام نامعتبر است.");
    }

    const after = Number(afterText);

    if (!Number.isSafeInteger(after)) {
      return apiError("شناسه پیام نامعتبر است.");
    }

    const messages = await db
      .select({
        id: p2pSignals.id,
        type: p2pSignals.signalType,
        payload: p2pSignals.payload,
      })
      .from(p2pSignals)
      .where(
        and(
          eq(p2pSignals.sessionId, auth.session.id),
          eq(p2pSignals.recipientId, auth.visitor),
          gt(p2pSignals.id, after)
        )
      )
      .orderBy(asc(p2pSignals.id))
      .limit(100);

    return Response.json(
      { messages },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("P2P signals GET:", error);

    return apiError(
      "خواندن پیام‌های اتصال ممکن نشد.",
      500
    );
  }
}

export async function POST(
  request: Request,
  { params }: Context
) {
  try {
    if (rateLimited(request, "p2p-signal-write", 120)) {
      return apiError(
        "درخواست‌های زیادی ارسال شده است.",
        429
      );
    }

    const { code } = await params;
    const auth = await authorize(code);

    if (!auth) {
      return apiError(
        "اتصال تأیید نشده یا دسترسی مجاز نیست.",
        403
      );
    }

    const raw = await request.text();

    if (raw.length > 16000) {
      return apiError(
        "پیام اتصال بیش از حد بزرگ است.",
        413
      );
    }

    let body: {
      type?: unknown;
      payload?: unknown;
    };

    try {
      body = JSON.parse(raw);
    } catch {
      return apiError("JSON نامعتبر است.");
    }

    if (
      !body ||
      typeof body !== "object" ||
      !["offer", "answer", "candidate"].includes(
        String(body.type)
      )
    ) {
      return apiError("نوع پیام نامعتبر است.");
    }

    if (
      !body.payload ||
      typeof body.payload !== "object" ||
      Array.isArray(body.payload)
    ) {
      return apiError("محتوای پیام نامعتبر است.");
    }

    const type = body.type as
      | "offer"
      | "answer"
      | "candidate";

    if (
      type === "offer" &&
      auth.visitor !== auth.session.senderId
    ) {
      return apiError(
        "فقط فرستنده می‌تواند پیشنهاد اتصال بدهد.",
        403
      );
    }

    if (
      type === "answer" &&
      auth.visitor !== auth.session.receiverId
    ) {
      return apiError(
        "فقط گیرنده می‌تواند پاسخ بدهد.",
        403
      );
    }

    const [saved] = await db
      .insert(p2pSignals)
      .values({
        sessionId: auth.session.id,
        senderId: auth.visitor,
        recipientId: auth.recipient,
        signalType: type,
        payload: body.payload,
      })
      .returning({
        id: p2pSignals.id,
      });

    return Response.json(
      {
        ok: true,
        id: saved.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("P2P signals POST:", error);

    return apiError(
      "ثبت پیام اتصال ممکن نشد.",
      500
    );
  }
}
