#!/usr/bin/env node
// =============================================================================
//  نصب‌کنندهٔ خودکار «پاپ‌آپ راه‌های ارتباط + دریافت شمارهٔ موبایل»
//
//  روش استفاده: این فایل را در ریشهٔ پروژه بگذار و اجرا کن:
//      node apply-contact-popup.mjs
//
//  - اجرای چندباره بی‌خطر است؛ هر تغییری که قبلاً اعمال شده دوباره اعمال نمی‌شود.
//  - هیچ فایلی حذف یا بازنویسیِ کور نمی‌شود؛ قبل از ویرایش، نسخهٔ پشتیبان می‌گیرد.
//  - اگر جایی را نشناسد، دقیقاً می‌گوید چه چیزی را کجا دستی اضافه کنی.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const done = [];
const skipped = [];
const manual = [];
let backupDir = null;

const C = { ok: "\x1b[32m", warn: "\x1b[33m", err: "\x1b[31m", dim: "\x1b[2m", bold: "\x1b[1m", off: "\x1b[0m" };
const log = (msg) => console.log(msg);

function fail(message) {
  console.error(`\n${C.err}✖ ${message}${C.off}\n`);
  process.exit(1);
}

// --- sanity: are we really inside the project? ---------------------------------
if (!existsSync(join(root, "package.json")) || !existsSync(join(root, "src", "components", "transfer-app.tsx"))) {
  fail("این اسکریپت را باید در ریشهٔ پروژهٔ پُل اجرا کنی (جایی که package.json و src/components/transfer-app.tsx هست).");
}

function backup(relative) {
  if (!backupDir) {
    backupDir = join(root, ".contact-popup-backup");
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  }
  const target = join(backupDir, relative.replace(/[\\/]/g, "__"));
  if (!existsSync(target)) copyFileSync(join(root, relative), target);
}

function writeNew(relative, base64) {
  const full = join(root, relative);
  const body = Buffer.from(base64, "base64").toString("utf8");
  if (existsSync(full) && readFileSync(full, "utf8") === body) {
    skipped.push(`${relative} (از قبل درست است)`);
    return;
  }
  const updating = existsSync(full);
  if (updating) backup(relative);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
  done.push(updating ? `${relative}  ← به‌روزرسانی شد` : `${relative}  ← ساخته شد`);
}

// Anchored edit: find a unique marker and insert before/after it.
function edit(relative, { marker, insert, where = "after", already, label }) {
  const full = join(root, relative);
  if (!existsSync(full)) {
    manual.push(`${relative} پیدا نشد. «${label}» را دستی اضافه کن.`);
    return;
  }
  let text = readFileSync(full, "utf8");
  if (already(text)) {
    skipped.push(`${relative} → ${label} (از قبل اعمال شده)`);
    return;
  }
  const at = text.indexOf(marker);
  if (at === -1) {
    manual.push(`در ${relative} این نشانه پیدا نشد:\n      ${marker.split("\n")[0].trim()}\n    پس «${label}» را دستی اضافه کن.`);
    return;
  }
  if (text.indexOf(marker, at + marker.length) !== -1) {
    manual.push(`در ${relative} نشانهٔ «${label}» بیش از یک بار تکرار شده؛ برای جلوگیری از اشتباه، دستی اضافه‌اش کن.`);
    return;
  }
  backup(relative);
  text = where === "after"
    ? text.slice(0, at + marker.length) + insert + text.slice(at + marker.length)
    : text.slice(0, at) + insert + text.slice(at);
  writeFileSync(full, text);
  done.push(`${relative} → ${label}`);
}

log(`\n${C.bold}نصب پاپ‌آپ راه‌های ارتباط${C.off}\n`);

