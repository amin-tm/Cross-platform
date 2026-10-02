"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpLeft, Check, Copy, FileUp, LoaderCircle, LockKeyhole, Phone, ShieldCheck, X } from "lucide-react";
import { Brand } from "@/components/ui";
import { api, copyText } from "@/lib/client";
import { isValidIranMobile, normalizePhone, toLatinDigits } from "@/lib/shared";
import "./contact-popup.css";

const channels = [
  { name: "بله", key: "bale", href: "https://ble.ir/typenikbakht" },
  { name: "ایتا", key: "eitaa", href: "https://eitaa.com/typenikbakht" },
  { name: "روبیکا", key: "rubika", href: "https://rubika.ir/typenikbakht" },
  { name: "تلگرام", key: "telegram", href: "https://t.me/typenikbakht" },
] as const;

const LEAD_KEY = "pol_lead_phone";

async function saveLead(phone: string) {
  return api<{ ok: true; phone: string; visits: number }>("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
}

export default function ContactPopup({ onClose, onUpload }: { onClose: () => void; onUpload: () => void }) {
  // `ready` keeps the first paint neutral until the saved number is read, so a
  // returning visitor never sees the phone form flash before the links appear.
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<"gate" | "links">("gate");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [gateError, setGateError] = useState("");
  const [copied, setCopied] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  // Until the phone number is stored there is no way out: no close button, no Escape,
  // no click-outside. The dialog itself is the only reachable thing on the page.
  const locked = step === "gate";

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (card.current?.querySelector<HTMLElement>("[data-initial-focus]") ?? card.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (!locked) onClose(); return; }
      if (event.key !== "Tab" || !card.current) return;
      const items = card.current.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input");
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
  }, [onClose, locked]);

  // A returning visitor on this browser already gave their number, so the gate is
  // skipped and nothing is sent again — the number is already in the database.
  useEffect(() => {
    try {
      const saved = normalizePhone(localStorage.getItem(LEAD_KEY) || "");
      if (isValidIranMobile(saved)) {
        setPhone(saved);
        setStep("links");
      }
    } catch { /* storage unavailable */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function submitPhone(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    if (!isValidIranMobile(normalized)) {
      setGateError("شمارهٔ موبایل را کامل وارد کن، مثلاً ۰۹۱۲۳۴۵۶۷۸۹");
      return;
    }
    setSaving(true);
    setGateError("");
    try {
      await saveLead(normalized);
      setPhone(normalized);
      try { localStorage.setItem(LEAD_KEY, normalized); } catch { /* storage unavailable */ }
      setStep("links");
    } catch (cause) {
      setGateError(cause instanceof Error ? cause.message : "ثبت شماره ممکن نشد. دوباره تلاش کن.");
    } finally {
      setSaving(false);
    }
  }

  async function copyPhone() {
    try { await copyText("09033888779"); setCopied(true); }
    catch { setCopied(false); }
  }

  return (
    <div className="cp-backdrop" onMouseDown={(event) => { if (!locked && event.target === event.currentTarget) onClose(); }}>
      <div className="cp-card" ref={card} role="dialog" aria-modal="true" aria-labelledby="cp-title" tabIndex={-1}>
        <div className="cp-top">
          <Brand compact />
          {!locked && <button className="cp-close" onClick={onClose} aria-label="بستن پنجره" type="button"><X size={19} /></button>}
        </div>

        {!ready ? (
          <div className="cp-boot" aria-hidden="true"><LoaderCircle size={22} className="spin" /></div>
        ) : step === "gate" ? (
          <form className="cp-gate" onSubmit={submitPhone}>
            <div className="cp-gate-heading">
              <span className="cp-kicker"><i /> برای ورود</span>
              <h2 id="cp-title">شمارهٔ موبایلت را بگذار</h2>
              <p>برای ورود به برنامه، اول شماره‌ات را ثبت کن. بعد راه‌های ارتباط و ارسال فایل باز می‌شود.</p>
            </div>

            <label className="cp-gate-label" htmlFor="cp-phone">شمارهٔ موبایل</label>
            <div className={`cp-gate-field${gateError ? " has-error" : ""}`}>
              <span className="cp-gate-field-icon"><Phone size={17} strokeWidth={1.9} /></span>
              <input
                id="cp-phone"
                className="cp-gate-input"
                data-initial-focus
                value={phone}
                dir="ltr"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="09123456789"
                maxLength={14}
                disabled={saving}
                onChange={(event) => { setPhone(toLatinDigits(event.target.value).replace(/[^\d+\s-]/g, "").slice(0, 14)); if (gateError) setGateError(""); }}
              />
            </div>

            {gateError && <p className="cp-gate-error" role="alert">{gateError}</p>}

            <button className="cp-gate-submit" type="submit" disabled={saving}>
              {saving ? <LoaderCircle size={18} className="spin" /> : <ArrowLeft size={18} strokeWidth={2} />}
              <span>{saving ? "در حال ثبت…" : "ثبت شماره و ورود"}</span>
            </button>

            <p className="cp-gate-note"><ShieldCheck size={14} strokeWidth={1.8} /> شماره‌ات فقط نزد ما می‌ماند و به کسی نشان داده نمی‌شود.</p>
          </form>
        ) : (
          <div className="cp-links">
            <div className="cp-heading">
              <span className="cp-kicker"><i /> راه‌های ارتباط با من</span>
              <h2 id="cp-title">کجا در ارتباط باشیم؟</h2>
            </div>

            <div className="cp-channels">
              {channels.map((channel) => (
                <a className={`cp-channel cp-${channel.key}`} href={channel.href} key={channel.key} target="_blank" rel="noopener noreferrer" aria-label={`ورود به ${channel.name}، آیدی typenikbakht`}>
                  <span className="cp-channel-icon"><Image src={`/messengers/${channel.key}.svg`} alt="" width={34} height={34} unoptimized priority /></span>
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
        )}

        <p className="cp-registered"><LockKeyhole size={12} strokeWidth={1.9} />{step === "gate" ? "بدون عضویت و بدون هزینه" : `ثبت‌شده با ${phone || "شمارهٔ شما"}`}</p>
      </div>
    </div>
  );
}
