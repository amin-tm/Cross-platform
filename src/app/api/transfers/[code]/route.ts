import { eq } from "drizzle-orm";
import { db } from "@/db";
import { transferFiles, transfers } from "@/db/schema";
import { apiError, findTransfer, getVisitor, rateLimited, serializeTransfer } from "@/lib/transfer-server";
import { deleteStoredFiles, isStorageConfigured } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    if (rateLimited(request, "lookup", 180)) return apiError("درخواست‌های زیادی ارسال شده. کمی صبر کنید.", 429);
    const { code } = await params;
    const transfer = await findTransfer(code);
    if (!transfer) return apiError("این کد پیدا نشد یا زمان دریافت آن به پایان رسیده است.", 404);
    return Response.json(await serializeTransfer(transfer, await getVisitor()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Find transfer:", error);
    return apiError("دریافت اطلاعات انتقال ممکن نشد.", 500);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { code } = await params;
    const transfer = await findTransfer(code);
    if (!transfer) return apiError("انتقال پیدا نشد.", 404);
    const visitor = await getVisitor();
    if (visitor !== transfer.ownerId) return apiError("فقط فرستنده می‌تواند این انتقال را حذف کند.", 403);
    const files = await db.select({ id: transferFiles.id }).from(transferFiles).where(eq(transferFiles.transferId, transfer.id));
    if (isStorageConfigured()) {
      await deleteStoredFiles(transfer.id, files.map((file) => file.id)).catch(() => undefined);
    }
    await db.delete(transfers).where(eq(transfers.id, transfer.id));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Delete transfer:", error);
    return apiError("حذف انتقال ممکن نشد.", 500);
  }
}
