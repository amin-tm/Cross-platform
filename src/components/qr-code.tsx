"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";

export default function QRImage({ value, size = 142 }: { value: string; size?: number }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    if (!value) return;
    QRCode.toDataURL(value, { width: 360, margin: 1, errorCorrectionLevel: "M", color: { dark: "#252843", light: "#ffffff" } }).then((url) => { if (active) setSource(url); }).catch(() => { if (active) setSource(""); });
    return () => { active = false; };
  }, [value]);
  return <div className="qr-image" style={{ width: size, height: size }}>{source ? <Image src={source} unoptimized width={size} height={size} alt="کد QR اتصال؛ با دوربین گوشی اسکن کنید"/> : <div className="qr-placeholder"><QrCode size={size * .55} strokeWidth={1}/><span>در حال ساخت کد…</span></div>}</div>;
}
