export const MAX_TRANSFER_SIZE = 2 * 1024 * 1024 * 1024;
export const MAX_FILE_COUNT = 100;

export type TransferFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
};

export type Transfer = {
  id: string;
  code: string;
  kind: string;
  status: string;
  textContent: string | null;
  totalSize: number;
  fileCount: number;
  downloads: number;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  isOwner?: boolean;
  files: TransferFile[];
};

export function formatSize(bytes: number): string {
  if (bytes === 0) return "۰ بایت";
  if (bytes < 1024) return `${bytes.toLocaleString("fa-IR")} بایت`;
  const units = ["KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, 2);
  return `${(bytes / Math.pow(1024, index + 1)).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ${units[index]}`;
}

export function normalizeCode(value: string): string {
  return value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/\D/g, "").slice(0, 6);
}

/** Persian/Arabic digits → Latin, so phone input works with any keyboard layout. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

/** Canonical form of an Iranian mobile number: 09xxxxxxxxx. */
export function normalizePhone(value: string): string {
  const digits = toLatinDigits(value).replace(/\D/g, "");

  if (digits.startsWith("0098")) return `0${digits.slice(4)}`;
  if (digits.startsWith("98") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("9")) return `0${digits}`;

  return digits;
}

export function isValidIranMobile(value: string): boolean {
  return /^09\d{9}$/.test(value);
}

export function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "همین الان";
  if (minutes < 60) return `${minutes.toLocaleString("fa-IR")} دقیقه پیش`;
  if (minutes < 1440) return `${Math.floor(minutes / 60).toLocaleString("fa-IR")} ساعت پیش`;
  return new Date(value).toLocaleDateString("fa-IR", { month: "short", day: "numeric" });
}
