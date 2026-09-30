import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql as sqlOp } from "drizzle-orm";
import { db } from "@/db";
import { transferFiles, transfers } from "@/db/schema";
import { MAX_FILE_COUNT, MAX_TRANSFER_SIZE } from "@/lib/shared";
import { apiError, ensureBucket, findTransfer, getVisitor, rateLimited } from "@/lib/transfer-server";
import { createUploadTicket, isStorageConfigured } from "@/lib/storage";

export const runtime = "nodejs";

type Context = { params: Promise<{ code: string }> };

type UploadRequestBody = {
  name?: unknown;
  size?: unknown;
  mime?: unknown;
};

const NAME_UNSAFE = /[\/\\\u0000-\u001f\u007f]/g;

async function beginUpload(request: Request, code: string) {
  if (rateLimited(request, "upload-begin", 120)) return apiError("لطفاً کمی صبر کنید.", 429);

  let payload: UploadRequestBody;
  try { payload = (await request.json()) as UploadRequestBody; }
  catch { return apiError("درخواست معتبر نیست."); }
  const size = Number(payload.size);
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_TRANSFER_SIZE) return apiError("حجم فایل نامعتبر است.", 413);
  const rawName = typeof payload.name === "string" ? payload.name : "file";
  const name = rawName.replace(NAME_UNSAFE, "_").trim().slice(0, 255) || "file";
  const mime = (typeof payload.mime === "string" ? payload.mime : "application/octet-stream").slice(0, 200);

  let transfer = await findTransfer(code);
  if (!transfer || transfer.status !== "pending") return apiError("این انتقال آمادهٔ دریافت فایل نیست.", 409);
  const visitor = await getVisitor(true);
  if (transfer.kind === "send" && transfer.ownerId !== visitor) {
    return apiError("این لینک برای دریافت فایل است، نه ارسال. برای فرستادن فایل از گوشی به مقصد، صفحهٔ اصلی پُل را روی مقصد باز کنید و QR بخش «از گوشی به این دستگاه» را با گوشی اسکن کنید.", 409);
  }
  if (transfer.kind === "inbox" && !transfer.contributorId) {
    await db.update(transfers).set({ contributorId: visitor }).where(and(eq(transfers.id, transfer.id), isNull(transfers.contributorId)));
    transfer = (await findTransfer(code))!;
  }
  if (transfer.kind === "inbox" && transfer.contributorId !== visitor) {
    return apiError("این کد قبلاً به دستگاه دیگری متصل شده است. در مقصد «دریافت جدید» را بزنید تا کد تازه بسازید.", 409);
  }
  if (size + transfer.totalSize > MAX_TRANSFER_SIZE) return apiError("حجم کل فایل‌ها باید کمتر از ۲ گیگابایت باشد.", 413);
  if (transfer.fileCount >= MAX_FILE_COUNT) return apiError("در هر انتقال حداکثر ۱۰۰ فایل قابل ارسال است.");
  if (!isStorageConfigured()) return apiError("فضای ذخیره‌سازی Supabase پیکربندی نشده است. راهنمای استقرار را دنبال کنید.", 500);

  await ensureBucket();
  const id = randomUUID();
  const ticket = await createUploadTicket(transfer.id, id);
  await db.insert(transferFiles).values({ id, transferId: transfer.id, name, size, mime, storageName: id, status: "uploading" });
  return Response.json({ id, name, size, mime, upload: ticket }, { status: 201 });
}

async function finishUpload(request: Request, code: string) {
  if (rateLimited(request, "upload-finish", 240)) return apiError("لطفاً کمی صبر کنید.", 429);
  let payload: { fileId?: unknown };
  try { payload = await request.json(); }
  catch { return apiError("درخواست معتبر نیست."); }
  const fileId = typeof payload.fileId === "string" ? payload.fileId : "";
  if (!fileId) return apiError("شناسهٔ فایل مشخص نیست.");
  const transfer = await findTransfer(code);
  if (!transfer || transfer.status !== "pending") return apiError("این انتقال آمادهٔ ثبت فایل نیست.", 409);
  const visitor = await getVisitor();
  const permitted = transfer.kind === "inbox" ? transfer.contributorId === visitor : transfer.ownerId === visitor;
  if (!visitor || !permitted) return apiError("اجازهٔ ثبت این فایل را ندارید.", 403);

  const [file] = await db
    .select()
    .from(transferFiles)
    .where(and(eq(transferFiles.id, fileId), eq(transferFiles.transferId, transfer.id)))
    .limit(1);
  if (!file || file.status !== "uploading") return apiError("این فایل قابل ثبت نیست.", 409);

  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(transfers).where(eq(transfers.id, transfer.id)).for("update");
      if (!locked || locked.status !== "pending" || locked.fileCount >= MAX_FILE_COUNT || locked.totalSize + file.size > MAX_TRANSFER_SIZE) {
        throw new Error("TRANSFER_LIMIT");
      }
      await tx.update(transferFiles).set({ status: "ready" }).where(eq(transferFiles.id, fileId));
      await tx
        .update(transfers)
        .set({
          totalSize: sqlOp`${transfers.totalSize} + ${file.size}`,
          fileCount: sqlOp`${transfers.fileCount} + 1`,
        })
        .where(eq(transfers.id, transfer.id));
    });
  } catch (error) {
    console.error("finishUpload:", error);
    return apiError("ثبت فایل ممکن نشد. فایل را دوباره ارسال کنید.", 409);
  }
  return Response.json({ ok: true });
}

export async function POST(request: Request, { params }: Context) {
  const { code } = await params;
  const action = new URL(request.url).searchParams.get("action");
  if (action === "finish") return finishUpload(request, code);
  return beginUpload(request, code);
}
