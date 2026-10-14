import en from "@/dictionaries/en.json";
import zh from "@/dictionaries/zh-CN.json";
import bn from "@/dictionaries/bn-BD.json";
import type { Locale } from "./config";
export function normalizeLocale(value: string): Locale {
  return value === "zh-CN" || value === "bn-BD" ? value : "en";
}
export const dictionaries: Record<Locale, Record<string, string>> = {
  en,
  "zh-CN": zh,
  "bn-BD": bn,
};
export function dictionary(locale: string) {
  return dictionaries[normalizeLocale(locale)];
}
export function translator(locale: string) {
  const d = dictionary(locale);
  return (key: string) => d[key] || key;
}
