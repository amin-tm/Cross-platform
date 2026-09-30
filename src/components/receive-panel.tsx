"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CircleAlert, Download, KeyRound, LoaderCircle, LockKeyhole } from "lucide-react";
import { api } from "@/lib/client";
import { normalizeCode, type Transfer } from "@/lib/shared";
import { TransferDownloads } from "@/components/transfer-downloads";

export default function ReceivePanel() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [transfer, setTransfer] = useState<Transfer | null>(null);

  useEffect(() => {
    if (!transfer || transfer.status !== "pending") return;
    const timer = setInterval(async () => {
      try {
        const next = await api<Transfer>(`/api/transfers/${transfer.code}`);
        setTransfer(next);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "اتصال برقرار نشد."); }
    }, 4000);
    return () => clearInterval(timer);
  }, [transfer]);

  async function receive(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const result = await api<Transfer>(`/api/transfers/${code}`);
      if (result.kind === "inbox" && result.status === "pending") { window.location.assign(`/r/${code}`); return; }
      setTransfer(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "کد دریافت معتبر نیست."); }
    finally { setLoading(false); }
  }

  if (transfer?.status === "ready") return <div className="receive-result"><TransferDownloads transfer={transfer}/><button className="text-button" onClick={() => { setTransfer(null); setCode(""); }}>دریافت با کد دیگر<ArrowLeft size={15}/></button></div>;
  if (transfer) return <div className="receive-waiting"><div className="waiting-icon"><LoaderCircle size={32} className="spin"/></div><h3>منتظر فایل‌های فرستنده هستیم</h3><p>به محض پایان ارسال، فایل‌ها همین‌جا ظاهر می‌شوند.</p><span className="waiting-code" dir="ltr">{transfer.code}</span><button className="text-button" onClick={() => setTransfer(null)}>وارد کردن کد دیگر<ArrowLeft size={15}/></button>{error && <div className="inline-error">{error}</div>}</div>;
  return <form className="receive-panel" onSubmit={receive}><div className="receive-icon"><KeyRound size={31} strokeWidth={1.6}/></div><h3>یک کد، تا رسیدن فایل‌ها</h3><p>کد ۶ رقمی فرستنده را وارد کنید.<br/>طرف مقابل می‌تواند لینک دریافت را هم برایتان بفرستد.</p><label htmlFor="receive-code" className="visually-hidden">کد ۶ رقمی دریافت یا لینک انتقال</label><input className="receive-code-input" id="receive-code" value={code} placeholder="— — — — — —" inputMode="numeric" autoComplete="off" dir="ltr" onChange={(event) => { const value = event.target.value; const linkCode = value.match(/\/r\/(\d{6})/); setCode(linkCode ? linkCode[1] : normalizeCode(value)); setError(""); }} autoFocus/><button className="button button-primary" type="submit" disabled={code.length !== 6 || loading}>{loading ? <LoaderCircle size={17} className="spin"/> : <Download size={17}/>}دریافت فایل‌ها</button>{error && <div className="inline-error" role="alert"><CircleAlert size={15}/>{error}</div>}<div className="receive-note"><LockKeyhole size={13}/>دریافت امن، بدون حساب کاربری</div></form>;
}
