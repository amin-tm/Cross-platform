import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "پُل — انتقال فایل",
    short_name: "پُل",
    description: "انتقال سادهٔ فایل بین همهٔ دستگاه‌ها، بدون حساب کاربری",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8fc",
    theme_color: "#5754e8",
    lang: "fa",
    dir: "rtl",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
