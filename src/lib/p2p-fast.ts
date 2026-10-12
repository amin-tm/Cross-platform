/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * p2p-fast.ts — high-throughput browser-to-browser file transfer over WebRTC.
 *
 * Why it is fast (compared to the classic 16KB/single-channel approach):
 *  1. Chunk size is negotiated from `pc.sctp.maxMessageSize` (up to 256 KiB)
 *     instead of a fixed 16 KiB -> ~16x fewer messages and JS round-trips.
 *  2. N parallel *unordered* reliable data channels -> no head-of-line
 *     blocking, better pipelining; chunks carry (fileIdx, chunkIdx) headers
 *     and are re-assembled by position on the receiver.
 *  3. Deep per-channel back-pressure (8 MiB high / 2 MiB low watermark) keeps
 *     the SCTP congestion window saturated; the sender never sleeps on timers.
 *  4. Sender reads with slice read-ahead; receiver streams straight to disk
 *     via File System Access API (random-position writes) when available,
 *     falling back to an in-memory index map -> no 10 MB cap, GBs are fine.
 *  5. Signaling over SSE (server pushes) instead of 2 s polling -> the link
 *     is up in well under a second.
 */

export type Role = "sender" | "receiver";
export type PeerPhase =
  | "idle" | "waiting" | "requested" | "accepted" | "connecting" | "connected"
  | "transferring" | "done" | "failed" | "closed";

export type FileMeta = { index: number; name: string; size: number; mime: string };

export type Progress = {
  bytes: number;        // bytes transferred so far (all files)
  total: number;        // total bytes
  speedBps: number;     // smoothed instantaneous speed (bytes/sec)
  avgBps: number;       // average since start
  fileIndex: number;    // current file
  fileBytes: number;    // bytes for current file
  etaSec: number;
};

export type PeerEvents = {
  onPhase?: (phase: PeerPhase, detail?: string) => void;
  onLog?: (line: string) => void;
  onProgress?: (p: Progress) => void;
  onIncoming?: (files: FileMeta[]) => void;             // receiver: manifest arrived
  onFileReady?: (file: FileMeta, blobUrl?: string) => void; // receiver: a file finished
  onComplete?: (summary: { seconds: number; bytes: number; avgBps: number }) => void;
  onNetwork?: (info: string) => void;
};

const HEADER = 8;                  // u32 fileIdx + u32 chunkIdx
const CHANNELS = 4;
const HIGH_WATER = 8 * 1024 * 1024;
const LOW_WATER = 2 * 1024 * 1024;
const MAX_CHUNK = 256 * 1024;
const SAFE_CHUNK = 64 * 1024;      // when maxMessageSize is unknown
const MIN_CHUNK = 16 * 1024;

type Sink =
  | { kind: "fs"; writable: FileSystemWritableFileStream; handle: FileSystemFileHandle }
  | { kind: "mem"; parts: Map<number, ArrayBuffer> };

type Incoming = { meta: FileMeta; sink: Sink; received: number; eof: boolean; chunkCount: number; done: boolean };

function j(data: unknown) { return JSON.stringify(data); }

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
export function formatSpeed(bps: number) {
  const mbit = (bps * 8) / 1_000_000;
  return `${formatBytes(bps)}/s (${mbit.toFixed(1)} Mbps)`;
}

export class FastPeer {
  readonly code: string;
  readonly role: Role;
  private ev: PeerEvents;
  private pc: RTCPeerConnection | null = null;
  private ctl: RTCDataChannel | null = null;
  private data: RTCDataChannel[] = [];
  private es: EventSource | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private cursor = 0;
  private started = false;
  private phase: PeerPhase = "idle";
  private closed = false;

  // receiver state
  private incoming = new Map<number, Incoming>();
  private manifest: FileMeta[] = [];
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private readyResolver: (() => void) | null = null;

  // sender state
  private ackResolvers = new Map<number, () => void>();

