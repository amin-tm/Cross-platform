"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowRightLeft, ArrowUpRight, BookOpen, Check, ChevronLeft, CircleHelp, Clock3, Copy, Download, FileStack, Files, Globe2, History, Info, Laptop, LayoutGrid, Link2, LoaderCircle, Menu, MessageSquare, Monitor, Search, Send, Settings2, ShieldCheck, Smartphone, Sparkles, Trash2, Wifi, X, Zap, MessageCircle } from "lucide-react";
import { api, copyText, createTransfer } from "@/lib/client";
import { formatSize, relativeTime, type Transfer } from "@/lib/shared";
import { Brand, FileGlyph, Modal, PlatformIcon } from "@/components/ui";
import TransferUploader from "@/components/transfer-uploader";
import ConnectionCard from "@/components/connection-card";
import { TransferDownloads, TransferSuccess } from "@/components/transfer-downloads";
import ReceivePanel from "@/components/receive-panel";
import Guide from "@/components/guide";
import ContactPopup from "@/components/contact-popup";
import { MessageCircle } from "lucide-react";

type Section = "home" | "history" | "guide";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Toast = { message: string; error?: boolean };

export default function TransferApp() {
  const [section, setSection] = useState<Section>("home");
  const [tab, setTab] = useState<"send" | "receive">("send");
  const [history, setHistory] = useState<Transfer[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [inbox, setInbox] = useState<Transfer | null>(null);
  const [inboxError, setInboxError] = useState("");
  const [result, setResult] = useState<Transfer | null>(null);
  const [origin, setOrigin] = useState("");
  const [online, setOnline] = useState(true);
  const [deviceName, setDeviceName] = useState("دستگاه شما");
  const [devicePlatform, setDevicePlatform] = useState("مرورگر وب");
  const [deviceDraft, setDeviceDraft] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [modal, setModal] = useState<"settings" | "feedback" | "install" | null>(null);
  const [contactOpen, setContactOpen] = useState(true);
  const [selected, setSelected] = useState<Transfer | null>(null);
  const [deleting, setDeleting] = useState<Transfer | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "send" | "receive">("all");
  const [search, setSearch] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const loadingInbox = useRef(false);

  const notify = useCallback((message: string, error = false) => setToast({ message, error }), []);
  const closeModal = useCallback(() => { setModal(null); setSelected(null); setDeleting(null); }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api<{ transfers: Transfer[] }>("/api/transfers");
      setHistory(data.transfers);
      setHistoryError("");
    } catch (cause) { setHistoryError(cause instanceof Error ? cause.message : "دریافت تاریخچه ممکن نشد."); }
    finally { setHistoryLoading(false); }
  }, []);

  const loadInbox = useCallback(async (fresh = false) => {
    if (loadingInbox.current) return;
    loadingInbox.current = true;
    setInboxError("");
    try { setInbox(await createTransfer("inbox", fresh)); }
    catch { setInboxError("اتصال برقرار نشد"); }
    finally { loadingInbox.current = false; }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    setOnline(navigator.onLine);
    const ua = navigator.userAgent;
    setDevicePlatform(/Android/.test(ua) ? "Android · مرورگر وب" : /iPhone|iPad/.test(ua) ? "iOS · Safari" : /Windows/.test(ua) ? "Windows · مرورگر وب" : /Macintosh/.test(ua) ? "macOS · مرورگر وب" : "مرورگر وب");
    try { const name = localStorage.getItem("pol_device_name"); if (name) setDeviceName(name); } catch { /* storage unavailable */ }
    void loadHistory().then(() => loadInbox());
    const connectivity = () => setOnline(navigator.onLine);
    const install = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    window.addEventListener("beforeinstallprompt", install);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { window.removeEventListener("online", connectivity); window.removeEventListener("offline", connectivity); window.removeEventListener("beforeinstallprompt", install); };
  }, [loadHistory, loadInbox]);

  useEffect(() => {
    if (!inbox || inbox.status !== "pending") return;
    let active = true;
    let polling = false;
    const timer = setInterval(async () => {
      if (document.hidden || polling) return;
      polling = true;
      try {
        const next = await api<Transfer>(`/api/transfers/${inbox.code}`);
        if (!active) return;
        setInbox(next);
        if (next.status === "ready") { notify("فایل‌ها از دستگاه دیگر رسیدند!"); void loadHistory(); }
      } catch (cause) { if (active && cause instanceof Error && cause.message.includes("پایان")) setInboxError("زمان کد تمام شد"); }
      finally { polling = false; }
    }, 3500);
    return () => { active = false; clearInterval(timer); };
  }, [inbox, loadHistory, notify]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4300);
    return () => clearTimeout(timer);
  }, [toast]);

  function navigate(next: Section) {
    if (uploadBusy && next !== section) {
      notify("ارسال در حال انجام است؛ صبر کنید یا ابتدا آن را متوقف کنید.");
      return;
    }
    setSection(next);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (next === "history") void loadHistory();
  }

  function startTransfer() { navigate("home"); setTab("send"); setResult(null); }

  async function copy(value: string) {
    if (!value) return;
    try { await copyText(value); notify(/^\d{6}$/.test(value) ? "کد اتصال کپی شد" : "لینک کپی شد؛ برای دستگاه دیگر بفرستید."); }
    catch (cause) { notify(cause instanceof Error ? cause.message : "کپی انجام نشد.", true); }
  }

  function complete(transfer: Transfer) {
    setResult(transfer);
    setHistory((current) => [transfer, ...current.filter((item) => item.id !== transfer.id)]);
    notify("ارسال کامل شد. لینک دریافت آماده است.");
  }

  async function removeTransfer() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/transfers/${deleting.code}`, { method: "DELETE" });
      setHistory((current) => current.filter((item) => item.id !== deleting.id));
      if (result?.id === deleting.id) setResult(null);
      if (inbox?.id === deleting.id) { setInbox(null); void loadInbox(true); }
      setDeleting(null);
      notify("انتقال و فایل‌های آن حذف شدند.");
    } catch (cause) { notify(cause instanceof Error ? cause.message : "حذف انجام نشد.", true); }
    finally { setBusy(false); }
  }

  async function sendFeedback(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: feedbackMessage }) });
      setModal(null); setFeedbackMessage(""); notify("ممنون! بازخورد شما ثبت شد.");
    } catch (cause) { notify(cause instanceof Error ? cause.message : "ارسال انجام نشد.", true); }
    finally { setBusy(false); }
  }

  async function installApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") notify("پُل به دستگاه شما اضافه شد.");
      setInstallPrompt(null);
    } else setModal("install");
  }

  const isReceived = (transfer: Transfer) => transfer.kind === "inbox" && transfer.isOwner;
  const filtered = history.filter((item) => (filter === "all" || (filter === "receive" ? isReceived(item) : !isReceived(item))) && (!search || item.code.includes(search) || item.files.some((file) => file.name.toLowerCase().includes(search.toLowerCase()))));

  function historyCard(full = false) {
    const items = full ? filtered : history.slice(0, 3);
    return <section className={`history-card ${full ? "history-card-full" : ""}`}><div className="section-card-header"><div className="section-title"><span className="section-icon"><History size={19}/></span><h2>{full ? "همهٔ انتقال‌ها" : "انتقال‌های اخیر"}</h2>{history.length > 0 && <span className="count-badge">{history.length.toLocaleString("fa-IR")}</span>}</div>{!full && <button className="text-button muted" onClick={() => navigate("history")}>مشاهدهٔ همه<ArrowLeft size={15}/></button>}{full && <button className="button button-primary button-small" onClick={startTransfer}><Send size={15}/>انتقال جدید</button>}</div>{full && <div className="history-toolbar"><div className="history-filters">{([["all", "همه"], ["send", "ارسال‌شده"], ["receive", "دریافت‌شده"]] as const).map(([value, title]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{title}</button>)}</div><div className="history-search"><Search size={16}/><input placeholder="جست‌وجوی فایل یا کد…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="جست‌وجوی انتقال‌ها"/></div></div>}<div className="history-table"><div className="history-table-head"><span>نام فایل</span><span>حجم</span><span>زمان انتقال</span><span>وضعیت</span><span/></div>{historyLoading ? <div className="history-empty"><LoaderCircle size={24} className="spin"/><span>در حال دریافت انتقال‌ها…</span></div> : historyError ? <div className="history-empty"><Info size={25}/><span>{historyError}</span><button className="text-button" onClick={loadHistory}>تلاش مجدد</button></div> : items.length === 0 ? <div className="history-empty"><div className="empty-files-icon"><Files size={27} strokeWidth={1.5}/></div><div><h3>{search || filter !== "all" ? "انتقالی پیدا نشد" : "اولین فایل، اولین پُل."}</h3><p>{search || filter !== "all" ? "فیلتر یا عبارت جست‌وجو را تغییر دهید." : "فایل‌ها را بفرستید؛ ردِ مسیرشان اینجا می‌ماند."}</p></div>{full && <button className="text-button" onClick={startTransfer}>شروع انتقال<ArrowLeft size={15}/></button>}</div> : items.map((item) => <div className="history-row" key={item.id}><button className="history-file-cell" onClick={() => setSelected(item)}><FileGlyph name={item.files[0]?.name || "file"}/><div><b dir="auto">{item.files[0]?.name || "فایل‌ها"}{item.fileCount > 1 && <span className="more-files">+{(item.fileCount - 1).toLocaleString("fa-IR")}</span>}</b><span className="transfer-direction">{isReceived(item) ? <ArrowDownLeft size={12}/> : <ArrowUpRight size={12}/>} {isReceived(item) ? "دریافت از دستگاه دیگر" : "ارسال به دستگاه دیگر"}</span></div></button><span className="history-size" dir="ltr">{formatSize(item.totalSize)}</span><span className="history-time">{relativeTime(item.completedAt || item.createdAt)}</span><span className="transfer-status"><span/>آمادهٔ دریافت</span><div className="history-row-actions"><button className="icon-button small" aria-label="کپی لینک انتقال" title="کپی لینک" onClick={() => copy(`${origin}/r/${item.code}`)}><Link2 size={16}/></button><a className="icon-button small" href={`/api/transfers/${item.code}/download`} aria-label="دریافت فایل‌ها" title="دریافت"><Download size={16}/></a>{item.isOwner && <button className="icon-button small delete-action" onClick={() => setDeleting(item)} aria-label="حذف انتقال" title="حذف"><Trash2 size={15}/></button>}</div></div>)}</div><div className="history-card-footer"><Clock3 size={13}/><span>انتقال‌ها تا ۲۴ ساعت در این دستگاه نمایش داده می‌شوند.</span><span className="history-footer-private"><ShieldCheck size={13}/>فقط برای شما</span></div></section>;
  }

  return <div className="app-shell">{mobileMenu && <div className="sidebar-backdrop" onClick={() => setMobileMenu(false)}/>}<aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}><button className="sidebar-brand-button" onClick={() => navigate("home")} aria-label="پُل، صفحه اصلی"><Brand/></button><button className="mobile-sidebar-close icon-button" onClick={() => setMobileMenu(false)} aria-label="بستن منو"><X size={20}/></button><div className="sidebar-nav-label">فضای شما</div><nav className="main-nav" aria-label="منوی اصلی"><button className={section === "home" ? "active" : ""} onClick={() => navigate("home")}><Send size={19}/><span>انتقال فایل</span><ChevronLeft className="nav-arrow" size={16}/></button><button className={section === "history" ? "active" : ""} onClick={() => navigate("history")}><History size={20}/><span>انتقال‌های من</span>{history.length > 0 && <span className="nav-count">{history.length.toLocaleString("fa-IR")}</span>}</button><button className={section === "guide" ? "active" : ""} onClick={() => navigate("guide")}><BookOpen size={19}/><span>راهنمای استفاده</span></button></nav><div className="nav-divider"/><nav className="secondary-nav" aria-label="تنظیمات و پشتیبانی"><button onClick={() => { setContactOpen(true); setMobileMenu(false); }}><MessageCircle size={19}/><span>راه‌های ارتباط</span></button><button onClick={() => { setDeviceDraft(deviceName); setModal("settings"); setMobileMenu(false); }}><Settings2 size={19}/><span>تنظیمات</span></button><button onClick={() => { setModal("feedback");(false); }}><MessageSquare size={19}/><span>بازخورد شما</span></button></nav><button onClick={() => { setContactOpen(true); setMobileMenu(false); }}><MessageCircle size={19}/><span>راه‌های ارتباط</span></button><div className="sidebar-device"><span className="device-icon"><Laptop size={22}/><i/></span><div><b>{deviceName}</b><span dir="auto">{devicePlatform}</span></div><span className="device-online-dot" title="این دستگاه"/></div><div className="sidebar-bottom"><div className="sidebar-promo"><div className="promo-illustration" aria-hidden="true"><span className="promo-phone"><Smartphone size={27} strokeWidth={1.4}/></span><span className="promo-dots">···</span><span className="promo-laptop"><Monitor size={42} strokeWidth={1.4}/></span><span className="promo-star"><Sparkles size={14}/></span></div><h3>هر دستگاهی، یک پُل</h3><p>بدون نصب، همه‌جا همراه شما.</p><button onClick={installApp}>افزودن به دستگاه<ArrowLeft size={14}/></button></div><div className="sidebar-footer"><span className="tiny-brand-dot"/>ساخته شده برای نزدیک‌تر شدن</div><span className="sidebar-version">نسخهٔ وب · ۱.۰</span></div></aside>
    <div className="app-main"><header className="topbar"><div className="topbar-path"><button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="باز کردن منو"><Menu size={21}/></button><LayoutGrid size={17}/><span>فضای انتقال</span><ChevronLeft size={13}/><b>{section === "home" ? "انتقال فایل" : section === "history" ? "انتقال‌های من" : "راهنمای استفاده"}</b></div><div className="topbar-actions"><span className={`online-status ${!online ? "is-offline" : ""}`}><span/>{online ? "آمادهٔ انتقال" : "بدون اتصال اینترنت"}</span><span className="topbar-divider"/><button className="topbar-contact" onClick={() => setContactOpen(true)} aria-label="راه‌های ارتباط"><MessageCircle size={17}/><span>راه‌های ارتباط</span></button><button className="icon-button help-button" onClick={() => navigate("guide")} aria-label="راهنمای انتقال فایل"><CircleHelp size={20}/></button><button className="topbar-device" onClick={() => { setDeviceDraft(deviceName); setModal("settings"); }} aria-label="تنظیمات دستگاه"><Laptop size={19}/></button></div></header>
      <main className="main-content" ref={contentRef}><div className="page-heading"><div><div className="page-eyebrow"><span/>ساده‌تر از همیشه</div><h1>{section === "home" ? <>انتقال فایل، <span>بدون فاصله.</span></> : section === "history" ? <>فایل‌ها رفتند، <span>مسیرشان اینجاست.</span></> : <>یک پُل، <span>سه قدم ساده.</span></>}</h1><p>{section === "home" ? "از گوشی به کامپیوتر و هر دستگاه دیگر؛ سریع، ساده و بدون ثبت‌نام." : section === "history" ? "انتقال‌های فعال خود را ببینید، دوباره به اشتراک بگذارید یا دریافت کنید." : "هر چیزی که برای یک انتقال بی‌دردسر نیاز دارید."}</p></div><div className="platform-support"><div className="platform-icons"><span title="اندروید"><PlatformIcon platform="android" size={19}/></span><span title="آیفون و مک"><PlatformIcon platform="apple" size={20}/></span><span title="ویندوز"><PlatformIcon platform="windows" size={17}/></span></div><span>با همهٔ دستگاه‌ها سازگار</span></div></div>
        {section === "home" ? <><div className="transfer-grid"><section className="transfer-card"><div className="transfer-card-header"><div className="transfer-tabs" role="tablist" aria-label="نوع انتقال"><button role="tab" aria-selected={tab === "send"} className={tab === "send" ? "active" : ""} onClick={() => setTab("send")}><ArrowUpRight size={19}/>ارسال فایل</button><button role="tab" aria-selected={tab === "receive"} disabled={uploadBusy} className={tab === "receive" ? "active" : ""} onClick={() => setTab("receive")}><ArrowDownLeft size={19}/>دریافت فایل</button></div><span className="transfer-card-badge"><Zap size={12}/>بدون ثبت‌نام</span></div><div className="transfer-card-body" role="tabpanel">{tab === "send" ? result ? <TransferSuccess transfer={result} origin={origin} onCopy={copy} onReset={() => setResult(null)}/> : <TransferUploader onComplete={complete} onBusyChange={setUploadBusy}/> : <ReceivePanel/>}</div></section><ConnectionCard inbox={inbox} origin={origin} error={inboxError} onRefresh={() => loadInbox(true)} onCopy={copy}/></div><div className="feature-grid"><div className="feature-card"><span className="feature-icon feature-purple"><Zap size={21} strokeWidth={1.7}/></span><div><h3>بی‌معطلی، بی‌دردسر</h3><p>نه حساب کاربری، نه مراحل اضافه.</p></div></div><div className="feature-card"><span className="feature-icon feature-blue"><Monitor size={21} strokeWidth={1.7}/></span><div><h3>هر فایل، هر دستگاه</h3><p>اندروید، آیفون، ویندوز و مک.</p></div></div><div className="feature-card"><span className="feature-icon feature-green"><ShieldCheck size={21} strokeWidth={1.7}/></span><div><h3>خصوصی و موقتی</h3><p>لینک اختصاصی، حذف پس از ۲۴ ساعت.</p></div></div></div>{historyCard()}</> : section === "history" ? <><div className="history-stats"><div><span className="feature-icon feature-purple"><ArrowRightLeft size={23}/></span><div><p>انتقال‌های فعال</p><b>{history.length.toLocaleString("fa-IR")}</b></div></div><div><span className="feature-icon feature-blue"><FileStack size={23}/></span><div><p>حجم جابه‌جا شده</p><b dir="ltr">{formatSize(history.reduce((sum, item) => sum + item.totalSize, 0))}</b></div></div><div><span className="feature-icon feature-green"><Download size={23}/></span><div><p>دفعات دریافت</p><b>{history.reduce((sum, item) => sum + item.downloads, 0).toLocaleString("fa-IR")}</b></div></div></div>{historyCard(true)}</> : <Guide onStart={startTransfer}/>}
        <footer className="main-footer"><span>کمی نزدیک‌تر، با پُل.</span><span><Globe2 size={13}/>بدون مرز، برای همه</span></footer>
      </main>
    </div>
    {toast && <div className={`toast ${toast.error ? "toast-error" : ""}`} role="status">{toast.error ? <Info size={19}/> : <span className="toast-check"><Check size={14}/></span>}<span>{toast.message}</span><button aria-label="بستن پیام" onClick={() => setToast(null)}><X size={15}/></button></div>}
    {contactOpen && <ContactPopup onClose={() => setContactOpen(false)} onUpload={() => { setContactOpen(false); if (!uploadBusy) { setSection("home"); setTab("send"); } }}/>}
    {modal === "settings" && <Modal title="تنظیمات این دستگاه" onClose={closeModal}><form onSubmit={(event) => { event.preventDefault(); const name = deviceDraft.trim() || "دستگاه شما"; setDeviceName(name); try { localStorage.setItem("pol_device_name", name); } catch { /* optional persistence */ } setModal(null); notify("نام دستگاه ذخیره شد."); }}><p className="modal-description">حسابی در کار نیست؛ این تنظیمات فقط برای مرورگر شماست.</p><label className="form-label" htmlFor="device-name">نام دستگاه</label><input id="device-name" className="form-input" value={deviceDraft} onChange={(event) => setDeviceDraft(event.target.value)} maxLength={40} placeholder="مثلاً کامپیوتر من"/><div className="settings-info-row"><span><Clock3 size={17}/>زمان نگه‌داری فایل‌ها</span><b>۲۴ ساعت</b></div><div className="privacy-note"><ShieldCheck size={20}/><p>تاریخچه با یک شناسهٔ ناشناس در همین مرورگر نگه‌داری می‌شود. لینک دریافت را فقط با افراد مورد اعتماد به اشتراک بگذارید.</p></div><button className="button button-primary full-width" type="submit">ذخیرهٔ تغییرات<Check size={16}/></button></form></Modal>}
    {modal === "feedback" && <Modal title="پُل را بهتر بسازیم" onClose={closeModal}><form onSubmit={sendFeedback}><p className="modal-description">پیشنهاد یا مشکلی دارید؟ بدون وارد کردن مشخصات، برایمان بنویسید.</p><label className="form-label" htmlFor="feedback">پیام شما</label><textarea id="feedback" className="form-textarea" rows={5} value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} placeholder="تجربهٔ انتقال فایل چطور بود؟" minLength={5} maxLength={2000} required/><div className="character-count">{feedbackMessage.length.toLocaleString("fa-IR")} / ۲۰۰۰</div><button className="button button-primary full-width" type="submit" disabled={busy || feedbackMessage.trim().length < 5}>{busy ? <LoaderCircle className="spin" size={17}/> : <Send size={17}/>}ارسال بازخورد</button></form></Modal>}
    {modal === "install" && <Modal title="پُل، همیشه دم دست" onClose={closeModal}><p className="modal-description">استفاده از پُل به نصب نیاز ندارد. برای دسترسی سریع‌تر، آن را به صفحهٔ اصلی اضافه کنید.</p><div className="install-instruction"><PlatformIcon platform="apple" size={25}/><div><h3>آیفون و آیپد</h3><p>در Safari، دکمهٔ اشتراک‌گذاری را بزنید و «Add to Home Screen» را انتخاب کنید.</p></div></div><div className="install-instruction"><PlatformIcon platform="android" size={25}/><div><h3>اندروید</h3><p>در منوی سه‌نقطهٔ Chrome، «Add to Home screen» یا «Install app» را انتخاب کنید.</p></div></div><div className="install-instruction"><PlatformIcon platform="windows" size={22}/><div><h3>ویندوز و مک</h3><p>از گزینهٔ نصب برنامه در نوار آدرس Chrome یا منوی Apps در Edge استفاده کنید.</p></div></div><button className="button button-primary full-width" onClick={closeModal}>متوجه شدم<Check size={17}/></button></Modal>}
    {selected && <Modal title="جزئیات انتقال" onClose={closeModal} wide>{selected.isOwner && selected.kind === "send" ? <TransferSuccess transfer={selected} origin={origin} onCopy={copy} onReset={() => { setSelected(null); startTransfer(); }}/> : <TransferDownloads transfer={selected}/>}</Modal>}
    {deleting && <Modal title="این انتقال حذف شود؟" onClose={closeModal}><div className="delete-warning"><Trash2 size={30}/><p>فایل‌ها از سرور حذف می‌شوند و لینک دریافت دیگر کار نخواهد کرد. این کار قابل بازگشت نیست.</p></div><div className="modal-actions"><button className="button button-danger" onClick={removeTransfer} disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <Trash2 size={17}/>}حذف انتقال</button><button className="button button-outline" onClick={closeModal}>انصراف</button></div></Modal>}
  </div>;
}
