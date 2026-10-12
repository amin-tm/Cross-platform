import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { p2pSessions } from "@/db/schema";

const VISITOR_COOKIE = "pol_visitor";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function apiError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** Stable anonymous device id stored in an httpOnly cookie. */
export async function getVisitor(create = false): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) return existing;
  if (!create) return null;
  const id = randomUUID();
  jar.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

export function normalizeCode(raw: string) {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  return raw
    .split("")
    .map((c) => (fa.indexOf(c) >= 0 ? String(fa.indexOf(c)) : c))
    .join("")
    .replace(/\D/g, "")
    .slice(0, 6);
}

export async function generateCode() {
  for (let i = 0; i < 20; i++) {
    const code = String(randomInt(100000, 999999));
    const [hit] = await db.select({ id: p2pSessions.id }).from(p2pSessions).where(eq(p2pSessions.code, code)).limit(1);
    if (!hit) return code;
  }
  throw new Error("Could not allocate code");
}

export async function findLiveSession(code: string) {
  const normalized = normalizeCode(code);
  if (normalized.length !== 6) return null;
  const [session] = await db
    .select()
    .from(p2pSessions)
    .where(and(eq(p2pSessions.code, normalized), gt(p2pSessions.expiresAt, new Date())))
    .limit(1);
  return session ?? null;
}

/** Very small in-memory rate limiter (per instance). */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimited(request: Request, scope: string, perMinute: number) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + 60_000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > perMinute;
}
