"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpLeft, Check, Copy, FileUp, Phone, X } from "lucide-react";
import { Brand } from "@/components/ui";
import { copyText } from "@/lib/client";
import "./contact-popup.css";

const channels = [
  { name: "بله", key: "bale", href: "https://ble.ir/typenikbakht" },
  { name: "ایتا", key: "eitaa", href: "https://eitaa.com/typenikbakht" },
  { name: "روبیکا", key: "rubika", href: "https://rubika.ir/typenikbakht" },
  { name: "تلگرام", key: "telegram", href: "https://t.me/typenikbakht" },
] as const;

export default function ContactPopup({ onClose, onUpload }: { onClose: () => void; onUpload: () => void }) {
  const [copied, setCopied] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    card.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab" || !card.current) return;
      const items = card.current.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)");
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyPhone() {
    try { await copyText("09033888779"); setCopied(true); }
    catch { setCopied(false); }
  }

  return (
    <div className="cp-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="cp-card" ref={card} role="dialog" aria-modal="true" aria-labelledby="cp-title" tabIndex={-1}>
        <div className="cp-top">
          <Brand compact />
          <button className="cp-close" onClick={onClose} aria-label="بستن پنجره" type="button"><X size={19} /></button>
        </div>

        <div className="cp-heading">
          <span className="cp-kicker"><i /> راه‌های ارتباط با من</span>
          <h2 id="cp-title">کجا در ارتباط باشیم؟</h2>
        </div>

        <div className="cp-channels">
          {channels.map((channel) => (
            <a className={`cp-channel cp-${channel.key}`} href={channel.href} key={channel.key} target="_blank" rel="noopener noreferrer" aria-label={`ورود به ${channel.name}، آیدی typenikbakht`}>
              <span className="cp-channel-icon"><Image src={`/messengers/${channel.key}.svg`} alt="" width={34} height={34} unoptimized /></span>
              <span className="cp-channel-text"><strong>{channel.name}</strong><span dir="ltr">@typenikbakht</span></span>
              <ArrowUpLeft className="cp-channel-arrow" size={16} strokeWidth={1.8} aria-hidden="true" />
            </a>
          ))}
        </div>

        <div className="cp-phone">
          <span className="cp-phone-label"><span className="cp-phone-icon"><Phone size={16} strokeWidth={1.9} /></span>شماره موبایل</span>
          <span className="cp-phone-value"><b dir="ltr">0903 388 8779</b><button className="cp-copy" onClick={copyPhone} type="button" aria-label={copied ? "شماره کپی شد" : "کپی شماره موبایل"} title={copied ? "کپی شد" : "کپی شماره"}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></span>
        </div>

        <div className="cp-footer">
          <span className="cp-footer-text">یا همین‌جا فایلت را بفرست</span>
          <button className="cp-upload" onClick={onUpload} type="button">
            <span className="cp-upload-icon"><FileUp size={18} strokeWidth={1.9} /></span>
            <span>آپلود فایل در همین سایت</span>
            <ArrowLeft className="cp-upload-arrow" size={18} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </div>
  );
}
