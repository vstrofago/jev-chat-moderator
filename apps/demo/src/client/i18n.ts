import en from "../i18n/en.json";
import es from "../i18n/es.json";
import { safeGet, safeSet } from "./storage";

export type Lang = "es" | "en";
export type Key = keyof typeof es;

const dicts: Record<Lang, Record<Key, string>> = { es, en };
const STORAGE_KEY = "jev-chat-moderator.lang";

let lang: Lang = initialLang();

function initialLang(): Lang {
  const saved = safeGet(STORAGE_KEY);
  if (saved === "es" || saved === "en") return saved;
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

export const t = (key: Key): string => dicts[lang][key] ?? key;
export const currentLang = () => lang;

export function setLang(next: Lang): void {
  lang = next;
  safeSet(STORAGE_KEY, next);
  document.documentElement.lang = next;
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n as Key);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria as Key));
  }
  for (const el of document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder as Key);
  }
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
    b.setAttribute("aria-pressed", String(b.dataset.lang === next));
  }
}