// --- 1) فایل‌های جدید -----------------------------------------------------------
const NEW_FILES = {
  "src/components/contact-popup.tsx": "InVzZSBjbGllbnQiOwoKaW1wb3J0IEltYWdlIGZyb20gIm5leHQvaW1hZ2UiOwppbXBvcnQgeyB1c2VFZmZlY3QsIHVzZVJlZiwgdXNlU3RhdGUgfSBmcm9tICJyZWFjdCI7CmltcG9ydCB7IEFycm93TGVmdCwgQXJyb3dVcExlZnQsIENoZWNrLCBDb3B5LCBGaWxlVXAsIExvYWRlckNpcmNsZSwgTG9ja0tleWhvbGUsIFBob25lLCBTaGllbGRDaGVjaywgWCB9IGZyb20gImx1Y2lkZS1yZWFjdCI7CmltcG9ydCB7IEJyYW5kIH0gZnJvbSAiQC9jb21wb25lbnRzL3VpIjsKaW1wb3J0IHsgYXBpLCBjb3B5VGV4dCB9IGZyb20gIkAvbGliL2NsaWVudCI7CmltcG9ydCB7IGlzVmFsaWRJcmFuTW9iaWxlLCBub3JtYWxpemVQaG9uZSwgdG9MYXRpbkRpZ2l0cyB9IGZyb20gIkAvbGliL3NoYXJlZCI7CmltcG9ydCAiLi9jb250YWN0LXBvcHVwLmNzcyI7Cgpjb25zdCBjaGFubmVscyA9IFsKICB7IG5hbWU6ICLYqNmE2YciLCBrZXk6ICJiYWxlIiwgaHJlZjogImh0dHBzOi8vYmxlLmlyL3R5cGVuaWtiYWtodCIgfSwKICB7IG5hbWU6ICLYp9uM2KrYpyIsIGtleTogImVpdGFhIiwgaHJlZjogImh0dHBzOi8vZWl0YWEuY29tL3R5cGVuaWtiYWtodCIgfSwKICB7IG5hbWU6ICLYsdmI2KjbjNqp2KciLCBrZXk6ICJydWJpa2EiLCBocmVmOiAiaHR0cHM6Ly9ydWJpa2EuaXIvdHlwZW5pa2Jha2h0IiB9LAogIHsgbmFtZTogItiq2YTar9ix2KfZhSIsIGtleTogInRlbGVncmFtIiwgaHJlZjogImh0dHBzOi8vdC5tZS90eXBlbmlrYmFraHQiIH0sCl0gYXMgY29uc3Q7Cgpjb25zdCBMRUFEX0tFWSA9ICJwb2xfbGVhZF9waG9uZSI7Cgphc3luYyBmdW5jdGlvbiBzYXZlTGVhZChwaG9uZTogc3RyaW5nKSB7CiAgcmV0dXJuIGFwaTx7IG9rOiB0cnVlOyBwaG9uZTogc3RyaW5nOyB2aXNpdHM6IG51bWJlciB9PigiL2FwaS9sZWFkcyIsIHsKICAgIG1ldGhvZDogIlBPU1QiLAogICAgaGVhZGVyczogeyAiQ29udGVudC1UeXBlIjogImFwcGxpY2F0aW9uL2pzb24iIH0sCiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHBob25lIH0pLAogIH0pOwp9CgpleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBDb250YWN0UG9wdXAoeyBvbkNsb3NlLCBvblVwbG9hZCB9OiB7IG9uQ2xvc2U6ICgpID0+IHZvaWQ7IG9uVXBsb2FkOiAoKSA9PiB2b2lkIH0pIHsKICAvLyBgcmVhZHlgIGtlZXBzIHRoZSBmaXJzdCBwYWludCBuZXV0cmFsIHVudGlsIHRoZSBzYXZlZCBudW1iZXIgaXMgcmVhZCwgc28gYQogIC8vIHJldHVybmluZyB2aXNpdG9yIG5ldmVyIHNlZXMgdGhlIHBob25lIGZvcm0gZmxhc2ggYmVmb3JlIHRoZSBsaW5rcyBhcHBlYXIuCiAgY29uc3QgW3JlYWR5LCBzZXRSZWFkeV0gPSB1c2VTdGF0ZShmYWxzZSk7CiAgY29uc3QgW3N0ZXAsIHNldFN0ZXBdID0gdXNlU3RhdGU8ImdhdGUiIHwgImxpbmtzIj4oImdhdGUiKTsKICBjb25zdCBbcGhvbmUsIHNldFBob25lXSA9IHVzZVN0YXRlKCIiKTsKICBjb25zdCBbc2F2aW5nLCBzZXRTYXZpbmddID0gdXNlU3RhdGUoZmFsc2UpOwogIGNvbnN0IFtnYXRlRXJyb3IsIHNldEdhdGVFcnJvcl0gPSB1c2VTdGF0ZSgiIik7CiAgY29uc3QgW2NvcGllZCwgc2V0Q29waWVkXSA9IHVzZVN0YXRlKGZhbHNlKTsKICBjb25zdCBjYXJkID0gdXNlUmVmPEhUTUxEaXZFbGVtZW50PihudWxsKTsKCiAgLy8gVW50aWwgdGhlIHBob25lIG51bWJlciBpcyBzdG9yZWQgdGhlcmUgaXMgbm8gd2F5IG91dDogbm8gY2xvc2UgYnV0dG9uLCBubyBFc2NhcGUsCiAgLy8gbm8gY2xpY2stb3V0c2lkZS4gVGhlIGRpYWxvZyBpdHNlbGYgaXMgdGhlIG9ubHkgcmVhY2hhYmxlIHRoaW5nIG9uIHRoZSBwYWdlLgogIGNvbnN0IGxvY2tlZCA9IHN0ZXAgPT09ICJnYXRlIjsKCiAgdXNlRWZmZWN0KCgpID0+IHsKICAgIGNvbnN0IHByZXZpb3VzID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCB8IG51bGw7CiAgICBjb25zdCBwcmV2aW91c092ZXJmbG93ID0gZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdzsKICAgIGRvY3VtZW50LmJvZHkuc3R5bGUub3ZlcmZsb3cgPSAiaGlkZGVuIjsKICAgIChjYXJkLmN1cnJlbnQ/LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCJbZGF0YS1pbml0aWFsLWZvY3VzXSIpID8/IGNhcmQuY3VycmVudCk/LmZvY3VzKCk7CiAgICBjb25zdCBvbktleSA9IChldmVudDogS2V5Ym9hcmRFdmVudCkgPT4gewogICAgICBpZiAoZXZlbnQua2V5ID09PSAiRXNjYXBlIikgeyBpZiAoIWxvY2tlZCkgb25DbG9zZSgpOyByZXR1cm47IH0KICAgICAgaWYgKGV2ZW50LmtleSAhPT0gIlRhYiIgfHwgIWNhcmQuY3VycmVudCkgcmV0dXJuOwogICAgICBjb25zdCBpdGVtcyA9IGNhcmQuY3VycmVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PigiYVtocmVmXSwgYnV0dG9uOm5vdCg6ZGlzYWJsZWQpLCBpbnB1dCIpOwogICAgICBpZiAoIWl0ZW1zLmxlbmd0aCkgcmV0dXJuOwogICAgICBjb25zdCBmaXJzdCA9IGl0ZW1zWzBdOwogICAgICBjb25zdCBsYXN0ID0gaXRlbXNbaXRlbXMubGVuZ3RoIC0gMV07CiAgICAgIGlmIChldmVudC5zaGlmdEtleSAmJiBkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBmaXJzdCkgeyBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyBsYXN0LmZvY3VzKCk7IH0KICAgICAgZWxzZSBpZiAoIWV2ZW50LnNoaWZ0S2V5ICYmIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGxhc3QpIHsgZXZlbnQucHJldmVudERlZmF1bHQoKTsgZmlyc3QuZm9jdXMoKTsgfQogICAgfTsKICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoImtleWRvd24iLCBvbktleSk7CiAgICByZXR1cm4gKCkgPT4gewogICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLm92ZXJmbG93ID0gcHJldmlvdXNPdmVyZmxvdzsKICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigia2V5ZG93biIsIG9uS2V5KTsKICAgICAgcHJldmlvdXM/LmZvY3VzPy4oKTsKICAgIH07CiAgfSwgW29uQ2xvc2UsIGxvY2tlZF0pOwoKICAvLyBBIHJldHVybmluZyB2aXNpdG9yIG9uIHRoaXMgYnJvd3NlciBhbHJlYWR5IGdhdmUgdGhlaXIgbnVtYmVyLCBzbyB0aGUgZ2F0ZSBpcwogIC8vIHNraXBwZWQgYW5kIG5vdGhpbmcgaXMgc2VudCBhZ2FpbiDigJQgdGhlIG51bWJlciBpcyBhbHJlYWR5IGluIHRoZSBkYXRhYmFzZS4KICB1c2VFZmZlY3QoKCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3Qgc2F2ZWQgPSBub3JtYWxpemVQaG9uZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbShMRUFEX0tFWSkgfHwgIiIpOwogICAgICBpZiAoaXNWYWxpZElyYW5Nb2JpbGUoc2F2ZWQpKSB7CiAgICAgICAgc2V0UGhvbmUoc2F2ZWQpOwogICAgICAgIHNldFN0ZXAoImxpbmtzIik7CiAgICAgIH0KICAgIH0gY2F0Y2ggeyAvKiBzdG9yYWdlIHVuYXZhaWxhYmxlICovIH0KICAgIHNldFJlYWR5KHRydWUpOwogIH0sIFtdKTsKCiAgdXNlRWZmZWN0KCgpID0+IHsKICAgIGlmICghY29waWVkKSByZXR1cm47CiAgICBjb25zdCB0aW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHNldENvcGllZChmYWxzZSksIDIyMDApOwogICAgcmV0dXJuICgpID0+IHdpbmRvdy5jbGVhclRpbWVvdXQodGltZXIpOwogIH0sIFtjb3BpZWRdKTsKCiAgYXN5bmMgZnVuY3Rpb24gc3VibWl0UGhvbmUoZXZlbnQ6IFJlYWN0LkZvcm1FdmVudCkgewogICAgZXZlbnQucHJldmVudERlZmF1bHQoKTsKICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQaG9uZShwaG9uZSk7CiAgICBpZiAoIWlzVmFsaWRJcmFuTW9iaWxlKG5vcm1hbGl6ZWQpKSB7CiAgICAgIHNldEdhdGVFcnJvcigi2LTZhdin2LHZh9mUINmF2YjYqNin24zZhCDYsdinINqp2KfZhdmEINmI2KfYsdivINqp2YbYjCDZhdir2YTYp9mLINuw27nbsduy27PbtNu127bbt9u427kiKTsKICAgICAgcmV0dXJuOwogICAgfQogICAgc2V0U2F2aW5nKHRydWUpOwogICAgc2V0R2F0ZUVycm9yKCIiKTsKICAgIHRyeSB7CiAgICAgIGF3YWl0IHNhdmVMZWFkKG5vcm1hbGl6ZWQpOwogICAgICBzZXRQaG9uZShub3JtYWxpemVkKTsKICAgICAgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oTEVBRF9LRVksIG5vcm1hbGl6ZWQpOyB9IGNhdGNoIHsgLyogc3RvcmFnZSB1bmF2YWlsYWJsZSAqLyB9CiAgICAgIHNldFN0ZXAoImxpbmtzIik7CiAgICB9IGNhdGNoIChjYXVzZSkgewogICAgICBzZXRHYXRlRXJyb3IoY2F1c2UgaW5zdGFuY2VvZiBFcnJvciA/IGNhdXNlLm1lc3NhZ2UgOiAi2KvYqNiqINi02YXYp9ix2Ycg2YXZhdqp2YYg2YbYtNivLiDYr9mI2KjYp9ix2Ycg2KrZhNin2LQg2qnZhi4iKTsKICAgIH0gZmluYWxseSB7CiAgICAgIHNldFNhdmluZyhmYWxzZSk7CiAgICB9CiAgfQoKICBhc3luYyBmdW5jdGlvbiBjb3B5UGhvbmUoKSB7CiAgICB0cnkgeyBhd2FpdCBjb3B5VGV4dCgiMDkwMzM4ODg3NzkiKTsgc2V0Q29waWVkKHRydWUpOyB9CiAgICBjYXRjaCB7IHNldENvcGllZChmYWxzZSk7IH0KICB9CgogIHJldHVybiAoCiAgICA8ZGl2IGNsYXNzTmFtZT0iY3AtYmFja2Ryb3AiIG9uTW91c2VEb3duPXsoZXZlbnQpID0+IHsgaWYgKCFsb2NrZWQgJiYgZXZlbnQudGFyZ2V0ID09PSBldmVudC5jdXJyZW50VGFyZ2V0KSBvbkNsb3NlKCk7IH19PgogICAgICA8ZGl2IGNsYXNzTmFtZT0iY3AtY2FyZCIgcmVmPXtjYXJkfSByb2xlPSJkaWFsb2ciIGFyaWEtbW9kYWw9InRydWUiIGFyaWEtbGFiZWxsZWRieT0iY3AtdGl0bGUiIHRhYkluZGV4PXstMX0+CiAgICAgICAgPGRpdiBjbGFzc05hbWU9ImNwLXRvcCI+CiAgICAgICAgICA8QnJhbmQgY29tcGFjdCAvPgogICAgICAgICAgeyFsb2NrZWQgJiYgPGJ1dHRvbiBjbGFzc05hbWU9ImNwLWNsb3NlIiBvbkNsaWNrPXtvbkNsb3NlfSBhcmlhLWxhYmVsPSLYqNiz2KrZhiDZvtmG2KzYsdmHIiB0eXBlPSJidXR0b24iPjxYIHNpemU9ezE5fSAvPjwvYnV0dG9uPn0KICAgICAgICA8L2Rpdj4KCiAgICAgICAgeyFyZWFkeSA/ICgKICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPSJjcC1ib290IiBhcmlhLWhpZGRlbj0idHJ1ZSI+PExvYWRlckNpcmNsZSBzaXplPXsyMn0gY2xhc3NOYW1lPSJzcGluIiAvPjwvZGl2PgogICAgICAgICkgOiBzdGVwID09PSAiZ2F0ZSIgPyAoCiAgICAgICAgICA8Zm9ybSBjbGFzc05hbWU9ImNwLWdhdGUiIG9uU3VibWl0PXtzdWJtaXRQaG9uZX0+CiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPSJjcC1nYXRlLWhlYWRpbmciPgogICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT0iY3Ata2lja2VyIj48aSAvPiDYqNix2KfbjCDZiNix2YjYrzwvc3Bhbj4KICAgICAgICAgICAgICA8aDIgaWQ9ImNwLXRpdGxlIj7YtNmF2KfYsdmH2ZQg2YXZiNio2KfbjNmE2Kog2LHYpyDYqNqv2LDYp9ixPC9oMj4KICAgICAgICAgICAgICA8cD7YqNix2KfbjCDZiNix2YjYryDYqNmHINio2LHZhtin2YXZh9iMINin2YjZhCDYtNmF2KfYsdmH4oCM2KfYqiDYsdinINir2KjYqiDaqdmGLiDYqNi52K8g2LHYp9mH4oCM2YfYp9uMINin2LHYqtio2KfYtyDZiCDYp9ix2LPYp9mEINmB2KfbjNmEINio2KfYsiDZhduM4oCM2LTZiNivLjwvcD4KICAgICAgICAgICAgPC9kaXY+CgogICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPSJjcC1nYXRlLWxhYmVsIiBodG1sRm9yPSJjcC1waG9uZSI+2LTZhdin2LHZh9mUINmF2YjYqNin24zZhDwvbGFiZWw+CiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgY3AtZ2F0ZS1maWVsZCR7Z2F0ZUVycm9yID8gIiBoYXMtZXJyb3IiIDogIiJ9YH0+CiAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPSJjcC1nYXRlLWZpZWxkLWljb24iPjxQaG9uZSBzaXplPXsxN30gc3Ryb2tlV2lkdGg9ezEuOX0gLz48L3NwYW4+CiAgICAgICAgICAgICAgPGlucHV0CiAgICAgICAgICAgICAgICBpZD0iY3AtcGhvbmUiCiAgICAgICAgICAgICAgICBjbGFzc05hbWU9ImNwLWdhdGUtaW5wdXQiCiAgICAgICAgICAgICAgICBkYXRhLWluaXRpYWwtZm9jdXMKICAgICAgICAgICAgICAgIHZhbHVlPXtwaG9uZX0KICAgICAgICAgICAgICAgIGRpcj0ibHRyIgogICAgICAgICAgICAgICAgaW5wdXRNb2RlPSJudW1lcmljIgogICAgICAgICAgICAgICAgYXV0b0NvbXBsZXRlPSJ0ZWwtbmF0aW9uYWwiCiAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj0iMDkxMjM0NTY3ODkiCiAgICAgICAgICAgICAgICBtYXhMZW5ndGg9ezE0fQogICAgICAgICAgICAgICAgZGlzYWJsZWQ9e3NhdmluZ30KICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoZXZlbnQpID0+IHsgc2V0UGhvbmUodG9MYXRpbkRpZ2l0cyhldmVudC50YXJnZXQudmFsdWUpLnJlcGxhY2UoL1teXGQrXHMtXS9nLCAiIikuc2xpY2UoMCwgMTQpKTsgaWYgKGdhdGVFcnJvcikgc2V0R2F0ZUVycm9yKCIiKTsgfX0KICAgICAgICAgICAgICAvPgogICAgICAgICAgICA8L2Rpdj4KCiAgICAgICAgICAgIHtnYXRlRXJyb3IgJiYgPHAgY2xhc3NOYW1lPSJjcC1nYXRlLWVycm9yIiByb2xlPSJhbGVydCI+e2dhdGVFcnJvcn08L3A+fQoKICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9ImNwLWdhdGUtc3VibWl0IiB0eXBlPSJzdWJtaXQiIGRpc2FibGVkPXtzYXZpbmd9PgogICAgICAgICAgICAgIHtzYXZpbmcgPyA8TG9hZGVyQ2lyY2xlIHNpemU9ezE4fSBjbGFzc05hbWU9InNwaW4iIC8+IDogPEFycm93TGVmdCBzaXplPXsxOH0gc3Ryb2tlV2lkdGg9ezJ9IC8+fQogICAgICAgICAgICAgIDxzcGFuPntzYXZpbmcgPyAi2K/YsSDYrdin2YQg2KvYqNiq4oCmIiA6ICLYq9io2Kog2LTZhdin2LHZhyDZiCDZiNix2YjYryJ9PC9zcGFuPgogICAgICAgICAgICA8L2J1dHRvbj4KCiAgICAgICAgICAgIDxwIGNsYXNzTmFtZT0iY3AtZ2F0ZS1ub3RlIj48U2hpZWxkQ2hlY2sgc2l6ZT17MTR9IHN0cm9rZVdpZHRoPXsxLjh9IC8+INi02YXYp9ix2YfigIzYp9iqINmB2YLYtyDZhtiy2K8g2YXYpyDZhduM4oCM2YXYp9mG2K8g2Ygg2KjZhyDaqdiz24wg2YbYtNin2YYg2K/Yp9iv2Ycg2YbZhduM4oCM2LTZiNivLjwvcD4KICAgICAgICAgIDwvZm9ybT4KICAgICAgICApIDogKAogICAgICAgICAgPGRpdiBjbGFzc05hbWU9ImNwLWxpbmtzIj4KICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9ImNwLWhlYWRpbmciPgogICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT0iY3Ata2lja2VyIj48aSAvPiDYsdin2YfigIzZh9in24wg2KfYsdiq2KjYp9i3INio2Kcg2YXZhjwvc3Bhbj4KICAgICAgICAgICAgICA8aDIgaWQ9ImNwLXRpdGxlIj7aqdis2Kcg2K/YsSDYp9ix2KrYqNin2Lcg2KjYp9i024zZhdifPC9oMj4KICAgICAgICAgICAgPC9kaXY+CgogICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT0iY3AtY2hhbm5lbHMiPgogICAgICAgICAgICAgIHtjaGFubmVscy5tYXAoKGNoYW5uZWwpID0+ICgKICAgICAgICAgICAgICAgIDxhIGNsYXNzTmFtZT17YGNwLWNoYW5uZWwgY3AtJHtjaGFubmVsLmtleX1gfSBocmVmPXtjaGFubmVsLmhyZWZ9IGtleT17Y2hhbm5lbC5rZXl9IHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIG5vcmVmZXJyZXIiIGFyaWEtbGFiZWw9e2DZiNix2YjYryDYqNmHICR7Y2hhbm5lbC5uYW1lfdiMINii24zYr9uMIHR5cGVuaWtiYWtodGB9PgogICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9ImNwLWNoYW5uZWwtaWNvbiI+PEltYWdlIHNyYz17YC9tZXNzZW5nZXJzLyR7Y2hhbm5lbC5rZXl9LnN2Z2B9IGFsdD0iIiB3aWR0aD17MzR9IGhlaWdodD17MzR9IHVub3B0aW1pemVkIHByaW9yaXR5IC8+PC9zcGFuPgogICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9ImNwLWNoYW5uZWwtdGV4dCI+PHN0cm9uZz57Y2hhbm5lbC5uYW1lfTwvc3Ryb25nPjxzcGFuIGRpcj0ibHRyIj5AdHlwZW5pa2Jha2h0PC9zcGFuPjwvc3Bhbj4KICAgICAgICAgICAgICAgICAgPEFycm93VXBMZWZ0IGNsYXNzTmFtZT0iY3AtY2hhbm5lbC1hcnJvdyIgc2l6ZT17MTZ9IHN0cm9rZVdpZHRoPXsxLjh9IGFyaWEtaGlkZGVuPSJ0cnVlIiAvPgogICAgICAgICAgICAgICAgPC9hPgogICAgICAgICAgICAgICkpfQogICAgICAgICAgICA8L2Rpdj4KCiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPSJjcC1waG9uZSI+CiAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPSJjcC1waG9uZS1sYWJlbCI+PHNwYW4gY2xhc3NOYW1lPSJjcC1waG9uZS1pY29uIj48UGhvbmUgc2l6ZT17MTZ9IHN0cm9rZVdpZHRoPXsxLjl9IC8+PC9zcGFuPti02YXYp9ix2Ycg2YXZiNio2KfbjNmEPC9zcGFuPgogICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT0iY3AtcGhvbmUtdmFsdWUiPjxiIGRpcj0ibHRyIj4wOTAzIDM4OCA4Nzc5PC9iPjxidXR0b24gY2xhc3NOYW1lPSJjcC1jb3B5IiBvbkNsaWNrPXtjb3B5UGhvbmV9IHR5cGU9ImJ1dHRvbiIgYXJpYS1sYWJlbD17Y29waWVkID8gIti02YXYp9ix2Ycg2qnZvtuMINi02K8iIDogItqp2b7bjCDYtNmF2KfYsdmHINmF2YjYqNin24zZhCJ9IHRpdGxlPXtjb3BpZWQgPyAi2qnZvtuMINi02K8iIDogItqp2b7bjCDYtNmF2KfYsdmHIn0+e2NvcGllZCA/IDxDaGVjayBzaXplPXsxNX0gLz4gOiA8Q29weSBzaXplPXsxNX0gLz59PC9idXR0b24+PC9zcGFuPgogICAgICAgICAgICA8L2Rpdj4KCiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPSJjcC1mb290ZXIiPgogICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT0iY3AtZm9vdGVyLXRleHQiPtuM2Kcg2YfZhduM2YbigIzYrNinINmB2KfbjNmE2Kog2LHYpyDYqNmB2LHYs9iqPC9zcGFuPgogICAgICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPSJjcC11cGxvYWQiIG9uQ2xpY2s9e29uVXBsb2FkfSB0eXBlPSJidXR0b24iPgogICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPSJjcC11cGxvYWQtaWNvbiI+PEZpbGVVcCBzaXplPXsxOH0gc3Ryb2tlV2lkdGg9ezEuOX0gLz48L3NwYW4+CiAgICAgICAgICAgICAgICA8c3Bhbj7Yotm+2YTZiNivINmB2KfbjNmEINiv2LEg2YfZhduM2YYg2LPYp9uM2Ko8L3NwYW4+CiAgICAgICAgICAgICAgICA8QXJyb3dMZWZ0IGNsYXNzTmFtZT0iY3AtdXBsb2FkLWFycm93IiBzaXplPXsxOH0gc3Ryb2tlV2lkdGg9ezEuOX0gLz4KICAgICAgICAgICAgICA8L2J1dHRvbj4KICAgICAgICAgICAgPC9kaXY+CiAgICAgICAgICA8L2Rpdj4KICAgICAgICApfQoKICAgICAgICA8cCBjbGFzc05hbWU9ImNwLXJlZ2lzdGVyZWQiPjxMb2NrS2V5aG9sZSBzaXplPXsxMn0gc3Ryb2tlV2lkdGg9ezEuOX0gLz57c3RlcCA9PT0gImdhdGUiID8gItio2K/ZiNmGINi52LbZiNuM2Kog2Ygg2KjYr9mI2YYg2YfYstuM2YbZhyIgOiBg2KvYqNiq4oCM2LTYr9mHINio2KcgJHtwaG9uZSB8fCAi2LTZhdin2LHZh9mUINi02YXYpyJ9YH08L3A+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CiAgKTsKfQo=",
  "src/components/contact-popup.css": "LyogQ29udGFjdCBwb3AtdXAgc2hvd24gYWJvdmUgdGhlIHRyYW5zZmVyIGRhc2hib2FyZC4gQWx3YXlzIGZpdHMgdGhlIHZpZXdwb3J0IHdpdGhvdXQgc2Nyb2xsaW5nLiAqLwouY3AtYmFja2Ryb3B7cG9zaXRpb246Zml4ZWQ7aW5zZXQ6MDt6LWluZGV4OjIwMDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7cGFkZGluZzoxNnB4O2JhY2tncm91bmQ6IzFmMjM0MGE2O2JhY2tkcm9wLWZpbHRlcjpibHVyKDZweCk7YW5pbWF0aW9uOmNwLWZhZGUgLjIycyBlYXNlfQouY3AtY2FyZHt3aWR0aDoxMDAlO21heC13aWR0aDo0NDhweDttYXgtaGVpZ2h0OmNhbGMoMTAwZHZoIC0gMjRweCk7b3ZlcmZsb3c6aGlkZGVuO2JhY2tncm91bmQ6I2ZmZjtib3JkZXI6MXB4IHNvbGlkICNlY2VjZjY7Ym9yZGVyLXJhZGl1czoyNHB4O3BhZGRpbmc6MjBweCAyMnB4IDIycHg7Ym94LXNoYWRvdzowIDM0cHggOTBweCAjMTQxODNhMzg7YW5pbWF0aW9uOmNwLXJpc2UgLjI4cyBjdWJpYy1iZXppZXIoLjIsLjgsLjI1LDEpO3Bvc2l0aW9uOnJlbGF0aXZlfQouY3AtY2FyZDpmb2N1c3tvdXRsaW5lOm5vbmV9Ci5jcC1jYXJkOmJlZm9yZXtjb250ZW50OiIiO3Bvc2l0aW9uOmFic29sdXRlO3dpZHRoOjIxMHB4O2hlaWdodDoyMTBweDtib3JkZXItcmFkaXVzOjUwJTtiYWNrZ3JvdW5kOnJhZGlhbC1ncmFkaWVudChjaXJjbGUsI2YxZjBmZix0cmFuc3BhcmVudCA2OCUpO3RvcDotOTZweDtsZWZ0Oi03MnB4O3BvaW50ZXItZXZlbnRzOm5vbmV9Ci5jcC10b3B7cG9zaXRpb246cmVsYXRpdmU7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2Vlbn0KLmNwLXRvcCAuYnJhbmQtbWFya3t3aWR0aDozNHB4O2hlaWdodDozNHB4O2JvcmRlci1yYWRpdXM6MTBweDtib3gtc2hhZG93OjAgNXB4IDEzcHggIzU3NTRlODI2fQouY3AtdG9wIC5icmFuZC1tYXJrIHN2Z3t3aWR0aDoyN3B4O2hlaWdodDoyN3B4fQouY3AtdG9wIC5icmFuZC1uYW1le2ZvbnQtc2l6ZToyNXB4fQouY3AtY2xvc2V7d2lkdGg6MzRweDtoZWlnaHQ6MzRweDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO2JvcmRlci1yYWRpdXM6MTBweDtjb2xvcjojYTBhM2I1O2JhY2tncm91bmQ6I2Y2ZjZmYjt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjE4cyxjb2xvciAuMThzfQouY3AtY2xvc2U6aG92ZXJ7YmFja2dyb3VuZDojZWNlYWZmO2NvbG9yOiM1NzU0ZTh9Ci5jcC1oZWFkaW5ne3Bvc2l0aW9uOnJlbGF0aXZlO21hcmdpbjoxN3B4IDAgMTVweH0KLmNwLWtpY2tlcntkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo3cHg7Y29sb3I6IzdkNzdkYztmb250LXNpemU6MTFweDtmb250LXdlaWdodDo2MDA7bWFyZ2luLWJvdHRvbToycHh9Ci5jcC1raWNrZXIgaXtkaXNwbGF5OmJsb2NrO3dpZHRoOjE4cHg7aGVpZ2h0OjJweDtib3JkZXItcmFkaXVzOjVweDtiYWNrZ3JvdW5kOiM3ZDc3ZGN9Ci5jcC1oZWFkaW5nIGgye2ZvbnQtc2l6ZToyM3B4O2ZvbnQtd2VpZ2h0Ojc4MDtsZXR0ZXItc3BhY2luZzotLjdweDtsaW5lLWhlaWdodDoxLjU1O2NvbG9yOiMyYzMwNDh9Ci5jcC1jaGFubmVsc3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxZnI7Z2FwOjlweH0KLmNwLWNoYW5uZWx7LS10aW50OiNmOGY5ZmU7LS1hY2NlbnQ6IzZiNzVhMjstLWxpbmU6I2U5ZWFmNTtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo5cHg7aGVpZ2h0OjcwcHg7bWluLXdpZHRoOjA7cGFkZGluZzo5cHg7YmFja2dyb3VuZDp2YXIoLS10aW50KTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTRweDt0cmFuc2l0aW9uOnRyYW5zZm9ybSAuMThzLGJvcmRlci1jb2xvciAuMThzLGJveC1zaGFkb3cgLjE4c30KLmNwLWNoYW5uZWw6aG92ZXJ7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoLTJweCk7Ym9yZGVyLWNvbG9yOnZhcigtLWFjY2VudCk7Ym94LXNoYWRvdzowIDhweCAyMHB4ICMzMDMwNGQxMn0KLmNwLWNoYW5uZWw6Zm9jdXMtdmlzaWJsZXtvdXRsaW5lOjNweCBzb2xpZCB2YXIoLS1hY2NlbnQpO291dGxpbmUtb2Zmc2V0OjJweH0KLmNwLWJhbGV7LS10aW50OiNmMWY5ZmQ7LS1hY2NlbnQ6IzQ3YTVjZTstLWxpbmU6I2UxZjFmOX0KLmNwLWVpdGFhey0tdGludDojZmZmOGYwOy0tYWNjZW50OiNlYWE0NDM7LS1saW5lOiNmOWViZDh9Ci5jcC1ydWJpa2F7LS10aW50OiNmNGZhZjg7LS1hY2NlbnQ6IzM2YTg5ZDstLWxpbmU6I2RmZjBlY30KLmNwLXRlbGVncmFtey0tdGludDojZjFmOWZmOy0tYWNjZW50OiMzZTlkZDE7LS1saW5lOiNkZmVmZmF9Ci5jcC1jaGFubmVsLWljb257d2lkdGg6NDRweDtoZWlnaHQ6NDRweDtmbGV4OjAgMCA0NHB4O2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7YmFja2dyb3VuZDojZmZmO2JvcmRlci1yYWRpdXM6MTFweDtib3gtc2hhZG93OjAgMnB4IDZweCAjNDA0MDUwMTJ9Ci5jcC1jaGFubmVsLWljb24gaW1ne3dpZHRoOjMycHg7aGVpZ2h0OjMycHg7b2JqZWN0LWZpdDpjb250YWlufQouY3AtY2hhbm5lbC10ZXh0e21pbi13aWR0aDowO2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1zdGFydDtsaW5lLWhlaWdodDoxLjY1fQouY3AtY2hhbm5lbC10ZXh0IHN0cm9uZ3tmb250LXNpemU6MTNweDtmb250LXdlaWdodDo3MDA7Y29sb3I6IzMzMzg0Zn0KLmNwLWNoYW5uZWwtdGV4dD5zcGFue2ZvbnQtc2l6ZToxMHB4O2NvbG9yOiM3YTdmOTQ7bWF4LXdpZHRoOjEwMCU7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXM7d2hpdGUtc3BhY2U6bm93cmFwfQouY3AtY2hhbm5lbC1hcnJvd3ttYXJnaW4tcmlnaHQ6YXV0bzthbGlnbi1zZWxmOmZsZXgtc3RhcnQ7bWFyZ2luLXRvcDozcHg7Y29sb3I6dmFyKC0tYWNjZW50KTtvcGFjaXR5Oi43O3RyYW5zaXRpb246dHJhbnNmb3JtIC4xOHMsb3BhY2l0eSAuMThzfQouY3AtY2hhbm5lbDpob3ZlciAuY3AtY2hhbm5lbC1hcnJvd3t0cmFuc2Zvcm06dHJhbnNsYXRlKC0ycHgsLTJweCk7b3BhY2l0eToxfQouY3AtcGhvbmV7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6OHB4O21pbi1oZWlnaHQ6NTRweDttYXJnaW4tdG9wOjEwcHg7cGFkZGluZzo4cHggMTJweDtib3JkZXI6MXB4IHNvbGlkICNlY2VjZjQ7Ym9yZGVyLXJhZGl1czoxM3B4fQouY3AtcGhvbmUtbGFiZWx7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OXB4O2ZvbnQtc2l6ZToxMS41cHg7Y29sb3I6IzY2NmQ4Mzt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5jcC1waG9uZS1pY29ue3dpZHRoOjMycHg7aGVpZ2h0OjMycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtib3JkZXItcmFkaXVzOjlweDtiYWNrZ3JvdW5kOiNmMmYwZmY7Y29sb3I6IzY4NjNjOH0KLmNwLXBob25lLXZhbHVle2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjNweDttaW4td2lkdGg6MH0KLmNwLXBob25lLXZhbHVlIGJ7Zm9udC1zaXplOjE1cHg7Zm9udC13ZWlnaHQ6NjgwO2NvbG9yOiMzMjM2NGU7bGV0dGVyLXNwYWNpbmc6LjRweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5jcC1jb3B5e3dpZHRoOjMwcHg7aGVpZ2h0OjMwcHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtib3JkZXItcmFkaXVzOjhweDtjb2xvcjojOWZhMGI2O3RyYW5zaXRpb246YmFja2dyb3VuZCAuMThzLGNvbG9yIC4xOHN9Ci5jcC1jb3B5OmhvdmVye2JhY2tncm91bmQ6I2YwZWZmZjtjb2xvcjojNTc1NGU4fQouY3AtZm9vdGVye21hcmdpbi10b3A6MTdweDtwYWRkaW5nLXRvcDoxNXB4O2JvcmRlci10b3A6MXB4IHNvbGlkICNmMGYwZjZ9Ci5jcC1mb290ZXItdGV4dHtkaXNwbGF5OmJsb2NrO3RleHQtYWxpZ246Y2VudGVyO2ZvbnQtc2l6ZToxMC41cHg7Y29sb3I6IzdjODE5NjttYXJnaW4tYm90dG9tOjlweH0KLmNwLXVwbG9hZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O3dpZHRoOjEwMCU7aGVpZ2h0OjU0cHg7cGFkZGluZzowIDE1cHg7YmFja2dyb3VuZDojNTc1NGU4O2NvbG9yOiNmZmY7Ym9yZGVyLXJhZGl1czoxM3B4O2ZvbnQtc2l6ZToxM3B4O2ZvbnQtd2VpZ2h0OjY4MDtib3gtc2hhZG93OjAgMTFweCAyNHB4ICM1NzU0ZTgzMDt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjE4cyx0cmFuc2Zvcm0gLjE4cyxib3gtc2hhZG93IC4xOHN9Ci5jcC11cGxvYWQ6aG92ZXJ7YmFja2dyb3VuZDojNDk0NWQ1O3RyYW5zZm9ybTp0cmFuc2xhdGVZKC0ycHgpO2JveC1zaGFkb3c6MCAxNHB4IDI4cHggIzU3NTRlODNkfQouY3AtdXBsb2FkOmZvY3VzLXZpc2libGV7b3V0bGluZTozcHggc29saWQgI2E0YTBmYTtvdXRsaW5lLW9mZnNldDozcHh9Ci5jcC11cGxvYWQtaWNvbnt3aWR0aDozNHB4O2hlaWdodDozNHB4O2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7Ym9yZGVyLXJhZGl1czo5cHg7YmFja2dyb3VuZDojZmZmZmZmMjJ9Ci5jcC11cGxvYWQtYXJyb3d7bWFyZ2luLXJpZ2h0OmF1dG87dHJhbnNpdGlvbjp0cmFuc2Zvcm0gLjE4c30KLmNwLXVwbG9hZDpob3ZlciAuY3AtdXBsb2FkLWFycm93e3RyYW5zZm9ybTp0cmFuc2xhdGVYKC0zcHgpfQoKLyogU3RlcCAxIOKAlCBwaG9uZSBnYXRlLiBMaW5rcyBhbmQgdGhlIGNvbnRhY3QgbnVtYmVyIHN0YXkgaGlkZGVuIHVudGlsIGl0IHN1Y2NlZWRzLiAqLwouY3AtYm9vdHtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO21pbi1oZWlnaHQ6MjUycHg7Y29sb3I6I2M2YzRlMH0KLmNwLWxpbmtze2FuaW1hdGlvbjpjcC1zdGVwIC4yNnMgZWFzZX0KLmNwLWdhdGV7YW5pbWF0aW9uOmNwLXN0ZXAgLjI2cyBlYXNlfQouY3AtZ2F0ZS1oZWFkaW5ne21hcmdpbjoxN3B4IDAgMTVweH0KLmNwLWdhdGUtaGVhZGluZyBoMntmb250LXNpemU6MjNweDtmb250LXdlaWdodDo3ODA7bGV0dGVyLXNwYWNpbmc6LS43cHg7bGluZS1oZWlnaHQ6MS41NTtjb2xvcjojMmMzMDQ4fQouY3AtZ2F0ZS1oZWFkaW5nPnB7Zm9udC1zaXplOjExLjVweDtsaW5lLWhlaWdodDoyO2NvbG9yOiM3YzgxOTY7bWFyZ2luLXRvcDo0cHh9Ci5jcC1nYXRlLWxhYmVse2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6NjAwO2NvbG9yOiM2NjZkODM7bWFyZ2luLWJvdHRvbTo2cHh9Ci5jcC1nYXRlLWZpZWxke2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjlweDtoZWlnaHQ6NTRweDtwYWRkaW5nOjAgMTNweDtiYWNrZ3JvdW5kOiNmYmZiZmU7Ym9yZGVyOjEuNXB4IHNvbGlkICNlNmU0ZjU7Ym9yZGVyLXJhZGl1czoxM3B4O3RyYW5zaXRpb246Ym9yZGVyLWNvbG9yIC4xOHMsYm94LXNoYWRvdyAuMThzLGJhY2tncm91bmQgLjE4c30KLmNwLWdhdGUtZmllbGQ6Zm9jdXMtd2l0aGlue2JvcmRlci1jb2xvcjojODk4NWVkO2JhY2tncm91bmQ6I2ZmZjtib3gtc2hhZG93OjAgMCAwIDRweCAjNTc1NGU4MTJ9Ci5jcC1nYXRlLWZpZWxkLmhhcy1lcnJvcntib3JkZXItY29sb3I6I2UwODA4ZjtiYWNrZ3JvdW5kOiNmZmZhZmF9Ci5jcC1nYXRlLWZpZWxkLWljb257Y29sb3I6IzlhOTVlNDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO2ZsZXg6bm9uZX0KLmNwLWdhdGUtZmllbGQ6Zm9jdXMtd2l0aGluIC5jcC1nYXRlLWZpZWxkLWljb257Y29sb3I6IzU3NTRlOH0KLmNwLWdhdGUtaW5wdXR7ZmxleDoxO21pbi13aWR0aDowO2JhY2tncm91bmQ6bm9uZTtib3JkZXI6MDtib3gtc2hhZG93Om5vbmUhaW1wb3J0YW50O2NvbG9yOiMzMjM2NGU7Zm9udC1zaXplOjE2cHg7Zm9udC13ZWlnaHQ6NjAwO2xldHRlci1zcGFjaW5nOjEuMnB4O3BhZGRpbmc6MDtoZWlnaHQ6MTAwJX0KLmNwLWdhdGUtaW5wdXQ6OnBsYWNlaG9sZGVye2NvbG9yOiNjM2MxZDQ7Zm9udC13ZWlnaHQ6NDAwO2xldHRlci1zcGFjaW5nOi42cHh9Ci5jcC1nYXRlLWlucHV0OmRpc2FibGVke2NvbG9yOiNhN2E5YmJ9Ci5jcC1nYXRlLWVycm9ye21hcmdpbi10b3A6OHB4O2ZvbnQtc2l6ZToxMC41cHg7bGluZS1oZWlnaHQ6MS45O2NvbG9yOiNjMTY4NzY7YmFja2dyb3VuZDojZmZmNWY2O2JvcmRlcjoxcHggc29saWQgI2Y4ZTVlOTtib3JkZXItcmFkaXVzOjlweDtwYWRkaW5nOjdweCAxMHB4fQouY3AtZ2F0ZS1zdWJtaXR7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2dhcDo5cHg7d2lkdGg6MTAwJTtoZWlnaHQ6NTRweDttYXJnaW4tdG9wOjEzcHg7YmFja2dyb3VuZDojNTc1NGU4O2NvbG9yOiNmZmY7Ym9yZGVyLXJhZGl1czoxM3B4O2ZvbnQtc2l6ZToxMy41cHg7Zm9udC13ZWlnaHQ6NjgwO2JveC1zaGFkb3c6MCAxMXB4IDI0cHggIzU3NTRlODMwO3RyYW5zaXRpb246YmFja2dyb3VuZCAuMThzLHRyYW5zZm9ybSAuMThzLGJveC1zaGFkb3cgLjE4c30KLmNwLWdhdGUtc3VibWl0OmhvdmVyOm5vdCg6ZGlzYWJsZWQpe2JhY2tncm91bmQ6IzQ5NDVkNTt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtMnB4KTtib3gtc2hhZG93OjAgMTRweCAyOHB4ICM1NzU0ZTgzZH0KLmNwLWdhdGUtc3VibWl0OmRpc2FibGVke2JhY2tncm91bmQ6I2E5YTZlYztib3gtc2hhZG93Om5vbmU7Y3Vyc29yOnByb2dyZXNzfQouY3AtZ2F0ZS1zdWJtaXQ6Zm9jdXMtdmlzaWJsZXtvdXRsaW5lOjNweCBzb2xpZCAjYTRhMGZhO291dGxpbmUtb2Zmc2V0OjNweH0KLmNwLWdhdGUtbm90ZXtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7Z2FwOjZweDttYXJnaW4tdG9wOjEycHg7Zm9udC1zaXplOjEwcHg7bGluZS1oZWlnaHQ6MS45O2NvbG9yOiM4ZDkyYTY7dGV4dC1hbGlnbjpjZW50ZXJ9Ci5jcC1nYXRlLW5vdGUgc3Zne2NvbG9yOiM3ZmI5YTU7ZmxleDpub25lfQouY3AtcmVnaXN0ZXJlZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7Z2FwOjVweDttYXJnaW4tdG9wOjE0cHg7cGFkZGluZy10b3A6MTJweDtib3JkZXItdG9wOjFweCBzb2xpZCAjZjJmMmY4O2ZvbnQtc2l6ZTo5LjVweDtjb2xvcjojYThhYmMwfQouY3AtcmVnaXN0ZXJlZCBzdmd7Y29sb3I6I2I2YjljZDtmbGV4Om5vbmV9CkBrZXlmcmFtZXMgY3Atc3RlcHtmcm9te29wYWNpdHk6MDt0cmFuc2Zvcm06dHJhbnNsYXRlWSg4cHgpfXRve29wYWNpdHk6MTt0cmFuc2Zvcm06bm9uZX19CgovKiBFbnRyeSBwb2ludCB0byBicmluZyB0aGUgcG9wLXVwIGJhY2sgYWZ0ZXIgaXQgd2FzIGRpc21pc3NlZC4gKi8KLnRvcGJhci1jb250YWN0e2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo3cHg7aGVpZ2h0OjM0cHg7cGFkZGluZzowIDEycHg7Ym9yZGVyLXJhZGl1czo5cHg7YmFja2dyb3VuZDojZjJmMWZmO2JvcmRlcjoxcHggc29saWQgI2U2ZTRmYjtjb2xvcjojNWY1OWQyO2ZvbnQtc2l6ZToxMS41cHg7Zm9udC13ZWlnaHQ6NjAwO3doaXRlLXNwYWNlOm5vd3JhcDt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjE4cyxib3JkZXItY29sb3IgLjE4c30KLnRvcGJhci1jb250YWN0OmhvdmVye2JhY2tncm91bmQ6I2U5ZTdmZjtib3JkZXItY29sb3I6I2Q1ZDFmN30KCkBtZWRpYShtYXgtd2lkdGg6NjQwcHgpey50b3BiYXItY29udGFjdHt3aWR0aDozNHB4O3BhZGRpbmc6MDtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyfS50b3BiYXItY29udGFjdCBzcGFue2Rpc3BsYXk6bm9uZX19CkBtZWRpYShtYXgtaGVpZ2h0OjY0MHB4KXsuY3AtYmFja2Ryb3B7cGFkZGluZzo4cHh9LmNwLWNhcmR7cGFkZGluZzoxNHB4IDE2cHggMTZweDtib3JkZXItcmFkaXVzOjIwcHh9LmNwLWhlYWRpbmd7bWFyZ2luOjEwcHggMCAxMHB4fS5jcC1oZWFkaW5nIGgye2ZvbnQtc2l6ZToxOXB4fS5jcC1raWNrZXJ7Zm9udC1zaXplOjEwcHh9LmNwLWdhdGUtaGVhZGluZ3ttYXJnaW46OXB4IDAgMTFweH0uY3AtZ2F0ZS1oZWFkaW5nIGgye2ZvbnQtc2l6ZToxOXB4fS5jcC1nYXRlLWhlYWRpbmc+cHtmb250LXNpemU6MTAuNXB4O21hcmdpbi10b3A6MnB4fS5jcC1nYXRlLWZpZWxke2hlaWdodDo0NnB4fS5jcC1nYXRlLXN1Ym1pdHtoZWlnaHQ6NDZweDttYXJnaW4tdG9wOjEwcHh9LmNwLWdhdGUtbm90ZXttYXJnaW4tdG9wOjlweDtmb250LXNpemU6OS41cHh9LmNwLWdhdGUtZXJyb3J7bWFyZ2luLXRvcDo2cHg7cGFkZGluZzo1cHggOXB4fS5jcC1yZWdpc3RlcmVke21hcmdpbi10b3A6MTBweDtwYWRkaW5nLXRvcDo5cHh9LmNwLWNoYW5uZWx7aGVpZ2h0OjU4cHg7cGFkZGluZzo3cHh9LmNwLWNoYW5uZWwtaWNvbnt3aWR0aDozOHB4O2hlaWdodDozOHB4O2ZsZXgtYmFzaXM6MzhweH0uY3AtY2hhbm5lbC1pY29uIGltZ3t3aWR0aDoyOHB4O2hlaWdodDoyOHB4fS5jcC1waG9uZXttaW4taGVpZ2h0OjQ2cHg7bWFyZ2luLXRvcDo4cHg7cGFkZGluZzo1cHggMTBweH0uY3AtcGhvbmUtaWNvbnt3aWR0aDoyOHB4O2hlaWdodDoyOHB4fS5jcC1mb290ZXJ7bWFyZ2luLXRvcDoxMXB4O3BhZGRpbmctdG9wOjEwcHh9LmNwLWZvb3Rlci10ZXh0e2Rpc3BsYXk6bm9uZX0uY3AtdXBsb2Fke2hlaWdodDo0NnB4fX0KQG1lZGlhKG1heC1oZWlnaHQ6NTIwcHgpey5jcC10b3AgLmJyYW5kLW5hbWV7Zm9udC1zaXplOjIxcHh9LmNwLXRvcCAuYnJhbmQtbWFya3t3aWR0aDoyOHB4O2hlaWdodDoyOHB4fS5jcC1oZWFkaW5ne21hcmdpbjo2cHggMCA4cHh9LmNwLWtpY2tlcntkaXNwbGF5Om5vbmV9LmNwLWdhdGUtaGVhZGluZ3ttYXJnaW46NXB4IDAgOHB4fS5jcC1nYXRlLWhlYWRpbmc+cHtkaXNwbGF5Om5vbmV9LmNwLWdhdGUtZmllbGR7aGVpZ2h0OjQycHh9LmNwLWdhdGUtaW5wdXR7Zm9udC1zaXplOjE1cHh9LmNwLWdhdGUtc3VibWl0e2hlaWdodDo0MnB4O21hcmdpbi10b3A6OHB4O2ZvbnQtc2l6ZToxMi41cHh9LmNwLWdhdGUtbm90ZXttYXJnaW4tdG9wOjdweH0uY3AtcmVnaXN0ZXJlZHttYXJnaW4tdG9wOjhweDtwYWRkaW5nLXRvcDo3cHh9LmNwLWNoYW5uZWx7aGVpZ2h0OjUwcHh9LmNwLWNoYW5uZWwtaWNvbnt3aWR0aDozMnB4O2hlaWdodDozMnB4O2ZsZXgtYmFzaXM6MzJweH0uY3AtY2hhbm5lbC1pY29uIGltZ3t3aWR0aDoyNHB4O2hlaWdodDoyNHB4fS5jcC1jaGFubmVsLWFycm93e2Rpc3BsYXk6bm9uZX0uY3AtcGhvbmV7bWluLWhlaWdodDo0MHB4fS5jcC1mb290ZXJ7bWFyZ2luLXRvcDo4cHg7cGFkZGluZy10b3A6OHB4fS5jcC11cGxvYWR7aGVpZ2h0OjQycHh9fQpAbWVkaWEobWF4LXdpZHRoOjQwMHB4KXsuY3AtY2FyZHtwYWRkaW5nLWxlZnQ6MTRweDtwYWRkaW5nLXJpZ2h0OjE0cHh9LmNwLWdhdGUtaGVhZGluZyBoMntmb250LXNpemU6MjBweH0uY3AtZ2F0ZS1pbnB1dHtmb250LXNpemU6MTVweDtsZXR0ZXItc3BhY2luZzouOHB4fS5jcC1nYXRlLXN1Ym1pdHtmb250LXNpemU6MTIuNXB4fS5jcC1jaGFubmVsc3tnYXA6N3B4fS5jcC1jaGFubmVse2dhcDo2cHg7cGFkZGluZzo3cHh9LmNwLWNoYW5uZWwtaWNvbnt3aWR0aDozOHB4O2hlaWdodDozOHB4O2ZsZXgtYmFzaXM6MzhweH0uY3AtY2hhbm5lbC1pY29uIGltZ3t3aWR0aDoyOHB4O2hlaWdodDoyOHB4fS5jcC1jaGFubmVsLXRleHQgc3Ryb25ne2ZvbnQtc2l6ZToxMnB4fS5jcC1jaGFubmVsLXRleHQ+c3Bhbntmb250LXNpemU6OXB4fS5jcC1jaGFubmVsLWFycm93e2Rpc3BsYXk6bm9uZX0uY3AtcGhvbmUtbGFiZWx7Zm9udC1zaXplOjEwLjVweH0uY3AtcGhvbmUtdmFsdWUgYntmb250LXNpemU6MTMuNXB4fX0KQGtleWZyYW1lcyBjcC1mYWRle2Zyb217b3BhY2l0eTowfXRve29wYWNpdHk6MX19CkBrZXlmcmFtZXMgY3AtcmlzZXtmcm9te29wYWNpdHk6MDt0cmFuc2Zvcm06dHJhbnNsYXRlWSgxNHB4KSBzY2FsZSguOTcpfXRve29wYWNpdHk6MTt0cmFuc2Zvcm06bm9uZX19CkBtZWRpYShwcmVmZXJzLXJlZHVjZWQtbW90aW9uOnJlZHVjZSl7LmNwLWJhY2tkcm9wLC5jcC1jYXJke2FuaW1hdGlvbjpub25lfS5jcC1jaGFubmVsLC5jcC11cGxvYWQsLmNwLXVwbG9hZC1hcnJvdywuY3AtY2hhbm5lbC1hcnJvd3t0cmFuc2l0aW9uOm5vbmV9fQo=",
  "src/app/api/leads/route.ts": "aW1wb3J0IHsgc3FsIH0gZnJvbSAiZHJpenpsZS1vcm0iOwppbXBvcnQgeyBkYiB9IGZyb20gIkAvZGIiOwppbXBvcnQgeyBsZWFkcyB9IGZyb20gIkAvZGIvc2NoZW1hIjsKaW1wb3J0IHsgaXNWYWxpZElyYW5Nb2JpbGUsIG5vcm1hbGl6ZVBob25lIH0gZnJvbSAiQC9saWIvc2hhcmVkIjsKaW1wb3J0IHsgYXBpRXJyb3IsIHJhdGVMaW1pdGVkIH0gZnJvbSAiQC9saWIvdHJhbnNmZXItc2VydmVyIjsKCmV4cG9ydCBhc3luYyBmdW5jdGlvbiBQT1NUKHJlcXVlc3Q6IFJlcXVlc3QpIHsKICB0cnkgewogICAgLy8gR2VuZXJvdXMgZW5vdWdoIGZvciB3aG9sZSBmYW1pbGllcyBiZWhpbmQgb25lIGNhcnJpZXIgTkFULCB0aWdodCBlbm91Z2ggdG8gc3RvcCBzY3JpcHRzLgogICAgaWYgKHJhdGVMaW1pdGVkKHJlcXVlc3QsICJsZWFkcyIsIDMwKSkgcmV0dXJuIGFwaUVycm9yKCLZhNi32YHYp9mLINqp2YXbjCDYtdio2LEg2qnZhtuM2K8g2Ygg2K/ZiNio2KfYsdmHINiq2YTYp9i0INqp2YbbjNivLiIsIDQyOSk7CiAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVxdWVzdC5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSk7CiAgICBjb25zdCBwaG9uZSA9IG5vcm1hbGl6ZVBob25lKHR5cGVvZiBib2R5LnBob25lID09PSAic3RyaW5nIiA/IGJvZHkucGhvbmUgOiAiIik7CiAgICBpZiAoIWlzVmFsaWRJcmFuTW9iaWxlKHBob25lKSkgcmV0dXJuIGFwaUVycm9yKCLYtNmF2KfYsdmH2ZQg2YXZiNio2KfbjNmEINmF2LnYqtio2LEg2YbbjNiz2KouINmF2KvYp9mEOiDbsNu527Hbstuz27Tbtdu227fbuNu5IiwgNDIyKTsKICAgIGNvbnN0IHNvdXJjZSA9IHR5cGVvZiBib2R5LnNvdXJjZSA9PT0gInN0cmluZyIgPyBib2R5LnNvdXJjZS50cmltKCkuc2xpY2UoMCwgNDApIHx8ICJjb250YWN0LXBvcHVwIiA6ICJjb250YWN0LXBvcHVwIjsKICAgIC8vIFVwc2VydDogYSByZXR1cm5pbmcgdmlzaXRvciBidW1wcyB0aGVpciB2aXNpdCBjb3VudCBpbnN0ZWFkIG9mIGNyZWF0aW5nIGEgZHVwbGljYXRlIHJvdy4KICAgIGNvbnN0IFtsZWFkXSA9IGF3YWl0IGRiCiAgICAgIC5pbnNlcnQobGVhZHMpCiAgICAgIC52YWx1ZXMoeyBwaG9uZSwgc291cmNlIH0pCiAgICAgIC5vbkNvbmZsaWN0RG9VcGRhdGUoeyB0YXJnZXQ6IGxlYWRzLnBob25lLCBzZXQ6IHsgdmlzaXRzOiBzcWxgJHtsZWFkcy52aXNpdHN9ICsgMWAsIGxhc3RTZWVuQXQ6IG5ldyBEYXRlKCkgfSB9KQogICAgICAucmV0dXJuaW5nKHsgaWQ6IGxlYWRzLmlkLCBwaG9uZTogbGVhZHMucGhvbmUsIHZpc2l0czogbGVhZHMudmlzaXRzIH0pOwogICAgcmV0dXJuIFJlc3BvbnNlLmpzb24oeyBvazogdHJ1ZSwgcGhvbmU6IGxlYWQucGhvbmUsIHZpc2l0czogbGVhZC52aXNpdHMgfSwgeyBzdGF0dXM6IGxlYWQudmlzaXRzID09PSAxID8gMjAxIDogMjAwIH0pOwogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICBjb25zb2xlLmVycm9yKCJMZWFkIGNhcHR1cmU6IiwgZXJyb3IpOwogICAgcmV0dXJuIGFwaUVycm9yKCLYq9io2Kog2LTZhdin2LHZhyDZhdmF2qnZhiDZhti02K8uINiv2YjYqNin2LHZhyDYqtmE2KfYtCDaqdmG24zYry4iLCA1MDApOwogIH0KfQo="
};
for (const [relative, base64] of Object.entries(NEW_FILES)) writeNew(relative, base64);

