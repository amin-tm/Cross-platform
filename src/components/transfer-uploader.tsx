"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, CircleAlert, FilePlus2, LoaderCircle, LockKeyhole, Plus, X } from "lucide-react";
import { api, createTransfer, RESUMABLE_CHUNK_SIZE, uploadFile, type UploadAttempt, type UploadPhase } from "@/lib/client";
import { formatSize, MAX_FILE_COUNT, MAX_TRANSFER_SIZE, type Transfer } from "@/lib/shared";
import { FileGlyph, UploadIllustration } from "@/components/ui";

export default function TransferUploader({ roomCode, onComplete, onBusyChange }: { roomCode?: string; onComplete: (transfer: Transfer) => void; onBusyChange?: (busy: boolean) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeFile, setActiveFile] = useState("");
  const [phase, setPhase] = useState<UploadPhase>("preparing");
  const attempts = useRef(new Map<number, UploadAttempt>());
  const [error, setError] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const aborter = useRef<AbortController | null>(null);
  const uploadCode = useRef(roomCode || "");
  const [completed, setCompleted] = useState(() => new Set<number>());
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const [speed, setSpeed] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);


  useEffect(() => () => aborter.current?.abort(), []);

  // POL_NATIVE_SHARE: Receive Android content URIs through a WebView-only stream endpoint.
  useEffect(() => {
    type NativeEntry = { name: string; type: string; url: string };
    type NativeWindow = Window & { __polPendingShare?: NativeEntry[] };
    let cancelled = false;
    let processing = false;
    const consume = async () => {
      const nativeWindow = window as NativeWindow;
      const entries = nativeWindow.__polPendingShare;
      if (processing || !Array.isArray(entries) || entries.length === 0) return;
      processing = true;
      try {
        const received: File[] = [];
        for (const entry of entries) {
          if (typeof entry.url !== "string" || !entry.url.startsWith("/__pol_native_share__/")) throw new Error("نشانی فایل اشتراکی نامعتبر است.");
          const response = await fetch(entry.url, { cache: "no-store" });
          if (!response.ok) throw new Error("خواندن فایل اشتراکی از اندروید ناموفق بود.");
          const blob = await response.blob();
          received.push(new File([blob], entry.name || "shared-file", { type: entry.type || blob.type || "application/octet-stream" }));
        }
        if (cancelled) return;
        if (received.length > MAX_FILE_COUNT || received.reduce((sum, file) => sum + file.size, 0) > MAX_TRANSFER_SIZE) {
          setError("تعداد یا حجم فایل‌های اشتراکی بیشتر از حد مجاز پُل است.");
          return;
        }
        setFiles(received);
        setError("");
        delete nativeWindow.__polPendingShare;
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "دریافت فایل اشتراکی ممکن نشد.");
      } finally { processing = false; }
    };
    window.addEventListener("pol-native-share", consume);
    void consume();
    return () => { cancelled = true; window.removeEventListener("pol-native-share", consume); };
  }, []);

  useEffect(() => {
    onBusyChange?.(uploading);
    return () => onBusyChange?.(false);
  }, [uploading, onBusyChange]);
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  function addFiles(incoming: FileList | File[]) {
    if (hasStarted) return;
    setError("");
    const additions = Array.from(incoming).filter((file) => !files.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified));
    const next = [...files, ...additions];
    if (next.length > MAX_FILE_COUNT) { setError("در هر انتقال می‌توانید حداکثر ۱۰۰ فایل انتخاب کنید."); return; }
    if (next.reduce((sum, file) => sum + file.size, 0) > MAX_TRANSFER_SIZE) { setError("حجم مجموع فایل‌ها باید کمتر از ۲ گیگابایت باشد."); return; }
    setFiles(next);
  }
  async function startUpload() {
    if (!files.length || uploading) return;
    setError("");
    setUploading(true);
    setPhase("preparing");
    setSpeed(0);
    let speedSample = {
      time: performance.now(),
      bytes: 0,
    };
    const controller = new AbortController();
    aborter.current = controller;
    try {
      if (!uploadCode.current) uploadCode.current = (await createTransfer("send", false, controller.signal)).code;
      setHasStarted(true);

      const concurrency = files.some((file) => file.size > RESUMABLE_CHUNK_SIZE) ? 1 : 3;
      const phases = new Map<number, UploadPhase>();
      const updatePhase = (index: number, next?: UploadPhase) => {
        if (next) phases.set(index, next);
        else phases.delete(index);
        const current = [...phases.values()];
        setPhase(current.includes("uploading") ? "uploading" : current.includes("preparing") ? "preparing" : "verifying");
      };

      let completedBytes = 0;
      completed.forEach((i) => (completedBytes += files[i].size));

      const loadedPerFile = new Map<number, number>();
      const queue = files.map((_, i) => i).filter((i) => !completed.has(i));

      const updateProgress = () => {
        let inFlight = 0;
        loadedPerFile.forEach((v) => (inFlight += v));
        const currentBytes = completedBytes + inFlight;

        setUploadedBytes(currentBytes);
        setProgress(total > 0 ? Math.min(99, Math.round((currentBytes / total) * 100)) : 0);

        const now = performance.now();
        const elapsed = (now - speedSample.time) / 1000;
        if (elapsed >= 1) {
          setSpeed(Math.max(0, currentBytes - speedSample.bytes) / elapsed);
          speedSample = { time: now, bytes: currentBytes };
        }
      };

      const worker = async () => {
        while (queue.length > 0) {
          if (controller.signal.aborted) throw new DOMException("توقف", "AbortError");
          const index = queue.shift()!;
          const file = files[index];
          setActiveFile(file.name);

          loadedPerFile.set(index, 0);
          try {
            const attempt = attempts.current.get(index) ?? {};
            attempts.current.set(index, attempt);
            await uploadFile(file, uploadCode.current, attempt, (loaded) => {
              loadedPerFile.set(index, loaded);
              updateProgress();
            }, (next) => updatePhase(index, next), controller.signal);
          } finally {
            loadedPerFile.delete(index);
            updatePhase(index);
          }

          completedBytes += file.size;
          setCompleted((previous) => new Set(previous).add(index));
          updateProgress();
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, worker);
      try {
        await Promise.all(workers);
      } catch (error) {
        controller.abort();
        await Promise.allSettled(workers);
        throw error;
      }
      setPhase("verifying");
      const result = await api<Transfer>(`/api/transfers/${uploadCode.current}/complete`, { method: "POST", signal: controller.signal });
      setProgress(100);
      onComplete(result);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") setError("ارسال متوقف شد. برای ادامه، دکمهٔ «ادامه ارسال» را بزنید.");
      else setError(cause instanceof Error ? cause.message : "ارسال کامل نشد. دوباره تلاش کنید.");
    } finally {
      setUploading(false);
    }
  }

  const phaseLabel = phase === "preparing" ? "در حال آماده‌سازی فایل…" : phase === "verifying" ? "در حال تأیید فایل…" : "در حال ارسال…";
  const fileCount = files.length.toLocaleString("fa-IR");
  const remaining = Math.max(0, total - uploadedBytes);
  return (
    <div className="uploader">
      <input ref={input} type="file" multiple className="visually-hidden" tabIndex={-1} aria-label="انتخاب فایل برای ارسال" onChange={(event) => {
        if (event.target.files) addFiles(event.target.files);
        event.target.value = "";
      }}/>
      <div
        className={`upload-dropzone ${dragging ? "is-dragging" : ""} ${files.length ? "has-files" : ""}`}
        onDragOver={(event) => { event.preventDefault(); if (!hasStarted) setDragging(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
      >
        {!files.length ? (
          <div className="dropzone-content">
            <UploadIllustration/>
            <h3><span className="upload-pointer-heading">{dragging ? "فایل را رها کنید" : "فایل‌ها را اینجا رها کنید"}</span><span className="upload-touch-heading">فایل‌ها را برای ارسال انتخاب کنید</span></h3>
            <button className="button button-primary select-file-button" onClick={() => input.current?.click()}><Plus size={19}/>انتخاب فایل‌ها</button>
            <div className="upload-limits"><span>تا ۲ گیگابایت در هر انتقال</span></div>
          </div>
        ) : (
          <div className="selected-files">
            <div className="selected-header">
              <span><FilePlus2 size={18}/>{fileCount} فایل انتخاب شد</span>
              {!hasStarted && <button className="text-button add-file-button" onClick={() => input.current?.click()}><Plus size={17}/>افزودن فایل</button>}
            </div>
            <ul className="upload-file-list">
              {files.map((file, index) => (
                <li className="upload-file" key={`${file.name}-${file.lastModified}-${index}`}>
                  <FileGlyph name={file.name}/>
                  <div className="file-details"><b dir="auto">{file.name}</b><span dir="ltr">{formatSize(file.size)}</span></div>
                  {completed.has(index) ? <Check size={19} className="success-icon" aria-label="ارسال شد"/> :
                    !hasStarted ? <button className="icon-button remove-file-button" aria-label={`حذف ${file.name}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={17}/></button> :
                    <span className="file-waiting-dot" aria-label="در صف ارسال"/>}
                </li>
              ))}
            </ul>
            <div className="upload-summary"><span>حجم کل</span><strong dir="ltr">{formatSize(total)}</strong></div>
            {uploading ? (
              <div className="upload-progress">
                <div className="progress-label"><span role="status"><LoaderCircle size={15} className="spin"/>{phaseLabel}</span><strong>{progress.toLocaleString("fa-IR")}٪</strong></div>
                <div className="progress-track" role="progressbar" aria-label="پیشرفت ارسال" aria-valuenow={progress}><div style={{ width: `${progress}%` }}/></div>
                <div className="upload-stats">
                  <span>{formatSize(uploadedBytes)} از {formatSize(total)}</span>
                  {phase === "uploading" && speed > 0 && <span>حدود {Math.ceil(remaining / speed).toLocaleString("fa-IR")} ثانیه باقی‌مانده</span>}
                </div>
                <div className="progress-bottom"><span dir="auto">{activeFile}</span><button onClick={() => aborter.current?.abort()}>توقف ارسال</button></div>
              </div>
            ) : (
              <button className="button button-primary full-width submit-files-button" onClick={startUpload}>
                <ArrowUp size={18}/>{hasStarted ? "ادامه ارسال" : "ارسال فایل‌ها"}
                <span className="button-file-count" aria-hidden="true">{fileCount}</span>
              </button>
            )}
          </div>
        )}
      </div>
      {error && <div className="inline-error" role="alert"><CircleAlert size={16}/><span>{error}</span></div>}
      <div className="uploader-footer"><LockKeyhole size={14}/><span>لینک دریافت تا ۲۴ ساعت اعتبار دارد.</span></div>
    </div>
  );
}
