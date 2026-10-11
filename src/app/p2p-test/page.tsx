"use client";

import { useEffect, useRef, useState } from "react";
import { api, createTransfer } from "@/lib/client";
import { normalizeCode } from "@/lib/shared";

type Status = { status: string; role?: "sender" | "receiver" };
type Signal = { id: number; type: "offer" | "answer" | "candidate"; payload: any };
type Signals = { messages: Signal[] };
type FileHeader = { name: string; size: number; mime: string };

export default function P2PTest() {
  const [role, setRole] = useState<"sender" | "receiver">("sender");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("برای شروع، نقش دستگاه را انتخاب کنید.");
  const [phase, setPhase] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRef = useRef(0);
  const codeRef = useRef("");
  const roleRef = useRef<"sender" | "receiver">("sender");
  const startedRef = useRef(false);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const receiveRef = useRef<{ header: FileHeader; chunks: BlobPart[]; size: number } | null>(null);
  const downloadRef = useRef<string | null>(null);

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }
  function cleanup() {
    stopPolling();
    dcRef.current?.close();
    pcRef.current?.close();
    dcRef.current = null;
    pcRef.current = null;
    pendingCandidates.current = [];
    startedRef.current = false;
    lastRef.current = 0;
    receiveRef.current = null;
  }
  useEffect(() => () => {
    stopPolling();
    dcRef.current?.close();
    pcRef.current?.close();
    if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
  }, []);

  async function action(name: "start" | "request" | "accept", current = codeRef.current) {
    return api<Status>(`/api/p2p/${current}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: name }),
    });
  }
  async function signal(type: Signal["type"], payload: object) {
    await api(`/api/p2p/${codeRef.current}/signals`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    });
  }
  function attachChannel(channel: RTCDataChannel) {
    dcRef.current = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = 256 * 1024;
    channel.onopen = () => { setPhase("connected"); setStatus("اتصال مستقیم برقرار شد. آماده ارسال فایل."); };
    channel.onclose = () => { setPhase("disconnected"); setStatus("کانال ارتباط بسته شد."); };
    channel.onerror = () => setStatus("خطا در کانال انتقال.");
    channel.onmessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.kind === "file" && typeof msg.name === "string" && Number.isSafeInteger(msg.size) && msg.size >= 0 && msg.size <= 10 * 1024 * 1024) {
            receiveRef.current = { header: { name: msg.name, size: msg.size, mime: String(msg.mime || "application/octet-stream") }, chunks: [], size: 0 };
            setProgress(0);
            setStatus(`در حال دریافت: ${msg.name}`);
          } else if (msg.kind === "done" && receiveRef.current) {
            const received = receiveRef.current;
            receiveRef.current = null;
            if (received.size !== received.header.size) { setStatus("اندازه فایل دریافتی صحیح نیست."); return; }
            const blob = new Blob(received.chunks, { type: received.header.mime });
            if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
            const url = URL.createObjectURL(blob);
            downloadRef.current = url;
            setDownload({ url, name: received.header.name });
            setProgress(100);
            setStatus("فایل کامل دریافت شد. برای ذخیره، روی دانلود بزنید.");
            channel.send(JSON.stringify({ kind: "ack" }));
          } else if (msg.kind === "ack") {
            setStatus("گیرنده دریافت کامل فایل را تأیید کرد.");
          }
        } catch { setStatus("پیام دریافت‌شده نامعتبر بود."); }
        return;
      }
      const current = receiveRef.current;
      if (!current || !(event.data instanceof ArrayBuffer)) return;
      current.size += event.data.byteLength;
      if (current.size > current.header.size) { receiveRef.current = null; setStatus("حجم داده بیش از مقدار اعلام‌شده است."); return; }
      current.chunks.push(event.data);
      setProgress(current.header.size ? Math.round(current.size / current.header.size * 100) : 100);
    };
  }
  function makePeer() {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
    pcRef.current = pc;
    pc.onicecandidate = (event) => {
      if (event.candidate) void signal("candidate", event.candidate.toJSON()).catch((e) => setStatus(`ارسال ICE ناموفق: ${e.message}`));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setStatus("اتصال مستقیم قطع شد یا برقرار نشد؛ ممکن است TURN لازم باشد.");
      }
    };
    pc.ondatachannel = (event) => attachChannel(event.channel);
    return pc;
  }
  async function applyCandidates(pc: RTCPeerConnection) {
    for (const candidate of pendingCandidates.current.splice(0)) await pc.addIceCandidate(candidate);
  }
  async function handleSignals() {
    const { messages } = await api<Signals>(`/api/p2p/${codeRef.current}/signals?after=${lastRef.current}`);
    for (const message of messages) {
      lastRef.current = Math.max(lastRef.current, Number(message.id));
      if (message.type === "offer" && roleRef.current === "receiver" && !pcRef.current) {
        const pc = makePeer();
        await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
        await applyCandidates(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await signal("answer", { type: answer.type, sdp: answer.sdp });
        setStatus("پاسخ اتصال ارسال شد؛ منتظر برقراری کانال هستیم.");
      } else if (message.type === "answer" && roleRef.current === "sender" && pcRef.current && !pcRef.current.remoteDescription) {
        await pcRef.current.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
        await applyCandidates(pcRef.current);
      } else if (message.type === "candidate") {
        const pc = pcRef.current;
        if (pc?.remoteDescription) await pc.addIceCandidate(message.payload as RTCIceCandidateInit);
        else pendingCandidates.current.push(message.payload as RTCIceCandidateInit);
      }
    }
  }
  async function startWebRTC() {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("connecting");
    setStatus("در حال مذاکره اتصال مستقیم...");
    if (roleRef.current === "sender") {
      const pc = makePeer();
      attachChannel(pc.createDataChannel("pol-files", { ordered: true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await signal("offer", { type: offer.type, sdp: offer.sdp });
    }
  }
  async function tick() {
    const result = await api<Status>(`/api/p2p/${codeRef.current}`);
    if (result.status === "requested" && roleRef.current === "sender") {
      setPhase("requested"); setStatus("گیرنده درخواست اتصال داده است؛ روی تأیید بزنید.");
    }
    if (result.status === "accepted") {
      if (!startedRef.current) await startWebRTC();
      await handleSignals();
    }
  }
  function beginPolling() {
    stopPolling();
    let running = false;
    pollRef.current = setInterval(() => {
      if (running) return;
      running = true;
      void tick().catch((e) => setStatus(`خطای ارتباط: ${e.message}`)).finally(() => { running = false; });
    }, 2000);
  }
  async function startSender() {
    setBusy(true); cleanup();
    try {
      const transfer = await createTransfer("send", true);
      codeRef.current = transfer.code; setCode(transfer.code);
      roleRef.current = "sender";
      await action("start", transfer.code);
      setPhase("waiting"); setStatus("کد را در دستگاه گیرنده وارد کنید.");
      beginPolling();
    } catch (e) { setStatus(e instanceof Error ? e.message : "خطا در ساخت اتصال"); }
    finally { setBusy(false); }
  }
  async function joinReceiver() {
    const value = normalizeCode(code);
    if (value.length !== 6) { setStatus("کد باید شش رقم باشد."); return; }
    setBusy(true); cleanup();
    codeRef.current = value; roleRef.current = "receiver";
    try {
      await api(`/api/transfers/${value}`);
      await action("request", value);
      setPhase("waiting"); setStatus("درخواست ارسال شد؛ منتظر تأیید فرستنده باشید.");
      beginPolling();
    } catch (e) { setStatus(e instanceof Error ? e.message : "خطا در درخواست اتصال"); }
    finally { setBusy(false); }
  }
  async function accept() {
    setBusy(true);
    try { await action("accept"); await startWebRTC(); setPhase("connecting"); }
    catch (e) { setStatus(e instanceof Error ? e.message : "تأیید ناموفق بود"); }
    finally { setBusy(false); }
  }
  async function sendFile() {
    const channel = dcRef.current;
    if (!file || !channel || channel.readyState !== "open") return;
    if (file.size > 10 * 1024 * 1024) { setStatus("در این نسخه آزمایشی سقف فایل ۱۰ مگابایت است."); return; }
    setBusy(true); setProgress(0);
    try {
      channel.send(JSON.stringify({ kind: "file", name: file.name, size: file.size, mime: file.type }));
      let offset = 0;
      while (offset < file.size) {
        if (channel.readyState !== "open") throw new Error("اتصال قطع شد.");
        if (channel.bufferedAmount > 512 * 1024) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 150);
            channel.addEventListener("bufferedamountlow", () => { clearTimeout(timeout); resolve(); }, { once: true });
          });
          continue;
        }
        const chunk = await file.slice(offset, offset + 16 * 1024).arrayBuffer();
        channel.send(chunk);
        offset += chunk.byteLength;
        setProgress(Math.round(offset / file.size * 100));
      }
      while (channel.readyState === "open" && channel.bufferedAmount > 0) await new Promise((resolve) => setTimeout(resolve, 100));
      if (channel.readyState !== "open") throw new Error("اتصال قطع شد.");
      channel.send(JSON.stringify({ kind: "done" }));
      setStatus("ارسال تمام شد؛ منتظر تأیید دریافت گیرنده باشید.");
    } catch (e) { setStatus(e instanceof Error ? e.message : "خطا در ارسال فایل"); }
    finally { setBusy(false); }
  }
  function switchRole(next: "sender" | "receiver") {
    cleanup(); roleRef.current = next; codeRef.current = "";
    setRole(next); setCode(""); setPhase("idle"); setProgress(0); setFile(null);
    setStatus("آماده شروع آزمایش.");
  }

  return <main dir="rtl" style={{ maxWidth: 650, margin: "40px auto", padding: 20, fontFamily: "inherit", lineHeight: 1.9 }}>
    <h1>آزمایش انتقال مستقیم پُل</h1>
    <p>این صفحه مستقل از انتقال معمولی است. برای آزمایش، در دو دستگاه جداگانه بازش کنید.</p>
    <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
      <button type="button" className="button button-primary" onClick={() => switchRole("sender")}>فرستنده</button>
      <button type="button" className="button button-primary" onClick={() => switchRole("receiver")}>گیرنده</button>
    </div>
    <h2>{role === "sender" ? "دستگاه فرستنده" : "دستگاه گیرنده"}</h2>
    {role === "sender" ? <>
      <button type="button" className="button button-primary" onClick={startSender} disabled={busy || phase !== "idle"}>ساخت کد آزمایشی</button>
      {code && <p>کد اتصال: <strong dir="ltr" style={{ fontSize: 28, letterSpacing: 3 }}>{code}</strong></p>}
      {phase === "requested" && <button type="button" className="button button-primary" disabled={busy} onClick={accept}>تأیید اتصال گیرنده</button>}
      {phase === "connected" && <div style={{ marginTop: 20 }}>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <p>حداکثر ۱۰ مگابایت برای تست اولیه</p>
        <button type="button" className="button button-primary" onClick={sendFile} disabled={busy || !file}>ارسال مستقیم فایل</button>
      </div>}
    </> : <>
      <input aria-label="کد اتصال" inputMode="numeric" dir="ltr" placeholder="کد ۶ رقمی" value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} disabled={phase !== "idle"} />
      <button type="button" className="button button-primary" onClick={joinReceiver} disabled={busy || phase !== "idle"}>درخواست اتصال</button>
      {download && <p><a href={download.url} download={download.name}>دانلود فایل دریافتی: {download.name}</a></p>}
    </>}
    <p role="status"><strong>وضعیت:</strong> {status}</p>
    {(busy || progress > 0) && <p>پیشرفت: {progress.toLocaleString("fa-IR")}٪</p>}
    <p style={{ opacity: 0.7, fontSize: 13 }}>برای شروع دوباره، صفحه را تازه‌سازی کنید. برای شبکه‌های دارای NAT سخت‌گیرانه، سرور TURN لازم می‌شود.</p>
  </main>;
}