// --- 2) توابع شماره در src/lib/shared.ts ----------------------------------------
edit("src/lib/shared.ts", {
  label: "توابع نرمال‌سازی و اعتبارسنجی شماره",
  already: (t) => t.includes("export function normalizePhone"),
  marker: "export function relativeTime",
  where: "before",
  insert: `/** Persian/Arabic digits → Latin, so phone input works with any keyboard layout. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

/** Canonical form of an Iranian mobile number: 09xxxxxxxxx. */
export function normalizePhone(value: string): string {
  const digits = toLatinDigits(value).replace(/\\D/g, "");
  if (digits.startsWith("0098")) return \`0\${digits.slice(4)}\`;
  if (digits.startsWith("98") && digits.length === 12) return \`0\${digits.slice(2)}\`;
  if (digits.length === 10 && digits.startsWith("9")) return \`0\${digits}\`;
  return digits;
}

export function isValidIranMobile(value: string): boolean {
  return /^09\\d{9}$/.test(value);
}

`,
});

// --- 3) جدول leads در src/db/schema.ts ------------------------------------------
edit("src/db/schema.ts", {
  label: "جدول leads",
  already: (t) => t.includes("leads = pgTable"),
  marker: 'export const feedback = pgTable("feedback", {',
  where: "before",
  insert: `/** Phone numbers collected before the contact links are revealed. */
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  visits: integer("visits").notNull().default(1),
  source: varchar("source", { length: 40 }).notNull().default("contact-popup"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

`,
});

