import { createContext } from "preact";
import { useContext } from "preact/hooks";
import en from "../i18n/en.json";
import es from "../i18n/es.json";

export type Lang = "en" | "es";
const STRINGS: Record<Lang, Record<string, string>> = { en, es };
const KEY = "vigia.lang";

/** Each viewer picks their own UI language; the bot's chat language lives in vigia.yaml. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {}
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {}
}

export function translate(lang: Lang, key: string, vars: Record<string, string | number> = {}) {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

export const LangContext = createContext<Lang>("en");

export function useT() {
  const lang = useContext(LangContext);
  return (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