  // progress
  private total = 0;
  private bytes = 0;
  private startedAt = 0;
  private lastTick = { t: 0, b: 0 };
  private speed = 0;
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  constructor(code: string, role: Role, events: PeerEvents) {
    this.code = code; this.role = role; this.ev = events;
  }

  get currentPhase() { return this.phase; }

  private setPhase(p: PeerPhase, detail?: string) { this.phase = p; this.ev.onPhase?.(p, detail); }
  private log(line: string) { this.ev.onLog?.(line); }

  /* ----------------------------- signaling ----------------------------- */

  /** Opens the SSE stream; drives the whole handshake from server pushes. */
  start() {
    if (this.es) return;
    const es = new EventSource(`/api/p2p/${this.code}/signals?after=${this.cursor}`);
    this.es = es;
    es.addEventListener("status", (e) => {
      const { status } = JSON.parse((e as MessageEvent).data);
      if (status === "waiting") this.setPhase("waiting");
      if (status === "requested") this.setPhase("requested");
      if (status === "expired") this.fail("اتاق منقضی شد.");
      if (status === "closed" && this.phase !== "done") this.setPhase("closed");
      if (status === "accepted" && !this.started) void this.beginWebRTC();
    });
    es.addEventListener("signal", (e) => {
      const msg = JSON.parse((e as MessageEvent).data) as { id: number; type: string; payload: any };
      this.cursor = Math.max(this.cursor, msg.id);
      void this.onSignal(msg).catch((err) => this.fail(err?.message || "خطا در مذاکره اتصال"));
    });
    es.onerror = () => { /* EventSource auto-reconnects; cursor keeps us idempotent */ };
  }

