# پُل — انتقال فایل بدون ثبت‌نام

پُل یک وب‌اپ انتقال فایل است: فایل را با لینک، QR یا کد ۶ رقمی بین اندروید، آیفون، ویندوز و مک جابه‌جا می‌کند. دریافت‌کننده هیچ برنامه یا حساب کاربری لازم ندارد.

این نسخه از **Supabase** برای پایگاه داده و فضای ذخیره‌سازی استفاده می‌کند. فایل‌ها مستقیم از مرورگر به Supabase آپلود می‌شوند و سرور Next.js فقط signed URL می‌سازد؛ پس روی پلن رایگان Vercel یا هر میزبان دیگری هم اجرا می‌شود.

## چه چیزی نیاز دارید

- یک حساب رایگان [Supabase](https://supabase.com)
- یک حساب رایگان [Vercel](https://vercel.com) (یا هر Node.js hostی)
- کد این پروژه (روی GitHub push کنید تا Vercel از همان‌جا deploy کند)

## ۱. ساخت پروژهٔ Supabase

1. وارد [supabase.com](https://supabase.com) شوید و **New project** بزنید.
2. یک نام (مثلاً `pol`) و رمز عبور دیتابیس انتخاب کنید. رمز را جای امنی نگه دارید.
3. نزدیک‌ترین Region به کاربران‌تان را انتخاب کنید.
4. ساخت پروژه چند دقیقه طول می‌کشد. صبر کنید تا وضعیت **Active** شود.

## ۲. ساخت جدول‌ها و باکت فایل

در داشبورد Supabase:

1. به **SQL Editor** بروید و **New query** بزنید.
2. محتوای فایل [`supabase/schema.sql`](supabase/schema.sql) این پروژه را کپی کنید و اجرا کنید. این کار جدول‌های پُل و باکت خصوصی `transfers` را می‌سازد.
3. به **Storage** بروید و مطمئن شوید باکت `transfers` ساخته شده و **Public** نیست.

## ۳. کپی کردن کلیدها

در **Project Settings → API** این‌ها را کپی کنید:

- **Project URL** — چیزی شبیه `https://abcxyz.supabase.co`
- **service_role key** — کلید طولانی. **هرگز** آن را به مرورگر یا Git commit نفرستید.

در **Project Settings → Database → Connection string** این را کپی کنید:

- گزینهٔ **Session** یا **Transaction** از بخش **Pooler** را انتخاب کنید (`aws-1-*.pooler.supabase.com`). حالت **direct** برای سرورلس مناسب نیست.
- در URI مقدار `[YOUR-PASSWORD]` را با رمز دیتابیس‌تان جایگزین کنید.

## ۴. اجرا روی کامپیوتر خودتان (اختیاری، برای تست)

```powershell
git clone YOUR-REPO-URL pol
cd pol
Copy-Item .env.example .env
notepad .env
npm install
npm run dev
```

در فایل `.env` مقدارها را از داشبورد Supabase وارد کنید:

```env
DATABASE_URL=postgresql://postgres.YOUR-REF:YOUR-PASSWORD@aws-1-region.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://YOUR-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...service-role-key
SUPABASE_STORAGE_BUCKET=transfers
COOKIE_SECURE=false
```

سپس در مرورگر باز کنید:

```text
http://localhost:3000
```

اگر می‌خواهید گوشی هم به همین نسخه وصل شود، به جای `localhost` از IP کامپیوتر در شبکه استفاده کنید (`ipconfig` را اجرا کنید تا IP را ببینید):

```powershell
npm run dev -- -H 0.0.0.0 -p 3000
```

سپس روی ویندوز `http://192.168.1.25:3000` را باز کنید و QR بخش «از گوشی به این دستگاه» را با گوشی اسکن کنید.

## ۵. انتشار روی Vercel (رایگان)

1. کد را روی یک repo در GitHub push کنید.
2. در [vercel.com](https://vercel.com/new) روی **Add New → Project** بزنید و مخزن را انتخاب کنید.
3. در مرحلهٔ **Environment Variables** این کلیدها را دقیقاً همان‌طور که در `.env.example` هست وارد کنید:

   | نام | مقدار |
   | --- | --- |
   | `DATABASE_URL` | Connection string سِشِن/Pooler از Supabase |
   | `SUPABASE_URL` | Project URL از Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | کلید service_role از Supabase |
   | `SUPABASE_STORAGE_BUCKET` | `transfers` |

   متغیر `COOKIE_SECURE` را روی Vercel وارد نکنید تا مقدار پیش‌فرض امن (HTTPS) استفاده شود.

4. **Deploy** بزنید. Vercel به‌طور خودکار یک دامنه مثل `pol-xxxx.vercel.app` می‌دهد.
5. صفحه را باز کنید. QR اکنون به همان دامنهٔ Vercel اشاره می‌کند و از هر گوشی‌ای که QR را اسکن کند، فایل مستقیم به Supabase Storage آپلود می‌شود.

اگر بعداً دامنهٔ اختصاصی خودتان (مثلاً `pol.example.com`) را در Vercel وصل کنید، QR خودکار همان دامنه را می‌سازد؛ نیازی به تغییر کد نیست.

## چطور کار می‌کند؟

- **Next.js API روی Vercel** فقط رکورد انتقال و متادیتای هر فایل را در Supabase Postgres می‌سازد و برای هر آپلود/دانلود یک **signed URL کوتاه‌مدت** از Supabase Storage درخواست می‌کند.
- **مرورگر کاربر** فایل را با آن signed URL مستقیم به Supabase می‌فرستد. سرور Vercel هیچ‌وقت خودِ فایل را نمی‌گیرد، پس محدودیت حجم درخواست سرورلس هم محدودتان نمی‌کند.
- **دانلود** هم با redirect به یک signed URL دیگر انجام می‌شود؛ باز هم بدون عبور از سرور.
- **فضای Free**: پلن رایگان Supabase حدود ۱ گیگابایت Storage و ۵ گیگابایت پهنای باند در ماه می‌دهد. برای شروع کافی است. حداکثر حجم هر فایل روی Free تا حدود ۵۰ مگابایت است؛ برای فایل‌های بزرگ‌تر باید پلن Pro Supabase را فعال کنید (سقف را می‌توانید در Storage → Policies بالا ببرید).
- **پاک‌سازی خودکار**: هر انتقال ۲۴ ساعت بعد منقضی می‌شود. پُل هنگام هر درخواست، انتقال‌های منقضی‌شده را از دیتابیس و از Supabase Storage حذف می‌کند.

## دو مسیر انتقال

- **ارسال فایل** در ستون اصلی: فایل را از دستگاه فعلی آپلود می‌کند و در پایان یک **لینک دریافت** می‌سازد. آن لینک فقط برای دانلود است.
- **از گوشی به این دستگاه** در کارت تیره: QR/کدی می‌سازد که گوشی را به کامپیوتر مقصد وصل می‌کند تا گوشی بتواند آپلود کند.

اگر روی گوشی پیام «این لینک برای دریافت فایل است» دیدید، به جای لینک دریافت، QR یا کد کارت **«از گوشی به این دستگاه»** را استفاده کنید.

## عیب‌یابی سریع

- **آپلود از مرورگر گیر می‌کند**: به Supabase Dashboard → **Logs → Storage** بروید و ببینید ارور signed URL چیست. معمولاً یعنی `SUPABASE_URL` یا `SUPABASE_SERVICE_ROLE_KEY` روی Vercel اشتباه وارد شده.
- **خطای اتصال دیتابیس**: مطمئن شوید از رشتهٔ **Pooler** استفاده کرده‌اید نه direct، و رمز دیتابیس درست است.
- **پس از تغییر اسکیمای Drizzle می‌خواهید apply کنید**: می‌توانید `.env` را کامل کنید و روی کامپیوتر خودتان اجرا کنید:

  ```powershell
  npm exec drizzle-kit push
  ```

  یا اسکیمای جدید را به شکل SQL در **Supabase SQL Editor** اجرا کنید.

- **پروژه Free بعد از ۷ روز بی‌فعالیتی pause می‌شود**: کافی است یک بار به داشبورد Supabase وارد شوید و آن را resume کنید.
#   C r o s s - p l a t f o r m  
 #   C r o s s - p l a t f o r m  
 