import { and, eq, sql as sqlOp } from "drizzle-orm";
import { db } from "@/db";
import { transferFiles, transfers } from "@/db/schema";
import { apiError, findTransfer, rateLimited } from "@/lib/transfer-server";
import { createDownloadUrl, isStorageConfigured } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    if (rateLimited(request, "download", 240)) return apiError("لطفاً کمی صبر کنید.", 429);
    const { code } = await params;
    const transfer = await findTransfer(code);
    if (!transfer || transfer.status !== "ready") return apiError("فایل در دسترس نیست یا زمان دریافت به پایان رسیده است.", 404);
    const requestedId = new URL(request.url).searchParams.get("file");
    if (!requestedId) return apiError("برای دانلود، شناسهٔ فایل لازم است. از دکمهٔ کنار هر فایل استفاده کنید.");
    const [file] = await db
      .select()
      .from(transferFiles)
      .where(and(eq(transferFiles.id, requestedId), eq(transferFiles.transferId, transfer.id), eq(transferFiles.status, "ready")))
      .limit(1);
    if (!file) return apiError("فایل پیدا نشد.", 404);
    if (!isStorageConfigured()) return apiError("فضای ذخیره‌سازی Supabase پیکربندی نشده است.", 500);
    const signed = await createDownloadUrl(transfer.id, file.storageName, file.name, 120);
    await db.update(transfers).set({ downloads: sqlOp`${transfers.downloads} + 1` }).where(eq(transfers.id, transfer.id));
    return Response.redirect(signed, 302);
  } catch (error) {
    console.error("Download:", error);
    return apiError("دریافت فایل ممکن نشد. دوباره تلاش کنید.", 500);
  }
}