// --- 4) جدول leads در supabase/schema.sql ---------------------------------------
edit("supabase/schema.sql", {
  label: "جدول leads (SQL)",
  already: (t) => t.includes("public.leads"),
  marker: "create table if not exists public.feedback (",
  where: "before",
  insert: `-- Phone numbers collected by the contact pop-up before the links are shown.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  phone varchar(20) not null unique,
  visits integer not null default 1,
  source varchar(40) not null default 'contact-popup',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

`,
});

edit("supabase/schema.sql", {
  label: "ایندکس leads",
  already: (t) => t.includes("leads_created_at_idx"),
  marker: "create index if not exists transfer_files_transfer_id_idx on public.transfer_files (transfer_id);",
  where: "after",
  insert: "\ncreate index if not exists leads_created_at_idx on public.leads (created_at desc);",
});

edit("supabase/schema.sql", {
  label: "فعال‌سازی RLS برای leads",
  already: (t) => t.includes("alter table public.leads enable row level security"),
  marker: "alter table public.feedback enable row level security;",
  where: "after",
  insert: "\n-- Phone numbers are personal data: RLS keeps them unreadable through the public anon key.\nalter table public.leads enable row level security;",
});

// --- 5) پنج ویرایش در transfer-app.tsx ------------------------------------------
const appPath = join(root, "src/components/transfer-app.tsx");
const appText = existsSync(appPath) ? readFileSync(appPath, "utf8") : "";
// اگر نسخهٔ پروژه uploadBusy ندارد، نسخهٔ سادهٔ onUpload استفاده می‌شود تا بیلد نشکند.
const hasUploadBusy = appText.includes("uploadBusy");
const onUpload = hasUploadBusy
  ? 'onUpload={() => { setContactOpen(false); if (!uploadBusy) { setSection("home"); setTab("send"); } }}'
  : 'onUpload={() => { setContactOpen(false); setSection("home"); setTab("send"); }}';

