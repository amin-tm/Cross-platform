import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const base = process.env.TEST_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL });
const chunkSize = 6 * 1024 * 1024;
const size = chunkSize + 128;
const fileId = "36aa5753-da1e-42bd-9a95-eba3277d133b";
const code = "724618";
const now = new Date();
const transfer = {
  id: "test-transfer", code, kind: "send", status: "pending", files: [], fileCount: 0,
  totalSize: 0, downloads: 0, textContent: null, createdAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + 86400000).toISOString(), completedAt: null,
};
let tickets = 0;
let sessions = 0;
let offset = 0;
let interruptions = 0;
let finishAttempts = 0;
const writes = [];

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.route("**/api/transfers", async (route) => {
    const request = route.request();
    const json = request.method() === "GET" ? { transfers: [] } :
      request.postDataJSON().kind === "inbox" ? { ...transfer, id: "test-inbox", kind: "inbox", code: "123456" } : transfer;
    await route.fulfill({ json });
  });
  await page.route("**/api/transfers/*/files*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("action") === "finish") {
      assert.equal(route.request().postDataJSON().fileId, fileId);
      assert.equal(offset, size);
      finishAttempts++;
      if (finishAttempts === 1) {
        await route.fulfill({ status: 503, json: { error: "تأیید نمونه موقتاً ناموفق بود." } });
      } else {
        await route.fulfill({ json: { ok: true } });
      }
      return;
    }
    tickets++;
    await route.fulfill({ json: {
      id: fileId,
      upload: { token: "test-signature", path: `transfer/${fileId}`,
        resumable: { endpoint: `${base}/test-tus`, bucket: "transfers" } },
    } });
  });
  await page.route("**/test-tus", async (route) => {
    assert.equal(route.request().method(), "POST");
    assert.equal(route.request().headers()["x-signature"], "test-signature");
    assert.equal(Number(route.request().headers()["upload-length"]), size);
    sessions++;
    await route.fulfill({ status: 201, headers: { location: "/test-tus/session", "Tus-Resumable": "1.0.0" } });
  });
  await page.route("**/test-tus/session", async (route) => {
    const request = route.request();
    const headers = { "Tus-Resumable": "1.0.0", "Upload-Offset": String(offset), "Upload-Length": String(size) };
    assert.equal(request.headers()["x-signature"], "test-signature");
    if (request.method() === "HEAD") {
      await route.fulfill({ status: 200, headers });
      return;
    }
    assert.equal(request.method(), "PATCH");
    assert.equal(Number(request.headers()["upload-offset"]), offset);
    if (offset === chunkSize && interruptions++ === 0) {
      await route.abort("connectionreset");
      return;
    }
    const bytes = request.postDataBuffer().length;
    writes.push(bytes);
    offset += bytes;
    await route.fulfill({ status: 204, headers: { ...headers, "Upload-Offset": String(offset) } });
  });
  await page.route("**/api/transfers/*/complete", (route) => route.fulfill({ json: {
    ...transfer, status: "ready", fileCount: 1, totalSize: size, files: [{ id: fileId, name: "large-video.mov", size }],
  } }));

  await page.goto(base);
  await page.locator('input[type="file"]').setInputFiles({
    name: "large-video.mov", mimeType: "video/quicktime", buffer: Buffer.alloc(size),
  });
  await page.getByRole("button", { name: "ارسال فایل‌ها" }).click();
  await page.getByRole("alert").getByText("تأیید نمونه موقتاً ناموفق بود.").waitFor();
  await page.getByRole("button", { name: "ادامه ارسال" }).click();
  await page.getByText("فایل‌ها با موفقیت ارسال شدند!").waitFor();
  assert.deepEqual(writes, [chunkSize, 128]);
  assert.equal(tickets, 1);
  assert.equal(sessions, 1);
  assert.equal(finishAttempts, 2);
  console.log("PASS: a large upload resumes after an interruption and retries confirmation without resending bytes");
} finally {
  await browser.close();
}
