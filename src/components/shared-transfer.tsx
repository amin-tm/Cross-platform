"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleAlert, Copy, LoaderCircle, Monitor, ShieldCheck } from "lucide-react";
import { api, copyText } from "@/lib/client";
import type { Transfer } from "@/lib/shared";
import { Brand } from "@/components/ui";
import TransferUploader from "@/components/transfer-uploader";
import { TransferDownloads } from "@/components/transfer-downloads";

export default function SharedTransfer({ code }: { code: string }) {
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [retry, setRetry] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    let active = true;
    api<Transfer>(`/api/transfers/${code}`).then((item) => { if (active) { setTransfer(item); setError(""); } }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "لینک معتبر نیست."); });
    return () => { active = false; };
  }, [code, retry]);
  const waiting = transfer?.status === "pending" && transfer.kind !== "inbox";
  useEffect(() => {
    if (!waiting) return;
    const controller = new AbortController();
    let inFlight = false;
    const timer = setInterval(async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const item = await api<Transfer>(`/api/transfers/${code}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setTransfer(item);
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "اتصال برقرار نشد.");
        }
      } finally {
        inFlight = false;
      }
    }, 4000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [code, waiting]);

  const sending = transfer?.kind === "inbox" && transfer.status === "pending";
  const isText = transfer?.textContent != null;
  async function copyReceivedText() {
    if (transfer?.textContent == null) return;
    try {
      await copyText(transfer.textContent);
      setCopyStatus("متن کپی شد.");
    } catch {
      setCopyStatus("کپی انجام نشد. متن را انتخاب و دستی کپی کنید.");
    }
  }

  return (
    <div className={`shared-page transfer-link-page ${sending ? "transfer-link-send" : ""}`}>
      <header className="shared-header">
        <Link href="/" aria-label="صفحه اصلی پُل"><Brand compact/></Link>
        <Link className="shared-back" href="/">صفحهٔ اصلی<ArrowLeft size={16}/></Link>
      </header>
      <main className="shared-main">
        <div className="shared-intro">
          <div className="link-screen-icon">{sending || sent ? <Monitor size={25}/> : <ShieldCheck size={25}/>}</div>
          <h1>{sent ? "ارسال به کامپیوتر کامل شد" : sending ? "ارسال به کامپیوتر" : isText ? "دریافت متن" : "دریافت فایل"}</h1>
          {sending && <p>فایل‌های این گوشی را برای دستگاه مقصد بفرستید.</p>}
        </div>
        <section className="shared-card" aria-label={sending ? "ارسال فایل" : "نتیجهٔ انتقال"}>
          {error && !transfer ? (
            <div className="shared-error">
              <CircleAlert size={38}/>
              <h2>این اتصال در دسترس نیست</h2>
              <p role="alert">{error}</p>
              <button className="button button-outline" onClick={() => setRetry((current) => current + 1)}>تلاش مجدد</button>
              <Link className="text-button" href="/">ورود با کد دیگر<ArrowLeft size={16}/></Link>
            </div>
          ) : !transfer ? (
            <div className="shared-loading" role="status"><LoaderCircle size={30} className="spin"/><p>در حال بررسی کد اتصال…</p></div>
          ) : sent ? (
            <div className="shared-sent" role="status">
              <span><CheckCircle2 size={42}/></span>
              <h2>فایل‌ها به مقصد رسیدند</h2>
              <p>{transfer.fileCount.toLocaleString("fa-IR")} فایل روی کامپیوتر آمادهٔ دانلود است.</p>
              <Link className="button button-primary" href="/">انتقال جدید<ArrowLeft size={16}/></Link>
            </div>
          ) : sending ? (
            <>
              <div className="shared-card-heading">
                <span className="live-dot"/>
                <span>به دستگاه مقصد متصل هستید</span>
                <b dir="ltr">{code}</b>
              </div>
              <TransferUploader roomCode={code} onComplete={(item) => { setTransfer(item); setSent(true); }}/>
            </>
          ) : transfer.status === "ready" ? (
            isText ? (
              <div className="shared-sent">
                <div className="received-text" dir="auto">{transfer.textContent}</div>
                <button className="button button-primary" onClick={copyReceivedText}><Copy size={17}/>کپی متن</button>
                {copyStatus && <p role="status">{copyStatus}</p>}
              </div>
            ) : <TransferDownloads transfer={transfer}/>
          ) : (
            <div className="shared-loading" role="status">
              <LoaderCircle size={30} className="spin"/>
              <h2>فرستنده در حال آماده‌سازی فایل‌هاست</h2>
              <p>{error || "فایل‌ها پس از آماده‌شدن همین‌جا نمایش داده می‌شوند."}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
