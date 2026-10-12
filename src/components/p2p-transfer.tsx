"use client";

import { useEffect, useRef, useState } from "react";
import { FastPeer, formatBytes, formatSpeed, type FileMeta, type PeerPhase, type Progress, type Role } from "@/lib/p2p-fast";
import { api, createTransfer } from "@/lib/client";


const PHASE_TEXT: Record<PeerPhase, string> = {
  idle: "آماده شروع",
  waiting: "منتظر گیرنده… کد را به گیرنده بدهید",
  requested: "گیرنده درخواست اتصال داد — تأیید کنید",
  accepted: "تأیید شد؛ در حال برقراری اتصال مستقیم",
  connecting: "در حال مذاکره اتصال مستقیم (WebRTC)…",
  connected: "اتصال مستقیم برقرار است ✓",
  transferring: "در حال انتقال…",
  done: "انتقال کامل شد ✓",
  failed: "اتصال ناموفق",
  closed: "اتصال بسته شد",
};

function toEn(s: string) {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  return s.split("").map((c) => (fa.indexOf(c) >= 0 ? String(fa.indexOf(c)) : c)).join("").replace(/\D/g, "").slice(0, 6);
}

export default function P2PTransfer() {
  const [role, setRole] = useState<Role | null>(null);
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<PeerPhase>("idle");
  const [detail, setDetail] = useState("");
  const [network, setNetwork] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [incoming, setIncoming] = useState<FileMeta[]>([]);
  const [ready, setReady] = useState<{ meta: FileMeta; url?: string }[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const peer = useRef<FastPeer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => peer.current?.close(), []);
  useEffect(() => {
    if (phase !== "transferring") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  function makePeer(c: string, r: Role) {
    peer.current?.close();
    const p = new FastPeer(c, r, {
      onPhase: (ph, d) => { setPhase(ph); setDetail(d || ""); },
      onLog: (l) => setLogs((prev) => [...prev.slice(-30), l]),
      onProgress: setProgress,
      onNetwork: setNetwork,
      onIncoming: setIncoming,
      onFileReady: (meta, url) => setReady((prev) => [...prev, { meta, url }]),
      onComplete: ({ seconds, bytes, avgBps }) => setSummary(`${formatBytes(bytes)} در ${seconds.toFixed(1)} ثانیه — میانگین ${formatSpeed(avgBps)}`),
    });
    peer.current = p;
    p.start();
    return p;
  }

  async function startSender() {
  setBusy(true);
  try {
    const res = await fetch("/api/p2p", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setRole("sender");
    setCode(data.code);
    makePeer(data.code, "sender");
  } catch (e) {
    setDetail(e instanceof Error ? e.message : "خطا");
  } finally {
    setBusy(false);
  }
}

  async function joinReceiver() {
  const c = toEn(input);
  if (c.length !== 6) { setDetail("کد ۶ رقمی را وارد کنید."); return; }
  setBusy(true);
  try {
    // request first (creates the visitor cookie & registers us), then stream
    const res = await fetch(`/api/p2p/${c}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setRole("receiver");
    setCode(c);
    makePeer(c, "receiver");
    setPhase("requested");
    setDetail("منتظر تأیید فرستنده…");
  } catch (e) {
    setDetail(e instanceof Error ? e.message : "خطا");
  } finally {
    setBusy(false);
  }
}

  async function accept() {
    setBusy(true);
    try { await peer.current?.accept(); } catch (e) { setDetail(e instanceof Error ? e.message : "خطا"); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!files.length || !peer.current) return;
    setBusy(true); setReady([]); setSummary("");
    try { await peer.current.sendFiles(files); }
    catch (e) { setDetail(e instanceof Error ? e.message : "خطا در ارسال"); }
    finally { setBusy(false); }
  }

  async function receive(toDisk: boolean) {
    if (!peer.current) return;
    setBusy(true);
    try {
      if (toDisk) await peer.current.chooseDirectory(); // must be inside click
      await peer.current.acceptIncoming();
    } catch (e) { setDetail(e instanceof Error ? e.message : "خطا در آماده‌سازی دریافت"); }
    finally { setBusy(false); }
  }

  function reset() {
    peer.current?.close(); peer.current = null;
    setRole(null); setCode(""); setInput(""); setPhase("idle"); setDetail(""); setNetwork("");
    setFiles([]); setIncoming([]); setReady([]); setProgress(null); setSummary(""); setLogs([]);
  }

  const pct = progress && progress.total ? Math.min(100, (progress.bytes / progress.total) * 100) : 0;
  const totalSel = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* role picker */}
      {!role && (
      <>
    {detail && (
      <p
        role="alert"
        className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
      >
        {detail}
      </p>
    )}
        <div className="grid gap-4 sm:grid-cols-2">
          <button onClick={startSender} disabled={busy} className="rounded-2xl border border-emerald-200 bg-white p-6 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50">
            <div className="text-3xl">📤</div>
            <h3 className="mt-3 text-lg font-bold text-slate-900">می‌خواهم فایل بفرستم</h3>
            <p className="mt-1 text-sm text-slate-600">یک کد ۶ رقمی می‌گیرید و به گیرنده می‌دهید.</p>
          </button>
          <div className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm">
            <div className="text-3xl">📥</div>
            <h3 className="mt-3 text-lg font-bold text-slate-900">می‌خواهم فایل بگیرم</h3>
            <div className="mt-3 flex gap-2">
              <input dir="ltr" inputMode="numeric" value={input} onChange={(e) => setInput(toEn(e.target.value))} placeholder="کد ۶ رقمی" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center text-xl tracking-[0.3em] outline-none focus:border-sky-500" />
              <button onClick={joinReceiver} disabled={busy || input.length !== 6} className="rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white disabled:opacity-40">اتصال</button>
            </div>
          </div>
        </div>
      )}

      {role && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">{role === "sender" ? "دستگاه فرستنده" : "دستگاه گیرنده"}</p>
              <p className="text-lg font-bold text-slate-900">{PHASE_TEXT[phase]}</p>
              {detail && <p className="mt-1 text-sm text-rose-600">{detail}</p>}
            </div>
            {code && <div dir="ltr" className="rounded-xl bg-slate-900 px-5 py-2 font-mono text-3xl tracking-[0.35em] text-white">{code}</div>}
          </div>

          {/* connection status strip */}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Step on={["waiting","requested","accepted","connecting","connected","transferring","done"].includes(phase)} label="اتاق ساخته شد" />
            <Step on={["requested","accepted","connecting","connected","transferring","done"].includes(phase)} label="هر دو آنلاین" />
            <Step on={["connected","transferring","done"].includes(phase)} label="اتصال مستقیم" />
            <Step on={phase === "done"} label="انتقال کامل" />
          </div>
          {network && <p className="mt-2 text-xs text-slate-500">مسیر شبکه: <span dir="ltr">{network}</span></p>}

          {/* sender: accept request */}
          {role === "sender" && phase === "requested" && (
            <button onClick={accept} disabled={busy} className="mt-5 w-full rounded-xl bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">تأیید اتصال گیرنده</button>
          )}

          {/* sender: pick & send */}
          {role === "sender" && (phase === "connected" || phase === "transferring" || phase === "done") && (
            <div className="mt-5 space-y-3">
              <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) setFiles(Array.from(e.target.files)); e.target.value = ""; }} />
              {phase === "connected" && (
                <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFiles(Array.from(e.dataTransfer.files)); }} className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center">
                  <p className="text-slate-700">فایل‌ها را اینجا رها کنید یا</p>
                  <button onClick={() => fileInput.current?.click()} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">انتخاب فایل‌ها</button>
                  <p className="mt-2 text-xs text-slate-500">بدون محدودیت حجم — فایل‌ها هیچ‌وقت روی سرور ذخیره نمی‌شوند</p>
                </div>
              )}
              {files.length > 0 && (
                <ul className="max-h-48 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 text-sm">
                  {files.map((f, i) => <li key={i} className="flex justify-between px-3 py-2"><span className="truncate">{f.name}</span><span className="text-slate-500">{formatBytes(f.size)}</span></li>)}
                </ul>
              )}
              {phase === "connected" && files.length > 0 && (
                <button onClick={send} disabled={busy} className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">ارسال مستقیم {files.length} فایل ({formatBytes(totalSel)})</button>
              )}
            </div>
          )}

          {/* receiver: manifest -> choose how to save */}
          {role === "receiver" && incoming.length > 0 && phase === "connected" && (
            <div className="mt-5 space-y-3">
              <p className="font-semibold text-slate-800">فرستنده {incoming.length} فایل ({formatBytes(incoming.reduce((s, f) => s + f.size, 0))}) می‌فرستد:</p>
              <ul className="max-h-40 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 text-sm">
                {incoming.map((f) => <li key={f.index} className="flex justify-between px-3 py-2"><span className="truncate">{f.name}</span><span className="text-slate-500">{formatBytes(f.size)}</span></li>)}
              </ul>
              <div className="grid gap-2 sm:grid-cols-2">
                {FastPeer.canStreamToDisk && (
                  <button onClick={() => receive(true)} disabled={busy} className="rounded-xl bg-sky-600 py-3 font-bold text-white hover:bg-sky-700 disabled:opacity-50">انتخاب پوشه و ذخیره مستقیم روی دیسک ⚡</button>
                )}
                <button onClick={() => receive(false)} disabled={busy} className="rounded-xl bg-slate-800 py-3 font-bold text-white hover:bg-slate-900 disabled:opacity-50">دریافت در حافظه مرورگر</button>
              </div>
              <p className="text-xs text-slate-500">ذخیره مستقیم روی دیسک برای فایل‌های بزرگ (چند گیگابایت) توصیه می‌شود.</p>
            </div>
          )}

          {/* progress */}
          {progress && (phase === "transferring" || phase === "done") && (
            <div className="mt-5">
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-sky-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
                <div><div className="text-base font-bold text-slate-900">{pct.toFixed(0)}٪</div>{formatBytes(progress.bytes)} / {formatBytes(progress.total)}</div>
                <div><div className="text-base font-bold text-emerald-700" dir="ltr">{formatSpeed(progress.speedBps)}</div>سرعت لحظه‌ای</div>
                <div><div className="text-base font-bold text-slate-900">{progress.etaSec > 0 && phase !== "done" ? `${Math.ceil(progress.etaSec)} ث` : "—"}</div>زمان باقی‌مانده</div>
              </div>
              {summary && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-800">{summary}</p>}
            </div>
          )}

          {/* received files */}
          {ready.length > 0 && (
            <ul className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              {ready.map(({ meta, url }) => (
                <li key={meta.index} className="flex items-center justify-between px-3 py-2">
                  <span className="truncate">✓ {meta.name} <span className="text-slate-400">({formatBytes(meta.size)})</span></span>
                  {url ? <a href={url} download={meta.name} className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white">دانلود</a> : <span className="text-xs text-emerald-700">{role === "receiver" ? "روی دیسک ذخیره شد" : "تحویل داده شد"}</span>}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button onClick={reset} className="text-sm text-slate-500 underline">شروع دوباره</button>
            {logs.length > 0 && <details className="text-xs text-slate-400"><summary>جزئیات فنی</summary><pre dir="ltr" className="mt-1 max-h-32 overflow-auto text-left">{logs.join("\n")}</pre></details>}
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ on, label }: { on: boolean; label: string }) {
  return <span className={`rounded-full px-3 py-1 ${on ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400"}`}>{on ? "●" : "○"} {label}</span>;
}
