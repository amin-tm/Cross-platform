import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { p2pSessions, p2pSignals } from "@/db/schema";
import { apiError, findLiveSession, getVisitor, rateLimited } from "@/lib/p2p-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

async function authorize(code: string) {
  const session = await findLiveSession(code);
  const visitor = await getVisitor();
  if (!session || !visitor) return null;
  if (visitor !== session.senderId && visitor !== session.receiverId) return null;
  return {
    session,
    visitor,
    recipient: visitor === session.senderId ? session.receiverId : session.senderId,
  };
}

/**
 * SSE stream: pushes `status` events (waiting/requested/accepted/closed) and
 * `signal` events (offer/answer/candidate) addressed to the caller.
 * Replaces 2-second client polling -> sub-second handshake.
 */
export async function GET(request: Request, { params }: Context) {
  if (rateLimited(request, "p2p-stream", 60)) return apiError("درخواست‌های زیادی ارسال شده است.", 429);
  const { code } = await params;
  const auth = await authorize(code);
  if (!auth) return apiError("دسترسی مجاز نیست.", 403);

  const afterText = new URL(request.url).searchParams.get("after") || "0";
  let cursor = /^\d{1,16}$/.test(afterText) ? Number(afterText) : 0;
  const encoder = new TextEncoder();
  const sessionId = auth.session.id;
  const visitor = auth.visitor;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastStatus = "";
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const [session] = await db.select().from(p2pSessions).where(eq(p2pSessions.id, sessionId)).limit(1);
          if (!session || session.expiresAt < new Date()) { send("status", { status: "expired" }); stop(); return; }
          const statusKey = `${session.status}:${session.receiverId ?? ""}`;
          if (statusKey !== lastStatus) {
            lastStatus = statusKey;
            send("status", { status: session.status, role: visitor === session.senderId ? "sender" : "receiver" });
          }
          const messages = await db
            .select({ id: p2pSignals.id, type: p2pSignals.signalType, payload: p2pSignals.payload })
            .from(p2pSignals)
            .where(and(eq(p2pSignals.sessionId, sessionId), eq(p2pSignals.recipientId, visitor), gt(p2pSignals.id, cursor)))
            .orderBy(asc(p2pSignals.id))
            .limit(200);
          for (const m of messages) {
            cursor = Math.max(cursor, m.id);
            send("signal", m);
          }
          if (session.status === "closed") stop();
        } catch (error) {
          console.error("P2P stream tick:", error);
        }
      };

      const timer = setInterval(() => void tick(), 250);
      const heartbeat = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`)); }, 15000);
      request.signal.addEventListener("abort", stop, { once: true });
      void tick();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request, { params }: Context) {
  try {
    if (rateLimited(request, "p2p-signal-write", 600)) return apiError("درخواست‌های زیادی ارسال شده است.", 429);
    const { code } = await params;
    const auth = await authorize(code);
    if (!auth || !auth.recipient || auth.session.status !== "accepted") {
      return apiError("اتصال تأیید نشده یا دسترسی مجاز نیست.", 403);
    }
    const raw = await request.text();
    if (raw.length > 32000) return apiError("پیام اتصال بیش از حد بزرگ است.", 413);
    let body: { type?: unknown; payload?: unknown };
    try { body = JSON.parse(raw); } catch { return apiError("JSON نامعتبر است."); }
    const type = String(body?.type);
    if (!["offer", "answer", "candidate"].includes(type)) return apiError("نوع پیام نامعتبر است.");
    if (!body.payload || typeof body.payload !== "object") return apiError("محتوای پیام نامعتبر است.");
    if (type === "offer" && auth.visitor !== auth.session.senderId) return apiError("فقط فرستنده می‌تواند پیشنهاد اتصال بدهد.", 403);
    if (type === "answer" && auth.visitor !== auth.session.receiverId) return apiError("فقط گیرنده می‌تواند پاسخ بدهد.", 403);

    const [saved] = await db
      .insert(p2pSignals)
      .values({ sessionId: auth.session.id, senderId: auth.visitor, recipientId: auth.recipient, signalType: type, payload: body.payload })
      .returning({ id: p2pSignals.id });
    return Response.json({ ok: true, id: saved.id }, { status: 201 });
  } catch (error) {
    console.error("P2P signals POST:", error);
    return apiError("ثبت پیام اتصال ممکن نشد.", 500);
  }
}
