import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "transfers";

const globalForSupabase = globalThis as typeof globalThis & {
  __polSupabaseAdmin?: SupabaseClient;
};

export function isStorageConfigured() {
  return Boolean(url && serviceRoleKey);
}

export function supabaseAdmin(): SupabaseClient {
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for storage.");
  }
  if (!globalForSupabase.__polSupabaseAdmin) {
    globalForSupabase.__polSupabaseAdmin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return globalForSupabase.__polSupabaseAdmin;
}

export function storagePath(transferId: string, fileId: string) {
  return `${transferId}/${fileId}`;
}

export async function createUploadTicket(transferId: string, fileId: string) {
  const { data, error } = await supabaseAdmin().storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath(transferId, fileId));
  if (error || !data) throw new Error(error?.message || "Failed to create signed upload URL");
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

export async function createDownloadUrl(transferId: string, fileId: string, filename: string, expiresIn = 60) {
  const { data, error } = await supabaseAdmin().storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath(transferId, fileId), expiresIn, { download: filename });
  if (error || !data) throw new Error(error?.message || "Failed to create signed download URL");
  return data.signedUrl;
}

export async function deleteStoredFiles(transferId: string, fileIds: string[]) {
  if (!fileIds.length) return;
  await supabaseAdmin().storage.from(STORAGE_BUCKET).remove(fileIds.map((id) => storagePath(transferId, id)));
}

export async function statStoredFile(transferId: string, fileId: string) {
  const { data, error } = await supabaseAdmin().storage
    .from(STORAGE_BUCKET)
    .list(transferId, { limit: 1000, search: fileId });
  if (error) throw new Error(error.message);
  return data?.find((item) => item.name === fileId) || null;
}
