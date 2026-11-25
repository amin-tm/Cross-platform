"use client";

import Link from "next/link";
import { Check, Copy, Download, Link2, LoaderCircle, RefreshCw, ScanLine, Smartphone } from "lucide-react";
import QRImage from "@/components/qr-code";
import { FileGlyph } from "@/components/ui";
import { formatSize, type Transfer } from "@/lib/shared";

type ConnectionCardProps = {
  inbox: Transfer | null;
  origin: string;
  error: string;
  onRefresh: () => void;
  onCopy: (value: string) => void;
};

export default function ConnectionCard({ inbox, origin, error, onRefresh, onCopy }: ConnectionCardProps) {
  const url = inbox && origin ? `${origin}/r/${inbox.code}` : "";
  const ready = inbox?.status === "ready";
  const connected = Boolean(inbox?.hasContributor || inbox?.fileCount);
  const status = ready ? "آمادهٔ دریافت" : error ? "اتصال برقرار نشد" : connected ? "گوشی متصل شد" : inbox ? "منتظر گوشی" : "در حال ساخت کد";

  return (
    <section className="connection-card pairing-card" id="quick-connect" aria-labelledby="pairing-title">
      <div className="pairing-top">
        <span className="pairing-device"><Smartphone size={21} aria-hidden="true"/></span>
        <span className="pairing-status" role="status"><span/>{status}</span>
      </div>
      <h2 id="pairing-title">دریافت از گوشی</h2>
      <p className="connection-description">
        {ready ? "فایل‌های رسیده را همین‌جا دانلود کنید." : "دوربین گوشی را باز کنید و QR را اسکن کنید."}
      </p>
      {ready ? (
        <div className="pairing-received">
          <div className="pairing-received-title"><Check size={18}/><h3>فایل‌ها رسیدند!</h3></div>
          <ul className="pairing-files">
            {inbox.files.map((file) => (
              <li key={file.id}>
                <span className="pairing-file-icon"><FileGlyph name={file.name} size={17}/></span>
                <span className="pairing-file-name"><b dir="auto">{file.name}</b><small dir="ltr">{formatSize(file.size)}</small></span>
                <a
                  href={`/api/transfers/${inbox.code}/download?file=${encodeURIComponent(file.id)}`}
                  className="pairing-download"
                  aria-label={`دانلود ${file.name}`}
                  download={file.name}
                ><Download size={19}/></a>
              </li>
            ))}
          </ul>
          <Link className="pairing-action" href={`/r/${inbox.code}`}>مشاهدهٔ همهٔ فایل‌ها</Link>
          <button className="pairing-action" type="button" onClick={onRefresh}><RefreshCw size={16}/>دریافت جدید</button>
        </div>
      ) : error ? (
        <div className="pairing-placeholder">
          <p role="alert">{error}</p>
          <button className="pairing-action" type="button" onClick={onRefresh}><RefreshCw size={16}/>تلاش مجدد</button>
        </div>
      ) : (
        <>
          <div className="pairing-qr">
            {url ? <QRImage value={url} size={168}/> : <LoaderCircle size={28} className="spin" aria-hidden="true"/>}
          </div>
          <div className="pairing-code-label"><ScanLine size={15}/>کد اتصال</div>
          <div className="connection-code pairing-code">
            <b dir="ltr">{inbox?.code ?? "••••••"}</b>
            <button className="pairing-icon-button" type="button" disabled={!inbox} onClick={() => inbox && onCopy(inbox.code)} aria-label="کپی کد اتصال"><Copy size={17}/></button>
          </div>
          <div className="pairing-actions">
            <button className="pairing-action" type="button" disabled={!url} onClick={() => onCopy(url)}><Link2 size={17}/>کپی لینک اتصال</button>
            <button className="pairing-icon-button" type="button" disabled={!inbox} onClick={onRefresh} aria-label="ساخت کد اتصال جدید" title="کد اتصال جدید"><RefreshCw size={17}/></button>
          </div>
        </>
      )}
    </section>
  );
}