edit("src/components/transfer-app.tsx", {
  label: "import پاپ‌آپ",
  already: (t) => t.includes("@/components/contact-popup"),
  marker: 'import Guide from "@/components/guide";',
  where: "after",
  insert: '\nimport ContactPopup from "@/components/contact-popup";\nimport { MessageCircle } from "lucide-react";',
});

edit("src/components/transfer-app.tsx", {
  label: "state به نام contactOpen",
  already: (t) => t.includes("contactOpen"),
  marker: 'const [modal, setModal] = useState<"settings" | "feedback" | "install" | null>(null);',
  where: "after",
  insert: "\n  const [contactOpen, setContactOpen] = useState(true);",
});

edit("src/components/transfer-app.tsx", {
  label: "دکمهٔ «راه‌های ارتباط» در نوار بالا",
  already: (t) => t.includes("topbar-contact"),
  marker: '<button className="icon-button help-button"',
  where: "before",
  insert: '<button className="topbar-contact" onClick={() => setContactOpen(true)} aria-label="راه‌های ارتباط"><MessageCircle size={17}/><span>راه‌های ارتباط</span></button>',
});

edit("src/components/transfer-app.tsx", {
  label: "دکمهٔ «راه‌های ارتباط» در منوی کناری",
  already: (t) => t.includes('setContactOpen(true); setMobileMenu(false);'),
  marker: '<nav className="secondary-nav" aria-label="تنظیمات و پشتیبانی">',
  where: "after",
  insert: '<button onClick={() => { setContactOpen(true); setMobileMenu(false); }}><MessageCircle size={19}/><span>راه‌های ارتباط</span></button>',
});

