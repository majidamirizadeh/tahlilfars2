/* رجیستری Datasetها — افزودن Dataset جدید = یک ورودی اینجا + یک پردازشگر در processors/ (+ tools/build-manifest.mjs). Engineهای قبلی تغییر نمی‌کنند. */
export const DATASETS = {
  main: { id: "main", label: "گزارش 1520", file: "./data/1520.xlsx", processor: "1520", primary: true },
  trend: { id: "trend", label: "گزارش 150 (روند ماهانه)", file: "./data/150.xlsx", processor: "150" }
  /* reading: { id:"reading", label:"گزارش قرائت", file:"./data/reading.xlsx", processor:"reading" } */
};
/* processor id → ماژول؛ هر ماژول: export const version; process(raw); validate(processed, raw, ctx) */
export const PROCESSORS = { "1520": "./processors/report1520.js", "150": "./processors/report150.js" /* , reading: "./processors/reading.js" */ };
