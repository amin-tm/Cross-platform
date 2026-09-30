import type { Transfer } from "@/lib/shared";

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ارتباط با سرور برقرار نشد.");
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

export async function createTransfer(kind: "send" | "inbox", fresh = false) {
  return api<Transfer>("/api/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, fresh }) });
}

type UploadTicket = { id: string; upload: { signedUrl: string; token: string; path: string } };

function uploadToSupabase(file: File, signedUrl: string, onProgress: (loaded: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "true");
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
    xhr.send(file);
  });
}

export async function uploadFile(file: File, code: string, onProgress: (loaded: number) => void, signal: AbortSignal) {
  const ticket = await api<UploadTicket>(`/api/transfers/${code}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, mime: file.type || "application/octet-stream" }),
    signal,
  });
  await uploadToSupabase(file, ticket.upload.signedUrl, onProgress, signal);
  await api(`/api/transfers/${code}/files?action=finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: ticket.id }),
    signal,
  });
}
