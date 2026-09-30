"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleAlert, Globe2, LoaderCircle, Monitor, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import type { Transfer } from "@/lib/shared";
import { Brand, PlatformIcon } from "@/components/ui";
import TransferUploader from "@/components/transfer-uploader";
import { TransferDownloads } from "@/components/transfer-downloads";

export default function SharedTransfer({ code }: { code: string }) {
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    api<Transfer>(`/api/transfers/${code}`).then((item) => { if (active) { setTransfer(item); setError(""); } }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "لینک معتبر نیست."); });
    return () => { active = false; };
  }, [code, retry]);
  useEffect(() => {
    if (!transfer || transfer.status !== "pending" || transfer.kind === "inbox") return;
    let active = true;
    const timer = setInterval(() => { api<Transfer>(`/api/transfers/${code}`).then((item) => { if (active) setTransfer(item); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "اتصال برقرار نشد."); }); }, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [code, transfer]);

  const sending = transfer?.kind === "inbox" && transfer.status === "pending";
  return <div className="shared-page"><header className="shared-header"><Link href="/" aria-label="صفحه اصلی پُل"><Brand compact/></Link><span className="shared-header-note"><ShieldCheck size={15}/>بدون نصب، بدون ثبت‌نام</span></header><main className="shared-main"><div className="shared-intro"><span className="shared-eyebrow">فقط یک پُل تا دستگاه دیگر</span><h1>{sending ? "فایل‌ها را به مقصد برسانید." : "فایل‌ها، از آن سوی پُل."}</h1><p>{sending ? "به دستگاه دیگر متصل شدید. فایل‌ها را انتخاب و ارسال کنید." : "فایل‌های شما همین‌جا آمادهٔ دریافت هستند."}</p></div><section className="shared-card">{error && !transfer ? <div className="shared-error"><CircleAlert size={44}/><h2>این پُل در دسترس نیست</h2><p>{error}</p><button className="button button-outline" onClick={() => setRetry((current) => current + 1)}>تلاش مجدد</button><Link className="text-button" href="/">ورود با کد دیگر<ArrowLeft size={16}/></Link></div> : !transfer ? <div className="shared-loading"><LoaderCircle size={35} className="spin"/><p>در حال اتصال به پُل…</p></div> : sent ? <div className="shared-sent"><span><CheckCircle2 size={48} strokeWidth={1.5}/></span><h2>به همین راحتی، فایل‌ها رسیدند!</h2><p>ارسال کامل شد. حالا در دستگاه مقصد، دکمهٔ دریافت فایل‌ها را بزنید.</p><div className="shared-destination"><Monitor size={19}/>فایل‌ها آمادهٔ دریافت روی دستگاه مقصد هستند</div><Link className="button button-primary" href="/">یک انتقال جدید<ArrowLeft size={16}/></Link></div> : sending ? <><div className="shared-card-heading"><span className="live-dot"/><span>به دستگاه مقصد متصل هستید</span><b dir="ltr">{code}</b></div><TransferUploader roomCode={code} onComplete={(item) => { setTransfer(item); setSent(true); }}/></> : transfer.status === "ready" ? <TransferDownloads transfer={transfer}/> : <div className="shared-loading"><LoaderCircle size={35} className="spin"/><h2>فرستنده در حال آماده‌سازی فایل‌هاست</h2><p>صفحه را باز نگه دارید؛ فایل‌ها به‌صورت خودکار نمایش داده می‌شوند.</p></div>}</section><div className="shared-platforms"><span>یک مرورگر، روی هر دستگاهی</span><div><PlatformIcon platform="android"/><PlatformIcon platform="apple"/><PlatformIcon platform="windows"/></div></div><Link href="/" className="shared-home-link">با پُل، شما هم فایل بفرستید<ArrowLeft size={15}/></Link></main><footer className="shared-footer"><Globe2 size={14}/>فاصله مهم نیست؛ فقط به اینترنت نیاز دارید.</footer></div>;
}
