import { sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { isValidIranMobile, normalizePhone } from "@/lib/shared";
import { apiError, rateLimited } from "@/lib/transfer-server";

export async function POST(request: Request) {
  try {
    // Generous enough for whole families behind one carrier NAT, tight enough to stop scripts.
    if (rateLimited(request, "leads", 30))
      return apiError("لطفاً کمی صبر کنید و دوباره تلاش کنید.", 429);

    const body = await request.json().catch(() => ({}));
    const phone = normalizePhone(
      typeof body.phone === "string" ? body.phone : ""
    );

    if (!isValidIranMobile(phone))
      return apiError(
        "شمارهٔ موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹",
        422
      );

    const source =
      typeof body.source === "string"
        ? body.source.trim().slice(0, 40) || "contact-popup"
        : "contact-popup";

    // Upsert: a returning visitor bumps their visit count instead of creating a duplicate row.
    const [lead] = await db
      .insert(leads)
      .values({ phone, source })
      .onConflictDoUpdate({
        target: leads.phone,
        set: {
          visits: sql`${leads.visits} + 1`,
          lastSeenAt: new Date(),
        },
      })
      .returning({
        id: leads.id,
        phone: leads.phone,
        visits: leads.visits,
      });

    return Response.json(
      { ok: true, phone: lead.phone, visits: lead.visits },
      { status: lead.visits === 1 ? 201 : 200 }
    );
  } catch (error) {
    console.error("Lead capture:", error);
    return apiError("ثبت شماره ممکن نشد. دوباره تلاش کنید.", 500);
  }
}
