import en from "../i18n/landing.en.json";
import es from "../i18n/landing.es.json";
import { safeGet, safeSet } from "./storage";

type Lang = "es" | "en";
type Key = keyof typeof es;

// Shared with the playground so a visitor's choices follow them between pages.
const LANG_STORAGE = "jev-chat-moderator.lang";
const THEME_STORAGE = "jev-chat-moderator.theme";

const dicts: Record<Lang, Record<Key, string>> = { es, en };

function setLang(lang: Lang) {
  safeSet(LANG_STORAGE, lang);
  document.documentElement.lang = lang;
  const t = (key: string) => dicts[lang][key as Key] ?? key;
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n!);
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria!));
  for (const el of document.querySelectorAll<HTMLImageElement>("[data-i18n-alt]")) el.alt = t(el.dataset.i18nAlt!);
  for (const el of document.querySelectorAll<HTMLImageElement>("[data-src-en]")) {
    el.src = lang === "en" ? el.dataset.srcEn! : el.dataset.srcEs!;
  }
  document.title = t("meta.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
}

const saved = safeGet(LANG_STORAGE);
const initial: Lang = saved === "es" || saved === "en" ? saved : navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
// The page is rendered in Spanish; only swap when needed.
if (initial !== "es") setLang(initial);
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
  b.addEventListener("click", () => setLang(b.dataset.lang as Lang));
}

document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const root = document.documentElement;
  const current = root.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  safeSet(THEME_STORAGE, next);
});