edit("src/components/transfer-app.tsx", {
  label: "رندر پاپ‌آپ",
  already: (t) => t.includes("<ContactPopup"),
  marker: '{modal === "settings" && <Modal',
  where: "before",
  insert: `{contactOpen && <ContactPopup onClose={() => setContactOpen(false)} ${onUpload}/>}
    `,
});

// --- 6) آیکون‌ها -----------------------------------------------------------------
const ICON_DIR = join(root, "public", "messengers");
const ICONS = {
  bale: "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/bale.svg",
  eitaa: "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/eitaa.svg",
  telegram: "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/telegram.svg",
  rubika: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Rubika_ic_and_title.svg",
};

async function icons() {
  mkdirSync(ICON_DIR, { recursive: true });
  for (const [name, url] of Object.entries(ICONS)) {
    const target = join(ICON_DIR, `${name}.svg`);
    if (existsSync(target)) { skipped.push(`public/messengers/${name}.svg (از قبل هست)`); continue; }
    try {
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let svg = await response.text();
      if (!svg.includes("<svg")) throw new Error("پاسخ یک فایل SVG نبود");
      // لوگوی روبیکا شامل متن است؛ فقط نشان آن نگه داشته می‌شود.
      if (name === "rubika") svg = svg.replace('viewBox="0 0 1278.89 543.02"', 'viewBox="784 0 494.89 543.02"');
      writeFileSync(target, svg);
      done.push(`public/messengers/${name}.svg`);
    } catch (error) {
      manual.push(`دانلود آیکون ${name} نشد (${error.message}). فایل public/messengers/${name}.svg را دستی بگذار.`);
    }
  }
}

