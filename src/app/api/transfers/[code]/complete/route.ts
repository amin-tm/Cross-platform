import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { transfers } from "@/db/schema";
import { apiError, findTransfer, getVisitor, serializeTransfer } from "@/lib/transfer-server";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const transfer = await findTransfer(code);
    if (!transfer) return apiError("انتقال پیدا نشد.", 404);
    const visitor = await getVisitor();
    const permitted = transfer.kind === "inbox" ? transfer.contributorId === visitor : transfer.ownerId === visitor;
    if (!visitor || !permitted) return apiError("اجازهٔ تکمیل این انتقال را ندارید.", 403);
    if (transfer.fileCount === 0) return apiError("ابتدا یک فایل انتخاب کنید.");
    if (transfer.status === "ready") return Response.json(await serializeTransfer(transfer, visitor));
    const now = new Date();
    const [updated] = await db.update(transfers)
      .set({ status: "ready", completedAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) })
      .where(and(eq(transfers.id, transfer.id), eq(transfers.status, "pending"), gt(transfers.expiresAt, now)))
      .returning();
    const result = updated ?? await findTransfer(code);
    if (!result || result.id !== transfer.id || result.status !== "ready") {
      return apiError("این انتقال دیگر قابل تکمیل نیست.", 409);
    }
    return Response.json(await serializeTransfer(result, visitor));
  } catch (error) {
    console.error("Complete transfer:", error);
    return apiError("تکمیل انتقال ممکن نشد. دوباره تلاش کنید.", 500);
  }
}
