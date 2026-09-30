import { db } from "@/db";
import { feedback } from "@/db/schema";
import { apiError, rateLimited } from "@/lib/transfer-server";

export async function POST(request: Request) {
  try {
    if (rateLimited(request, "feedback", 5)) return apiError("لطفاً کمی صبر کنید.", 429);
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length < 5 || message.length > 2000) return apiError("بازخورد باید بین ۵ تا ۲۰۰۰ کاراکتر باشد.");
    await db.insert(feedback).values({ message });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Feedback:", error);
    return apiError("ارسال بازخورد ممکن نشد.", 500);
  }
}
