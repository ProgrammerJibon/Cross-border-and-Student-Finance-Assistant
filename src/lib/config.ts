export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "FinBridge AI",
  locales: ["en", "zh-CN", "bn-BD"] as const,
};
export type Locale = (typeof appConfig.locales)[number];
export const currencies = [
  "BDT",
  "CAD",
  "USD",
  "GBP",
  "EUR",
  "CNY",
  "AUD",
  "JPY",
] as const;
