"use client";

import { ArrowLeft, Camera, ChevronDown, Download, FileUp, Link2, MessageSquare, Monitor, ShieldCheck, Smartphone, Wifi } from "lucide-react";

const questions = [
  ["طرف مقابل باید پُل را نصب کند؟", "نه. کافی است لینک را در مرورگر باز کند یا QR را با دوربین گوشی اسکن کند. پُل در Chrome، Safari و Edge کار می‌کند."],
  ["باید به یک شبکهٔ وای‌فای وصل باشیم؟", "خیر. هر دو دستگاه فقط به اینترنت نیاز دارند و لازم نیست در یک شبکه باشند. سرعت انتقال به سرعت اینترنت دو دستگاه بستگی دارد."],
  ["چه فایل‌هایی و با چه حجمی می‌توانم بفرستم؟", "همهٔ فرمت‌ها پشتیبانی می‌شوند. مجموع حجم هر انتقال حداکثر ۲ گیگابایت است و می‌توانید تا ۱۰۰ فایل در یک انتقال انتخاب کنید."],
  ["فایل‌ها چقدر نگه‌داری می‌شوند؟", "لینک فایل‌ها تا ۲۴ ساعت پس از پایان ارسال فعال است. سپس دسترسی قطع می‌شود و فایل‌ها در پاک‌سازی دوره‌ای حذف می‌شوند. فرستنده می‌تواند انتقال را زودتر از تاریخچه حذف کند."],
  ["چه کسی به فایل‌ها دسترسی دارد؟", "هر کسی که لینک یا کد دریافت را داشته باشد می‌تواند فایل را دانلود کند؛ پس فقط آن را با افراد مورد اعتماد به اشتراک بگذارید. انتقال روی اینترنت و با ذخیرهٔ موقت روی سرور انجام می‌شود."],
];

export default function Guide({ onStart, onInstall, onFeedback }: {
  onStart: () => void;
  onInstall: () => void;
  onFeedback: () => void;
}) {
  return <div className="guide-content"><div className="guide-steps">{[{ icon: FileUp, title: "فایل‌ها را انتخاب کنید", text: "فایل‌ها را بکشید و رها کنید یا از حافظهٔ دستگاه انتخاب کنید." }, { icon: Link2, title: "یک پُل بسازید", text: "لینک، QR یا کد ۶ رقمی را در اختیار دستگاه دیگر قرار دهید." }, { icon: Monitor, title: "در مقصد دریافت کنید", text: "لینک را باز کنید و فایل‌ها را تکی یا یک‌جا دریافت کنید." }].map((step, index) => <div className="guide-step" key={step.title}><span className="guide-step-number">۰{index + 1}</span><span className="guide-step-icon"><step.icon size={27} strokeWidth={1.6}/></span><h3>{step.title}</h3><p>{step.text}</p></div>)}</div><section className="android-guide"><div><span className="guide-eyebrow">مسیر محبوب</span><h2>ارسال از گوشی به کامپیوتر</h2><p>پُل را روی کامپیوتر باز کنید. در گوشی «کد کامپیوتر را دارم» را بزنید و کد ۶ رقمی را وارد کنید، یا QR روی کامپیوتر را اسکن کنید. فایل‌ها پس از ارسال در همان کارت کامپیوتر ظاهر می‌شوند.</p><button className="button button-white" onClick={onStart}>شروع انتقال<ArrowLeft size={17}/></button></div><div className="device-diagram" aria-hidden="true"><div className="diagram-phone"><Smartphone size={63} strokeWidth={1.2}/><span><Camera size={15}/></span></div><div className="diagram-connection"><i/><span>↔</span><i/></div><div className="diagram-monitor"><Monitor size={102} strokeWidth={1.1}/><span><ShieldCheck size={27}/></span></div></div></section><section className="guide-help" aria-labelledby="guide-help-title">
        <h2 id="guide-help-title">نصب و بازخورد</h2>
        <div className="guide-help-actions">
          <button type="button" onClick={onInstall}>
            <span className="guide-help-icon"><Download size={20}/></span>
            <span><strong>افزودن پُل به دستگاه</strong><small>دسترسی سریع از صفحهٔ اصلی یا دسکتاپ</small></span>
            <ArrowLeft size={17} aria-hidden="true"/>
          </button>
          <button type="button" onClick={onFeedback}>
            <span className="guide-help-icon"><MessageSquare size={20}/></span>
            <span><strong>ارسال بازخورد</strong><small>گزارش مشکل یا پیشنهاد، بدون وارد کردن مشخصات</small></span>
            <ArrowLeft size={17} aria-hidden="true"/>
          </button>
        </div>
      </section>
      <section className="faq-card"><h2>شاید سؤال شما هم باشد</h2>{questions.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17}/></summary><p>{answer}</p></details>)}</section>
      <div className="guide-note"><Wifi size={16}/><span>برای انتقال، هر دو دستگاه باید به اینترنت متصل باشند. نیازی به نصب نرم‌افزار نیست.</span></div></div>;
}
