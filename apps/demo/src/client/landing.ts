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

// Dark is the default; light only when the visitor picks it.
document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const root = document.documentElement;
  const next = root.dataset.theme === "light" ? "dark" : "light";
  root.dataset.theme = next;
  safeSet(THEME_STORAGE, next);
  drawField();
});

// The sticky nav gains glass and a hairline only after scrolling.
const topbar = document.querySelector<HTMLElement>(".topbar");
const onScroll = () => topbar?.classList.toggle("scrolled", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Reveal: each section's one moment fades in once.
const revealed = document.querySelectorAll<HTMLElement>("[data-reveal]");
if (reduceMotion || !("IntersectionObserver" in window)) {
  for (const el of revealed) el.classList.add("shown");
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("shown");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px" },
  );
  for (const el of revealed) io.observe(el);
}

// The hero's texture: a Bayer-dithered swell of light, masked in CSS so it fades into the void.
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
const field = document.getElementById("field") as HTMLCanvasElement | null;

function drawField() {
  if (!field) return;
  const cell = 4;
  const { width, height } = field.getBoundingClientRect();
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  field.width = cols;
  field.height = rows;
  const ctx = field.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(cols, rows);
  const rgb = getComputedStyle(field).color.match(/\d+/g)?.map(Number) ?? [237, 237, 234];
  const cx = cols * 0.8;
  const cy = rows * 0.42;
  const r = Math.max(cols, rows) * 0.42;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const d = Math.hypot((x - cx) / 1.25, y - cy) / r;
      // A soft swell with slow bands running through it, like light on water.
      const v = Math.max(0, 1 - d) ** 1.6 * (0.78 + 0.22 * Math.sin(x * 0.045 + y * 0.09));
      if (v * 64 > BAYER[(y % 8) * 8 + (x % 8)]) {
        const i = (y * cols + x) * 4;
        image.data[i] = rgb[0];
        image.data[i + 1] = rgb[1];
        image.data[i + 2] = rgb[2];
        image.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

if (field) {
  field.style.imageRendering = "pixelated";
  drawField();
  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(drawField, 150);
  });
  // A little parallax, at most 14px, following the cursor.
  if (!reduceMotion && matchMedia("(pointer: fine)").matches) {
    const hero = field.parentElement!;
    hero.addEventListener("pointermove", (e) => {
      const b = hero.getBoundingClientRect();
      const dx = ((e.clientX - b.left) / b.width - 0.5) * 28;
      const dy = ((e.clientY - b.top) / b.height - 0.5) * 28;
      field.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    });
    hero.addEventListener("pointerleave", () => (field.style.transform = ""));
  }
}