await icons();

// --- گزارش ----------------------------------------------------------------------
log(`${C.ok}${C.bold}اعمال شد:${C.off}`);
if (done.length) for (const item of done) log(`  ${C.ok}✓${C.off} ${item}`);
else log(`  ${C.dim}(چیزی تغییر نکرد)${C.off}`);

if (skipped.length) {
  log(`\n${C.dim}از قبل موجود بود (دست نخورد):${C.off}`);
  for (const item of skipped) log(`  ${C.dim}•${C.off} ${item}`);
}

if (manual.length) {
  log(`\n${C.warn}${C.bold}نیاز به کار دستی:${C.off}`);
  for (const item of manual) log(`  ${C.warn}!${C.off} ${item}`);
}

if (backupDir) log(`\n${C.dim}نسخهٔ پشتیبان فایل‌های ویرایش‌شده: .contact-popup-backup/${C.off}`);

log(`
${C.bold}قدم بعد:${C.off}
  ${C.bold}۱.${C.off} جدول leads را در Supabase بساز (SQL Editor):
     بخش leads را از فایل supabase/schema.sql کپی و اجرا کن.
     ${C.warn}بدون این کار، مرحلهٔ دوم پاپ‌آپ باز نمی‌شود.${C.off}
     اگر از Drizzle استفاده می‌کنی:  npx drizzle-kit push

  ${C.bold}۲.${C.off} بررسی:
     npm run lint && npm run build

  ${C.bold}۳.${C.off} انتشار:
     git add -A && git commit -m "feat: contact pop-up with phone gate" && git push

  ${C.dim}برای دیدن شماره‌ها: Supabase → Table Editor → جدول leads${C.off}
`);

if (manual.length) process.exitCode = 1;
