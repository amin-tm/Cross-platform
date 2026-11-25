import type { Transfer } from "@/lib/shared";

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new Error(data?.error || "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
  }
  return data as T;
}

export async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("کپی خودکار ممکن نیست. لینک را به‌صورت دستی انتخاب کنید.");
}

let pendingTransfer: Promise<Transfer> | undefined;

export async function createTransfer(kind: "send" | "inbox", fresh = false, signal?: AbortSignal) {
  const create = () => api<Transfer>("/api/transfers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, fresh }),
    signal,
  });
  // Let the earliest request establish the browser's device cookie.
  const transfer = pendingTransfer ? pendingTransfer.then(create, create) : create();
  pendingTransfer = transfer;
  try {
    return await transfer;
  } finally {
    if (pendingTransfer === transfer) pendingTransfer = undefined;
  }
}

type UploadTicket = {
  id: string;
  upload: {
    signedUrl: string;
    token: string;
    path: string;
    resumable?: { endpoint: string; bucket: string; publishableKey?: string };
  };
};

export type UploadAttempt = {
  ticket?: UploadTicket;
  uploadUrl?: string;
  stored?: boolean;
};

export type UploadPhase = "preparing" | "uploading" | "verifying";

export const RESUMABLE_CHUNK_SIZE = 6 * 1024 * 1024;

function uploadAborted() {
  return new DOMException("ارسال متوقف شد.", "AbortError");
}

async function uploadResumable(
  file: File,
  { path, token, resumable }: UploadTicket["upload"],
  attempt: UploadAttempt,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
) {
  if (!resumable) throw new Error("ارسال قابل‌ادامه در دسترس نیست.");
  const { Upload } = await import("tus-js-client");
  if (signal.aborted) throw uploadAborted();

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumable.endpoint,
      uploadUrl: attempt.uploadUrl ?? null,
      storeFingerprintForResuming: false,
      retryDelays: [0, 1000, 3000, 5000],
      chunkSize: RESUMABLE_CHUNK_SIZE,
      headers: {
        "x-signature": token,
        ...(resumable.publishableKey ? { apikey: resumable.publishableKey } : {}),
      },
      metadata: {
        bucketName: resumable.bucket,
        objectName: path,
        contentType: file.type || "application/octet-stream",
      },
      onUploadUrlAvailable() {
        attempt.uploadUrl = upload.url ?? undefined;
      },
      onProgress,
      onError(error) {
        signal.removeEventListener("abort", abort);
        const status = "originalResponse" in error ? error.originalResponse?.getStatus() : undefined;
        reject(new Error(status
          ? `ارسال فایل کامل نشد (خطای ${status}). دوباره تلاش کنید.`
          : "اتصال هنگام ارسال فایل قطع شد. دوباره تلاش کنید تا ارسال ادامه پیدا کند."));
      },
      onSuccess() {
        signal.removeEventListener("abort", abort);
        resolve();
      },
    });
    function abort() {
      void upload.abort().then(
        () => reject(uploadAborted()),
        () => reject(uploadAborted()),
      );
    }
    signal.addEventListener("abort", abort, { once: true });
    upload.start();
  });
}

function uploadToSupabase(file: File, signedUrl: string, onProgress: (loaded: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.timeout = 60 * 60 * 1000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded); };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(file.size); resolve(); }
      else reject(new Error(`آپلود انجام نشد (${xhr.status}). دوباره تلاش کنید.`));
    };
    xhr.onerror = () => { cleanup(); reject(new Error("اتصال به فضای ذخیره‌سازی قطع شد. دوباره تلاش کنید.")); };
    xhr.ontimeout = () => { cleanup(); reject(new Error("ارسال بیش از حد طول کشید. دوباره تلاش کنید.")); };
    xhr.onabort = () => { cleanup(); reject(new DOMException("ارسال متوقف شد.", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { cleanup(); reject(new DOMException("ارسال متوقف شد.", "AbortError")); return; }
    try {
      xhr.send(file);
    } catch {
      cleanup();
      reject(new Error("مرورگر نتوانست فایل انتخاب‌شده را بخواند. دوباره فایل را انتخاب کنید."));
    }
  });
}

export async function uploadFile(
  file: File,
  code: string,
  attempt: UploadAttempt,
  onProgress: (loaded: number) => void,
  onPhase: (phase: UploadPhase) => void,
  signal: AbortSignal,
) {
  onPhase("preparing");
  const ticket = attempt.ticket ??= await api<UploadTicket>(`/api/transfers/${code}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, mime: file.type || "application/octet-stream" }),
    signal,
  });
  if (!attempt.stored) {
    onPhase("uploading");
    const reportProgress = (loaded: number) => onProgress(Math.min(loaded, file.size));
    if (file.size > RESUMABLE_CHUNK_SIZE && ticket.upload.resumable) {
      await uploadResumable(file, ticket.upload, attempt, reportProgress, signal);
    } else {
      await uploadToSupabase(file, ticket.upload.signedUrl, reportProgress, signal);
    }
    attempt.stored = true;
  }
  onProgress(file.size);
  onPhase("verifying");
  await api(`/api/transfers/${code}/files?action=finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: ticket.id }),
    signal,
  });
}
