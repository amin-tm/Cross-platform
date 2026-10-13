import fs from 'node:fs';

const appPath = 'src/components/transfer-app.tsx';
const uploaderPath = 'src/components/transfer-uploader.tsx';

function update(path, needle, replacement, marker) {
  const content = fs.readFileSync(path, 'utf8');
  if (content.includes(marker)) { console.log(`${path}: already patched`); return; }
  if (!content.includes(needle)) throw new Error(`Expected insertion point not found: ${path}. Source may have changed; do not apply blindly.`);
  fs.writeFileSync(path, content.replace(needle, replacement), 'utf8');
  console.log(`${path}: patched`);
}

const appHook = `
  // POL_NATIVE_SHARE: Switch to Send when Android shares a file into the app.
  useEffect(() => {
    const openSharedFiles = () => {
      const pending = (window as Window & { __polPendingShare?: unknown }).__polPendingShare;
      if (!Array.isArray(pending) || pending.length === 0) return;
      setSection("home");
      setTab("send");
      setResult(null);
    };
    window.addEventListener("pol-native-share", openSharedFiles);
    openSharedFiles();
    return () => window.removeEventListener("pol-native-share", openSharedFiles);
  }, []);
`;
update(appPath,
  '  const closeModal = useCallback(',
  appHook + '\n  const closeModal = useCallback(',
  'POL_NATIVE_SHARE:');

const uploaderHook = `
  // POL_NATIVE_SHARE: Receive Android content URIs through a WebView-only stream endpoint.
  useEffect(() => {
    type NativeEntry = { name: string; type: string; url: string };
    type NativeWindow = Window & { __polPendingShare?: NativeEntry[] };
    let cancelled = false;
    let processing = false;
    const consume = async () => {
      const nativeWindow = window as NativeWindow;
      const entries = nativeWindow.__polPendingShare;
      if (processing || !Array.isArray(entries) || entries.length === 0) return;
      processing = true;
      try {
        const received: File[] = [];
        for (const entry of entries) {
          if (typeof entry.url !== "string" || !entry.url.startsWith("/__pol_native_share__/")) throw new Error("نشانی فایل اشتراکی نامعتبر است.");
          const response = await fetch(entry.url, { cache: "no-store" });
          if (!response.ok) throw new Error("خواندن فایل اشتراکی از اندروید ناموفق بود.");
          const blob = await response.blob();
          received.push(new File([blob], entry.name || "shared-file", { type: entry.type || blob.type || "application/octet-stream" }));
        }
        if (cancelled) return;
        if (received.length > MAX_FILE_COUNT || received.reduce((sum, file) => sum + file.size, 0) > MAX_TRANSFER_SIZE) {
          setError("تعداد یا حجم فایل‌های اشتراکی بیشتر از حد مجاز پُل است.");
          return;
        }
        setFiles(received);
        setError("");
        delete nativeWindow.__polPendingShare;
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "دریافت فایل اشتراکی ممکن نشد.");
      } finally { processing = false; }
    };
    window.addEventListener("pol-native-share", consume);
    void consume();
    return () => { cancelled = true; window.removeEventListener("pol-native-share", consume); };
  }, []);
`;
update(uploaderPath,
  '  useEffect(() => () => aborter.current?.abort(), []);',
  '  useEffect(() => () => aborter.current?.abort(), []);\n' + uploaderHook,
  'POL_NATIVE_SHARE:');
