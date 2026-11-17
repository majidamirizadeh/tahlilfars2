
/* ثابت‌های مشترک */

// آدرس پایه برنامه روی GitHub Pages
export const APP_BASE = new URL("../../", import.meta.url).href;

// ساخت آدرس فایل‌های داخلی برنامه
export const appUrl = rel => new URL(rel, APP_BASE).href;

// فایل‌های داده
export const MANIFEST_URL = appUrl("data/manifest.json");

// تنظیمات IndexedDB
export const DB_NAME = "dashboard-data";
export const DB_VERSION = 1;
export const DB_STORE = "datasets";

// زمان‌های انتظار
export const MANIFEST_TIMEOUT_MS = 6000;
export const DOWNLOAD_TIMEOUT_MS = 45000;

// آدرس واقعی Google Apps Script Web App
export const API_BASE = "https://script.google.com/macros/s/AKfycby5MDvc5-yJ2XCU4lUiT29frPHi6uM-qWyHRqpBsDH2bHSa2yQt9P5wlqZso89dROkW/exec";

// دریافت امن فایل‌های اکسل از Backend
export const USE_SECURE_BACKEND = true;

// کتابخانه‌ها: ابتدا نسخه محلی، سپس CDN
export const VENDOR = {
  xlsx: [
    appUrl("vendor/xlsx/xlsx.full.min.js"),
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
  ],
  lucide: [
    appUrl("vendor/lucide/lucide.min.js"),
    "https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.min.js"
  ]
};