  private async post(path: string, body: unknown) {
    const res = await fetch(`/api/p2p/${this.code}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: j(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "خطای سرور");
    return data;
  }
  async requestJoin() { await this.post("", { action: "request" }); }
  async accept() { await this.post("", { action: "accept" }); }
  private async signal(type: string, payload: unknown) { await this.post("/signals", { type, payload }); }

  private async iceServers(): Promise<RTCIceServer[]> {
    try { const r = await fetch("/api/p2p/ice", { cache: "no-store" }); return (await r.json()).iceServers; }
    catch { return [{ urls: "stun:stun.l.google.com:19302" }]; }
  }

  private async makePeer() {
    const pc = new RTCPeerConnection({ iceServers: await this.iceServers(), bundlePolicy: "max-bundle" });
    this.pc = pc;
    pc.onicecandidate = (e) => { if (e.candidate) void this.signal("candidate", e.candidate.toJSON()).catch(() => {}); };
    pc.onconnectionstatechange = () => {
      this.log(`connection: ${pc.connectionState}`);
      if (pc.connectionState === "connected") void this.inspectPath();
      if (pc.connectionState === "failed") this.fail("اتصال مستقیم برقرار نشد (احتمالاً TURN لازم است).");
      if (pc.connectionState === "disconnected" && this.phase !== "done") this.setPhase("failed", "اتصال قطع شد.");
    };
    pc.ondatachannel = (e) => this.attach(e.channel);
    return pc;
  }

  private async beginWebRTC() {
    if (this.started) return;
    this.started = true;
    this.setPhase("connecting");
    if (this.role === "sender") {
      const pc = await this.makePeer();
      // Control channel (ordered) + N unordered reliable data channels.
      this.attach(pc.createDataChannel("ctl", { ordered: true }));
      for (let i = 0; i < CHANNELS; i++) this.attach(pc.createDataChannel(`d${i}`, { ordered: false }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.signal("offer", { type: offer.type, sdp: offer.sdp });
    }
  }

  private async onSignal(msg: { type: string; payload: any }) {
    if (msg.type === "offer" && this.role === "receiver") {
      if (this.pc) return;
      this.started = true;
      this.setPhase("connecting");
      const pc = await this.makePeer();
      await pc.setRemoteDescription(msg.payload);
      await this.flushCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.signal("answer", { type: answer.type, sdp: answer.sdp });
    } else if (msg.type === "answer" && this.role === "sender" && this.pc && !this.pc.remoteDescription) {
      await this.pc.setRemoteDescription(msg.payload);
      await this.flushCandidates();
    } else if (msg.type === "candidate") {
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(msg.payload).catch(() => {});
      else this.pendingCandidates.push(msg.payload);
    }
  }
  private async flushCandidates() {
    for (const c of this.pendingCandidates.splice(0)) await this.pc!.addIceCandidate(c).catch(() => {});
  }

  private async inspectPath() {
    try {
      const stats = await this.pc!.getStats();
      let pair: any = null;
      stats.forEach((r: any) => { if (r.type === "transport" && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId); });
      if (!pair) stats.forEach((r: any) => { if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated) pair = r; });
      if (!pair) return;
      const l = stats.get(pair.localCandidateId), r = stats.get(pair.remoteCandidateId);
      const relay = l?.candidateType === "relay" || r?.candidateType === "relay";
      this.ev.onNetwork?.(`${l?.candidateType ?? "?"} → ${r?.candidateType ?? "?"}${relay ? " (از طریق TURN)" : " (مستقیم)"}`);
    } catch { /* ignore */ }
  }

  /* ----------------------------- channels ------------------------------ */

  private attach(ch: RTCDataChannel) {
    ch.binaryType = "arraybuffer";
    ch.bufferedAmountLowThreshold = LOW_WATER;
    if (ch.label === "ctl") {
      this.ctl = ch;
      ch.onmessage = (e) => this.onControl(String(e.data));
    } else {
      this.data.push(ch);
      ch.onmessage = (e) => this.onChunk(e.data as ArrayBuffer);
    }
    ch.onopen = () => this.checkOpen();
    ch.onclose = () => { if (this.phase !== "done" && this.phase !== "closed") this.setPhase("closed", "کانال بسته شد."); };
    ch.onerror = () => this.log(`channel ${ch.label} error`);
  }

  private checkOpen() {
    if (this.ctl?.readyState === "open" && this.data.length === CHANNELS && this.data.every((c) => c.readyState === "open")) {
      if (this.phase !== "connected") { this.setPhase("connected"); this.log(`chunk=${formatBytes(this.chunkSize())} channels=${CHANNELS}`); }
    }
  }

  /** Largest message we can safely send to this peer. */
  private chunkSize() {
    const max = this.pc?.sctp?.maxMessageSize;
    let size = SAFE_CHUNK;
    if (typeof max === "number" && max > 0 && Number.isFinite(max)) size = Math.min(max, MAX_CHUNK);
    else if (max === Infinity) size = MAX_CHUNK;
    size = Math.max(MIN_CHUNK, size);
    return size - HEADER;
  }

  private async waitDrain(ch: RTCDataChannel) {
    if (ch.bufferedAmount <= HIGH_WATER) return;
    await new Promise<void>((resolve) => {
      const done = () => { ch.removeEventListener("bufferedamountlow", done); clearInterval(poll); resolve(); };
      const poll = setInterval(() => { if (ch.bufferedAmount <= LOW_WATER || ch.readyState !== "open") done(); }, 20);
      ch.addEventListener("bufferedamountlow", done);
    });
  }

  /** Pick the least-loaded channel. */
  private pickChannel() {
    let best = this.data[0];
    for (const c of this.data) if (c.bufferedAmount < best.bufferedAmount) best = c;
    return best;
  }

  /* ------------------------------ progress ----------------------------- */

  private beginProgress(total: number) {
    this.total = total; this.bytes = 0; this.speed = 0;
    this.startedAt = performance.now();
    this.lastTick = { t: this.startedAt, b: 0 };
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = setInterval(() => this.emitProgress(), 200);
  }
  private emitProgress(fileIndex = -1, fileBytes = 0) {
    const now = performance.now();
    const dt = (now - this.lastTick.t) / 1000;
    if (dt >= 0.2) {
      const inst = (this.bytes - this.lastTick.b) / dt;
      this.speed = this.speed ? this.speed * 0.6 + inst * 0.4 : inst;
      this.lastTick = { t: now, b: this.bytes };
    }
    const elapsed = (now - this.startedAt) / 1000;
    const avg = elapsed > 0 ? this.bytes / elapsed : 0;
    const remain = this.total - this.bytes;
    this.ev.onProgress?.({ bytes: this.bytes, total: this.total, speedBps: this.speed, avgBps: avg, fileIndex, fileBytes, etaSec: this.speed > 0 ? remain / this.speed : 0 });
  }
  private endProgress() {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
    this.emitProgress();
    const seconds = (performance.now() - this.startedAt) / 1000;
    this.ev.onComplete?.({ seconds, bytes: this.bytes, avgBps: seconds > 0 ? this.bytes / seconds : 0 });
  }

  /* ------------------------------- sender ------------------------------ */

  async sendFiles(files: File[]) {
    if (!this.ctl || this.ctl.readyState !== "open") throw new Error("اتصال برقرار نیست.");
    const manifest: FileMeta[] = files.map((f, index) => ({ index, name: f.name, size: f.size, mime: f.type || "application/octet-stream" }));
    const chunk = this.chunkSize();
    this.setPhase("transferring");
    this.ctl.send(j({ kind: "manifest", files: manifest, chunk }));

    // Wait until receiver has prepared its sinks (e.g. chose a folder).
    await new Promise<void>((resolve) => { this.readyResolver = resolve; });
    this.beginProgress(files.reduce((s, f) => s + f.size, 0));

    for (const meta of manifest) {
      const file = files[meta.index];
      const chunkCount = Math.ceil(file.size / chunk) || 0;
      let offset = 0, idx = 0, fileBytes = 0;
      // Read-ahead: prepare next slice while the current one is being queued.
      let next: Promise<ArrayBuffer> | null = file.size ? file.slice(0, chunk).arrayBuffer() : null;
      while (next) {
        const buf = await next;
        offset += buf.byteLength;
        next = offset < file.size ? file.slice(offset, offset + chunk).arrayBuffer() : null;

        const framed = new Uint8Array(HEADER + buf.byteLength);
        const view = new DataView(framed.buffer);
        view.setUint32(0, meta.index); view.setUint32(4, idx);
        framed.set(new Uint8Array(buf), HEADER);

        const ch = this.pickChannel();
        await this.waitDrain(ch);
        if (ch.readyState !== "open") throw new Error("اتصال قطع شد.");
        ch.send(framed);
        idx += 1; fileBytes += buf.byteLength; this.bytes += buf.byteLength;
        if ((idx & 7) === 0) this.emitProgress(meta.index, fileBytes);
      }
      this.ctl.send(j({ kind: "eof", index: meta.index, chunks: chunkCount }));
      await new Promise<void>((resolve) => this.ackResolvers.set(meta.index, resolve));
      this.ev.onFileReady?.(meta);
    }
    this.ctl.send(j({ kind: "all-done" }));
    this.setPhase("done");
    this.endProgress();
  }

  /* ------------------------------ receiver ----------------------------- */

  /** Receiver may call this (inside a user gesture) to stream files to disk. */
  async chooseDirectory() {
    const picker = (window as any).showDirectoryPicker as undefined | ((o?: any) => Promise<FileSystemDirectoryHandle>);
    if (!picker) return false;
    try { this.dirHandle = await picker({ mode: "readwrite" }); return true; } catch { return false; }
  }
  static get canStreamToDisk() { return typeof window !== "undefined" && "showDirectoryPicker" in window; }

  /** Receiver confirms it is ready; sinks are created here. */
  async acceptIncoming() {
    for (const meta of this.manifest) {
      let sink: Sink;
      if (this.dirHandle) {
        const handle = await this.dirHandle.getFileHandle(uniqueName(meta.name, meta.index), { create: true });
        const writable = await handle.createWritable();
        if (meta.size) await writable.truncate(meta.size);
        sink = { kind: "fs", writable, handle };
      } else sink = { kind: "mem", parts: new Map() };
      this.incoming.set(meta.index, { meta, sink, received: 0, eof: false, chunkCount: 0, done: false });
    }
    this.beginProgress(this.manifest.reduce((s, f) => s + f.size, 0));
    this.setPhase("transferring");
    this.ctl!.send(j({ kind: "ready" }));
    // Zero-byte files finish immediately once eof arrives; handled in finalize.
  }

  private chunkBytes = 0;
  private onControl(raw: string) {
    let msg: any; try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.kind) {
      case "manifest":
        this.manifest = msg.files as FileMeta[];
        this.chunkBytes = Number(msg.chunk) || SAFE_CHUNK;
        this.ev.onIncoming?.(this.manifest);
        break;
      case "ready":
        this.readyResolver?.(); this.readyResolver = null;
        break;
      case "eof": {
        const inc = this.incoming.get(msg.index);
        if (inc) { inc.eof = true; inc.chunkCount = msg.chunks; void this.maybeFinalize(inc); }
        break;
      }
      case "ack": {
        this.ackResolvers.get(msg.index)?.(); this.ackResolvers.delete(msg.index);
        break;
      }
      case "all-done":
        this.setPhase("done"); this.endProgress();
        break;
    }
  }

  private writeQueue: Promise<void> = Promise.resolve();
  private onChunk(buf: ArrayBuffer) {
    if (buf.byteLength < HEADER) return;
    const view = new DataView(buf);
    const fileIdx = view.getUint32(0), chunkIdx = view.getUint32(4);
    const inc = this.incoming.get(fileIdx);
    if (!inc || inc.done) return;
    const payload = buf.slice(HEADER);
    const position = chunkIdx * this.chunkBytes;
    if (position + payload.byteLength > inc.meta.size) { this.fail("حجم داده بیش از مقدار اعلام‌شده است."); return; }
    inc.received += payload.byteLength;
    this.bytes += payload.byteLength;
    if (inc.sink.kind === "mem") {
      inc.sink.parts.set(chunkIdx, payload);
      void this.maybeFinalize(inc);
    } else {
      const w = inc.sink.writable;
      this.writeQueue = this.writeQueue
        .then(() => w.write({ type: "write", position, data: payload }))
        .then(() => this.maybeFinalize(inc))
        .catch((e) => this.fail(`خطا در نوشتن روی دیسک: ${e?.message ?? e}`));
    }
  }

  private async maybeFinalize(inc: Incoming) {
    if (inc.done || !inc.eof || inc.received !== inc.meta.size) return;
    inc.done = true;
    let url: string | undefined;
    if (inc.sink.kind === "mem") {
      const ordered: ArrayBuffer[] = [];
      for (let i = 0; i < inc.chunkCount; i++) { const p = inc.sink.parts.get(i); if (!p) { this.fail("قطعه‌ای از فایل گم شد."); return; } ordered.push(p); }
      inc.sink.parts.clear();
      url = URL.createObjectURL(new Blob(ordered, { type: inc.meta.mime }));
    } else {
      await this.writeQueue;
      await inc.sink.writable.close();
    }
    this.ctl?.send(j({ kind: "ack", index: inc.meta.index }));
    this.ev.onFileReady?.(inc.meta, url);
  }

  /* ------------------------------- misc -------------------------------- */

  private fail(reason: string) {
    if (this.phase === "failed") return;
    this.log(reason);
    this.setPhase("failed", reason);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.es?.close(); this.es = null;
    for (const c of this.data) c.close();
    this.ctl?.close(); this.pc?.close();
    void this.post("", { action: "close" }).catch(() => {});
  }
}

function uniqueName(name: string, index: number) {
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 200) || `file-${index}`;
  return safe;
}
