#!/usr/bin/env node
/* محافظ: اگر فایل داده (Excel/CSV/…) یا هر فایلی زیر data/ (جز README.txt) در مخزن باشد، CI شکست می‌خورد.
   اجرا: node tools/check-no-data.mjs */
import {execSync} from "node:child_process";
const files = execSync("git ls-files", {encoding: "utf8"}).split("\n").filter(Boolean);
const bad = files.filter(f => /\.(xlsx|xlsm|xlsb|xls|ods|csv|tsv)$/i.test(f) || (/^data\//.test(f) && f !== "data/README.txt"));
if (bad.length) { console.error("✗ فایل داده در مخزن عمومی نباید باشد:\n  " + bad.join("\n  ")); process.exit(1); }
console.log("✓ هیچ فایل داده‌ای در مخزن نیست");
