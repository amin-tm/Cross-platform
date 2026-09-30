"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, Clock3, Copy, Download, Link2, LoaderCircle, LockKeyhole, Share2 } from "lucide-react";
import { formatSize, type Transfer, type TransferFile } from "@/lib/shared";
import { FileGlyph } from "@/components/ui";
import QRImage from "@/components/qr-code";

async function triggerBrowserDownload(url: string, filename: string, index: number) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  if (index >= 0) await new Promise((resolve) => setTimeout(resolve, 400));
}

export function TransferDownloads({ transfer }: { transfer: Transfer }) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const hoursLeft = Math.max(0, Math.ceil((new Date(transfer.expiresAt).getTime() - now) / 3600000));
  if (hoursLeft === 0) return <div className="receive-waiting"><div className="waiting-icon"><Clock3 size={32}/></div><h3>زمان دریافت به پایان رسیده است</h3><p>برای دریافت فایل‌ها، از فرستنده یک لینک جدید بخواهید.</p></div>;

  async function downloadAll() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      for (let index = 0; index < transfer.files.length; index++) {
        const file = transfer.files[index];
        await triggerBrowserDownload(`/api/transfers/${transfer.code}/download?file=${file.id}`, file.name, index);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "دریافت کامل نشد."); }
    finally { setBusy(false); }
  }

  const url = (file: TransferFile) => `/api/transfers/${transfer.code}/download?file=${file.id}`;
  return <div className="download-panel"><div className="result-heading"><span className="result-check"><Download size={23}/></span><div><h2>فایل‌ها آمادهٔ دریافت‌اند</h2><p>{transfer.fileCount.toLocaleString("fa-IR")} فایل، بدون نصب و ثبت‌نام</p></div></div><div className="download-file-list">{transfer.files.map((file) => <div className="download-file" key={file.id}><FileGlyph name={file.name}/><div className="file-details"><b dir="auto">{file.name}</b><span dir="ltr">{formatSize(file.size)}</span></div><a href={url(file)} className="icon-button" aria-label={`دریافت ${file.name}`} title="دریافت فایل" download={file.name}><Download size={18}/></a></div>)}</div>{transfer.files.length === 1 ? <a href={url(transfer.files[0])} className="button button-primary full-width" download={transfer.files[0].name}><Download size={18}/>دریافت فایل<span className="download-total" dir="ltr">{formatSize(transfer.totalSize)}</span></a> : <button className="button button-primary full-width" onClick={downloadAll} disabled={busy}>{busy ? <LoaderCircle size={18} className="spin"/> : <Download size={18}/>}{busy ? "در حال دریافت…" : "دریافت همهٔ فایل‌ها"}<span className="download-total" dir="ltr">{formatSize(transfer.totalSize)}</span></button>}{error && <div className="inline-error" role="alert">{error}</div>}<div className="download-expiry"><LockKeyhole size={14}/><span>این فایل‌ها تا {hoursLeft.toLocaleString("fa-IR")} ساعت دیگر در دسترس‌اند.</span></div></div>;
}

export function TransferSuccess({ transfer, origin, onCopy, onReset }: { transfer: Transfer; origin: string; onCopy: (value: string) => void; onReset: () => void }) {
  const url = `${origin}/r/${transfer.code}`;
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: "دریافت فایل با پُل", text: "فایل‌ها آماده‌اند؛ بدون نصب از این لینک دریافت کنید.", url }); } catch { /* user cancelled */ }
    } else onCopy(url);
  }
  return <div className="share-result"><div className="result-heading"><span className="result-check"><Check size={24}/></span><div><h2>فایل‌ها با موفقیت ارسال شدند!</h2><p>لینک را بفرستید، بقیه‌اش با پُل.</p></div></div><div className="share-result-body"><QRImage value={url} size={120}/><div className="share-result-info"><span className="small-label">کد دریافت فایل</span><b className="share-code" dir="ltr">{transfer.code.slice(0, 3)} {transfer.code.slice(3)}</b><span>{transfer.fileCount.toLocaleString("fa-IR")} فایل <i>·</i> <span dir="ltr">{formatSize(transfer.totalSize)}</span></span><span className="result-available"><CheckCircle2 size={13}/>آمادهٔ دریافت روی همهٔ دستگاه‌ها</span></div></div><div className="share-url"><Link2 size={17}/><input value={url} readOnly dir="ltr" aria-label="لینک دریافت فایل" onFocus={(event) => event.target.select()}/><button className="icon-button" aria-label="کپی لینک دریافت" onClick={() => onCopy(url)}><Copy size={16}/></button></div><div className="share-actions"><button className="button button-primary" onClick={() => onCopy(url)}><Copy size={16}/>کپی لینک دریافت</button><button className="button button-outline" onClick={share}><Share2 size={17}/>اشتراک‌گذاری</button></div><button className="text-button new-transfer-button" onClick={onReset}>ارسال فایل جدید<ArrowLeft size={16}/></button></div>;
}
