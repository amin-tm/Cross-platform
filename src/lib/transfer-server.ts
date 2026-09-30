import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { transferFiles, transfers } from "@/db/schema";
import { deleteStoredFiles, isStorageConfigured, supabaseAdmin, STORAGE_BUCKET } from "@/lib/storage";

const COOKIE = "pol_device";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getVisitor(create = false) {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (value && UUID_PATTERN.test(value)) return value;
  if (!create) return null;
  const id = randomUUID();
  jar.set(COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

export async function findTransfer(code: string) {
  if (!/^\d{6}$/.test(code)) return null;
  const [transfer] = await db.select().from(transfers).where(eq(transfers.code, code)).limit(1);
  if (!transfer || transfer.expiresAt.getTime() <= Date.now()) return null;
  return transfer;
}

export async function serializeTransfer(transfer: typeof transfers.$inferSelect, visitor: string | null) {
  const files = await db
    .select({ id: transferFiles.id, name: transferFiles.name, size: transferFiles.size, mime: transferFiles.mime })
    .from(transferFiles)
    .where(eq(transferFiles.transferId, transfer.id));
  return {
    ...transfer,
    ownerId: undefined,
    contributorId: undefined,
    isOwner: transfer.ownerId === visitor,
    files,
  };
}

const rateBuckets = new Map<string, { count: number; reset: number }>();
export function rateLimited(request: Request, action: string, limit = 60) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${ip}:${action}`;
  const now = Date.now();
  if (rateBuckets.size > 2000) {
    for (const [k, value] of rateBuckets) if (value.reset < now) rateBuckets.delete(k);
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.reset < now) {
    rateBuckets.set(key, { count: 1, reset: now + 60000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

let lastCleanup = 0;
export async function cleanupExpired() {
  if (Date.now() - lastCleanup < 10 * 60 * 1000) return;
  lastCleanup = Date.now();
  try {
    const expired = await db.select().from(transfers).where(lt(transfers.expiresAt, new Date()));
    if (!expired.length) return;
    const expiredIds = expired.map((item) => item.id);
    const files = await db
      .select({ id: transferFiles.id, transferId: transferFiles.transferId })
      .from(transferFiles)
      .where(inArray(transferFiles.transferId, expiredIds));
    if (isStorageConfigured()) {
      const grouped = new Map<string, string[]>();
      for (const file of files) {
        const list = grouped.get(file.transferId) || [];
        list.push(file.id);
        grouped.set(file.transferId, list);
      }
      for (const [transferId, ids] of grouped) {
        await deleteStoredFiles(transferId, ids).catch(() => undefined);
      }
    }
    await db.delete(transfers).where(and(inArray(transfers.id, expiredIds), lt(transfers.expiresAt, new Date())));
  } catch (error) {
    console.error("cleanupExpired:", error);
  }
}

export async function ensureBucket() {
  if (!isStorageConfigured()) return;
  const admin = supabaseAdmin();
  const { data } = await admin.storage.getBucket(STORAGE_BUCKET);
  if (data) return;
  await admin.storage.createBucket(STORAGE_BUCKET, { public: false, fileSizeLimit: null });
}

export function apiError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
