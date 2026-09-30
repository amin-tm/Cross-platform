"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { File, FileArchive, FileImage, FileText, Film, Music, X } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}><span className="brand-mark"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M9 27V19C9 12.5 13.5 8 20 8s11 4.5 11 11v8" stroke="currentColor" strokeWidth="4.3" strokeLinecap="round"/><path d="M16 27v-8a4 4 0 0 1 8 0v8" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/><circle cx="9" cy="33" r="2.1" fill="#b9eae0"/><circle cx="31" cy="33" r="2.1" fill="#b9eae0"/></svg></span><div><span className="brand-name">پُل<span className="brand-dot">.</span></span>{!compact && <span className="brand-subtitle">فاصله‌ها را بردار</span>}</div></div>;
}

export function PlatformIcon({ platform, size = 20 }: { platform: "android" | "apple" | "windows"; size?: number }) {
  if (platform === "windows") return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 4.7 10.2 3.5v8H2zm9.7-1.4L22 1.8v9.7H11.7zM2 12.9h8.2v8L2 19.7zm9.7 0H22v9.4l-10.3-1.4z"/></svg>;
  if (platform === "apple") return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.1 12.4c0-2 1.6-3.1 1.7-3.2-.9-1.3-2.2-1.5-2.7-1.6-1.2-.1-2.3.7-2.9.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.8-3.2 1.9-1.4 2.4-.4 6.1 1 8.1.7 1 1.5 2.1 2.5 2 1-.1 1.4-.6 2.6-.6s1.6.6 2.6.6c1.1 0 1.8-1 2.4-2 .8-1.2 1.1-2.4 1.1-2.5-.1 0-2.6-1-2.6-3.7ZM15.2 6.2c.6-.8 1.1-1.8 1-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.2 1.8-1.1 2.8 1 .1 2.1-.5 2.8-1.3Z"/></svg>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m7.4 5.1-1.5-2a.55.55 0 0 1 .9-.6l1.6 2.1a9 9 0 0 1 7.2 0l1.6-2.1a.55.55 0 0 1 .9.6l-1.5 2a7.1 7.1 0 0 1 3.3 5.5H4.1a7.1 7.1 0 0 1 3.3-5.5ZM8 8a.7.7 0 1 0 0-1.4A.7.7 0 0 0 8 8Zm8 0a.7.7 0 1 0 0-1.4A.7.7 0 0 0 16 8ZM4.2 12h15.6v7.1a1.3 1.3 0 0 1-1.3 1.3H17v1.4a1 1 0 0 1-2 0v-1.4H9v1.4a1 1 0 0 1-2 0v-1.4H5.5a1.3 1.3 0 0 1-1.3-1.3ZM1 12.4a1.1 1.1 0 0 1 2.2 0v5.4a1.1 1.1 0 0 1-2.2 0Zm19.8 0a1.1 1.1 0 0 1 2.2 0v5.4a1.1 1.1 0 0 1-2.2 0Z"/></svg>;
}

export function UploadIllustration() {
  return <div className="upload-art" aria-hidden="true"><span className="art-orbit orbit-one"/><span className="art-orbit orbit-two"/><svg viewBox="0 0 132 110" fill="none"><rect x="49" y="10" width="47" height="61" rx="7" transform="rotate(12 49 10)" fill="#e5e5fc" stroke="#c7c6f5"/><path d="m61 25 20 4m-22 6 20 4m-22 6 14 3" stroke="#b1aff0" strokeWidth="3" strokeLinecap="round"/><path d="M23 44a8 8 0 0 1 8-8h21l9 9h39a8 8 0 0 1 8 8v42a8 8 0 0 1-8 8H31a8 8 0 0 1-8-8V44Z" fill="#8884ef"/><path d="M17 58a7 7 0 0 1 7-7h83a7 7 0 0 1 7 8l-6 38a8 8 0 0 1-8 7H31a8 8 0 0 1-8-7l-6-39Z" fill="#b7b3fa"/><circle cx="65" cy="78" r="19" fill="#fff"/><path d="M65 88V68m-7 7 7-7 7 7" stroke="#6560de" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"/></svg><span className="art-spark spark-one">+</span><span className="art-spark spark-two">+</span><span className="art-small-dot"/></div>;
}

export function FileGlyph({ name, size = 21 }: { name: string; size?: number }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const image = /^(png|jpg|jpeg|svg|webp|gif|heic)$/.test(ext);
  const video = /^(mp4|mov|mkv|webm)$/.test(ext);
  const audio = /^(mp3|wav|m4a|ogg)$/.test(ext);
  const archive = /^(zip|rar|7z|tar|gz)$/.test(ext);
  const document = /^(pdf|doc|docx|txt|xlsx|pptx)$/.test(ext);
  const Icon = image ? FileImage : video ? Film : audio ? Music : archive ? FileArchive : document ? FileText : File;
  return <span className={`file-glyph ${image ? "file-image" : video ? "file-video" : audio ? "file-audio" : archive ? "file-archive" : "file-document"}`}><Icon size={size} strokeWidth={1.7}/></span>;
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    const focusable = () => node?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, textarea, select, [tabindex="0"]');
    focusable()?.[0]?.focus();
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const elements = focusable();
        if (!elements?.length) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keyHandler);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", keyHandler); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`modal ${wide ? "modal-wide" : ""}`} ref={ref} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="بستن پنجره" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}
