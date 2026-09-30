"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, CircleAlert, FilePlus2, LoaderCircle, LockKeyhole, Plus, X } from "lucide-react";
import { api, createTransfer, uploadFile } from "@/lib/client";
import { formatSize, MAX_FILE_COUNT, MAX_TRANSFER_SIZE, type Transfer } from "@/lib/shared";
import { FileGlyph, UploadIllustration } from "@/components/ui";

export default function TransferUploader({ roomCode, onComplete, onBusyChange }: { roomCode?: string; onComplete: (transfer: Transfer) => void; onBusyChange?: (busy: boolean) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeFile, setActiveFile] = useState("");
  const [error, setError] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const aborter = useRef<AbortController | null>(null);
  const uploadCode = useRef(roomCode || "");
  const completed = useRef(new Set<number>());
  const total = files.reduce((sum, file) => sum + file.size, 0);

  useEffect(() => () => aborter.current?.abort(), []);
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
    const controller = new AbortController();
    aborter.current = controller;
    try {
      if (!uploadCode.current) uploadCode.current = (await createTransfer("send")).code;
      setHasStarted(true);
      let uploaded = files.reduce((sum, file, index) => sum + (completed.current.has(index) ? file.size : 0), 0);
      for (let index = 0; index < files.length; index++) {
        if (completed.current.has(index)) continue;
        if (controller.signal.aborted) throw new DOMException("توقف", "AbortError");
        const file = files[index];
        setActiveFile(file.name);
        await uploadFile(file, uploadCode.current, (loaded) => setProgress(total > 0 ? Math.min(99, Math.round((uploaded + loaded) / total * 100)) : Math.round(index / files.length * 100)), controller.signal);
        completed.current.add(index);
        uploaded += file.size;
      }
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

  return <div className="uploader"><input ref={input} type="file" multiple className="visually-hidden" aria-label="انتخاب فایل برای ارسال" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }}/>
    <div className={`upload-dropzone ${dragging ? "is-dragging" : ""} ${files.length ? "has-files" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!hasStarted) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
      {!files.length ? <div className="dropzone-content"><UploadIllustration/><h3>{dragging ? "رها کنید، بقیه‌اش با پُل" : "فایل‌ها را اینجا رها کنید"}</h3><p>یا با یک کلیک، فایل‌های خود را انتخاب کنید</p><button className="button button-primary select-file-button" onClick={() => input.current?.click()}><Plus size={18}/><span>انتخاب فایل‌ها</span></button><div className="upload-limits"><span>همهٔ فرمت‌ها</span><i/><span>تا ۲ گیگابایت</span></div></div> : <div className="selected-files"><div className="selected-header"><span><FilePlus2 size={17}/>{files.length.toLocaleString("fa-IR")} فایل انتخاب شده</span>{!hasStarted && <button className="text-button" onClick={() => input.current?.click()}><Plus size={15}/>افزودن فایل</button>}</div><div className="upload-file-list">{files.map((file, index) => <div className="upload-file" key={`${file.name}-${file.lastModified}-${index}`}><FileGlyph name={file.name}/><div className="file-details"><b dir="auto">{file.name}</b><span dir="ltr">{formatSize(file.size)}</span></div>{completed.current.has(index) ? <Check size={18} className="success-icon"/> : !hasStarted ? <button className="icon-button small" aria-label={`حذف ${file.name}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={15}/></button> : <span className="file-waiting-dot"/>}</div>)}</div><div className="upload-summary"><span>حجم کل</span><strong dir="ltr">{formatSize(total)}</strong></div>{uploading ? <div className="upload-progress"><div className="progress-label"><span><LoaderCircle size={15} className="spin"/>در حال ارسال…</span><strong>{progress.toLocaleString("fa-IR")}٪</strong></div><div className="progress-track"><div style={{ width: `${progress}%` }}/></div><div className="progress-bottom"><span dir="auto">{activeFile}</span><button onClick={() => aborter.current?.abort()}>توقف ارسال</button></div></div> : <button className="button button-primary full-width" onClick={startUpload}><ArrowUp size={18}/>{hasStarted ? "ادامه ارسال" : "ارسال فایل‌ها"}<span className="button-file-count">{files.length.toLocaleString("fa-IR")}</span></button>}</div>}
    </div>{error && <div className="inline-error" role="alert"><CircleAlert size={16}/><span>{error}</span></div>}<div className="uploader-footer"><LockKeyhole size={14}/><span>فایل‌ها خصوصی‌اند و پس از ۲۴ ساعت حذف می‌شوند.</span><span className="footer-info" title="هر کسی که لینک یا کد را داشته باشد می‌تواند فایل‌ها را دریافت کند.">i</span></div>
  </div>;
}
