"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, LoaderCircle, Send } from "lucide-react";
import { api, copyText } from "@/lib/client";
import type { Transfer } from "@/lib/shared";

export default function TextTransfer() {
  const [text, setText] = useState("");
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = text.trim();
    if (!value || busy) return;

    setBusy(true);
    setError("");

    try {
      const result = await api<Transfer>("/api/transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: "send",
          textContent: value,
        }),
      });

      setTransfer(result);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "ارسال متن انجام نشد."
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!transfer) return;

    try {
      await copyText(transfer.code);
      setCopied(true);
    } catch {
      setError("کپی کد انجام نشد.");
    }
  }

  function reset() {
    setText("");
    setTransfer(null);
    setCopied(false);
    setError("");
  }

  if (transfer) {
    return (
      <div style={{ textAlign: "center", padding: 20 }}>
        <h3>متن آماده دریافت است</h3>
        <p>این کد را در دستگاه دیگر وارد کنید.</p>

        <h1
          dir="ltr"
          style={{
            fontSize: 36,
            letterSpacing: 6,
            margin: "24px 0",
          }}
        >
          {transfer.code}
        </h1>

        <button
          className="button button-primary"
          onClick={copyCode}
        >
          {copied ? <Check size={17} /> : <Copy size={17} />}
          {copied ? "کپی شد" : "کپی کد"}
        </button>

        <p style={{ marginTop: 16 }}>
          اعتبار کد: ۲۴ ساعت
        </p>

        <button
          className="button button-outline"
          onClick={reset}
          style={{ marginTop: 12 }}
        >
          ارسال متن جدید
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <label className="form-label" htmlFor="transfer-text">
        متن موردنظر
      </label>

      <textarea
        id="transfer-text"
        className="form-textarea"
        rows={8}
        maxLength={20000}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="متن خود را اینجا بنویسید یا جای‌گذاری کنید..."
        dir="auto"
        required
      />

      <div className="character-count">
        {text.length.toLocaleString("fa-IR")} / ۲۰۰۰۰
      </div>

      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        className="button button-primary full-width"
        disabled={busy || !text.trim()}
      >
        {busy ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Send size={17} />
        )}
        {busy ? "در حال آماده‌سازی..." : "ایجاد کد ارسال متن"}
      </button>
    </form>
  );
}
