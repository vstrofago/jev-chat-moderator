import en from "../i18n/landing.en.json";
import es from "../i18n/landing.es.json";
import { safeGet, safeSet } from "./storage";

type Lang = "es" | "en";
type Key = keyof typeof es;

// Shared with the playground so a visitor's choices follow them between pages.
const LANG_STORAGE = "jev-chat-moderator.lang";
const THEME_STORAGE = "jev-chat-moderator.theme";

const dicts: Record<Lang, Record<Key, string>> = { es, en };
let currentLang: Lang = "es";

function setLang(lang: Lang) {
  safeSet(LANG_STORAGE, lang);
  document.documentElement.lang = lang;
  const t = (key: string) => dicts[lang][key as Key] ?? key;
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n!);
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria!));
  for (const el of document.querySelectorAll<HTMLImageElement>("[data-i18n-alt]")) el.alt = t(el.dataset.i18nAlt!);
  for (const el of document.querySelectorAll<HTMLImageElement | HTMLVideoElement>("[data-src-en]")) {
    el.src = lang === "en" ? el.dataset.srcEn! : el.dataset.srcEs!;
  }
  for (const el of document.querySelectorAll<HTMLVideoElement>("[data-poster-en]")) {
    el.poster = lang === "en" ? el.dataset.posterEn! : el.dataset.posterEs!;
  }
  for (const el of document.querySelectorAll<HTMLAnchorElement>("[data-href-en]")) {
    el.href = lang === "en" ? el.dataset.hrefEn! : el.dataset.hrefEs!;
  }
  currentLang = lang;
  labelDownload();
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

// The hero's grid drifts a little, at most 14px, following the cursor.
const gridBg = document.getElementById("grid-bg");
const finePointer = matchMedia("(pointer: fine)").matches;
if (gridBg && !reduceMotion && finePointer) {
  const hero = gridBg.parentElement!;
  hero.addEventListener("pointermove", (e) => {
    const b = hero.getBoundingClientRect();
    const dx = ((e.clientX - b.left) / b.width - 0.5) * -28;
    const dy = ((e.clientY - b.top) / b.height - 0.5) * -20;
    gridBg.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  });
  hero.addEventListener("pointerleave", () => (gridBg.style.transform = ""));
}

// Feature tour: the dashboard's tabs as a slideshow. It advances on its own while it is on
// screen, pauses on hover or focus, and follows the arrow keys like any tab list.
const tour = document.querySelector<HTMLElement>(".tour");
if (tour) {
  const SLIDE_MS = 6000;
  const tabs = [...tour.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const shots = [...tour.querySelectorAll<HTMLElement>(".tour-shot")];
  const video = tour.querySelector("video");
  const slideMs = (i: number) => Number(tabs[i].dataset.ms) || SLIDE_MS;
  const panel = tour.querySelector<HTMLElement>('[role="tabpanel"]')!;
  const fig = document.getElementById("tour-fig");
  let current = 0;
  let timer = 0;
  let visible = false;
  let hovered = false;

  const show = (i: number, focus = false) => {
    current = (i + tabs.length) % tabs.length;
    tabs.forEach((tab, j) => {
      const on = j === current;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      // Restart the progress line on the tab that just became active.
      const bar = tab.querySelector<HTMLElement>(".tour-progress");
      if (bar && on) {
        bar.style.animation = "none";
        void bar.offsetWidth;
        bar.style.animation = "";
      }
    });
    shots.forEach((img, j) => img.classList.toggle("on", j === current));
    tour.style.setProperty("--tour-ms", `${slideMs(current)}ms`);
    panel.setAttribute("aria-labelledby", tabs[current].id);
    if (fig) fig.textContent = String(current + 1).padStart(2, "0");
    if (focus) tabs[current].focus();
    schedule();
  };
  const running = () => visible && !hovered && !reduceMotion;
  if (video && reduceMotion) video.controls = true;
  const schedule = () => {
    clearTimeout(timer);
    tour.classList.toggle("paused", !running());
    if (running()) timer = window.setTimeout(() => show(current + 1), slideMs(current));
    // The demo video plays only while its slide is on screen; with reduced motion it waits
    // for the viewer to press play.
    if (video) {
      if (current === 0 && visible && !reduceMotion) {
        if (video.paused) {
          video.currentTime = 0;
          void video.play().catch(() => {});
        }
      } else if (!video.paused) video.pause();
    }
  };

  tabs.forEach((tab, i) => tab.addEventListener("click", () => show(i)));
  tour.querySelector('[role="tablist"]')!.addEventListener("keydown", (e) => {
    const key = (e as KeyboardEvent).key;
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[key];
    if (step) {
      e.preventDefault();
      show(current + step, true);
    } else if (key === "Home" || key === "End") {
      e.preventDefault();
      show(key === "Home" ? 0 : tabs.length - 1, true);
    }
  });
  tour.addEventListener("pointerenter", () => ((hovered = true), schedule()));
  tour.addEventListener("pointerleave", () => ((hovered = false), schedule()));
  tour.addEventListener("focusin", () => ((hovered = true), schedule()));
  tour.addEventListener("focusout", () => ((hovered = false), schedule()));
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      schedule();
    }, { threshold: 0.35 }).observe(tour);
  }
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden && visible;
    schedule();
  });

  // The screenshot tilts toward the cursor like a card in the hand, with a soft glare.
  const tilt = tour.querySelector<HTMLElement>(".tilt");
  if (tilt && !reduceMotion && finePointer) {
    tilt.addEventListener("pointermove", (e) => {
      const b = tilt.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width;
      const y = (e.clientY - b.top) / b.height;
      tilt.style.setProperty("--ry", `${((x - 0.5) * 6).toFixed(2)}deg`);
      tilt.style.setProperty("--rx", `${((0.5 - y) * 4).toFixed(2)}deg`);
      tilt.style.setProperty("--gx", `${(x * 100).toFixed(0)}%`);
      tilt.style.setProperty("--gy", `${(y * 100).toFixed(0)}%`);
    });
    tilt.addEventListener("pointerleave", () => {
      for (const p of ["--rx", "--ry"]) tilt.style.removeProperty(p);
    });
  }
}

// The download button names your system and points at its installer from the latest release.
// It falls back to the releases page when the system is unknown or GitHub can't be reached.
type Os = "win" | "mac" | "linux";
const ASSETS: Record<Os, RegExp> = { win: /-win-x64\.exe$/, mac: /-mac-arm64\.dmg$/, linux: /\.AppImage$/ };
function detectOs(): Os | null {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return null;
  if (/Windows/i.test(ua)) return "win";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Linux|X11/i.test(ua)) return "linux";
  return null;
}
function labelDownload() {
  const os = detectOs();
  const label = document.getElementById("download-label");
  if (!label || !os) return;
  const key = `install.cta.${os}` as Key;
  label.dataset.i18n = key;
  label.textContent = dicts[currentLang][key];
}
labelDownload();
const os = detectOs();
if (os) {
  fetch("https://api.github.com/repos/vstrofago/vigia/releases?per_page=10", { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : []))
    .then((releases: { draft: boolean; assets: { name: string; browser_download_url: string }[] }[]) => {
      for (const release of releases) {
        if (release.draft) continue;
        const asset = release.assets.find((a) => ASSETS[os].test(a.name));
        if (asset) {
          document.getElementById("download")?.setAttribute("href", asset.browser_download_url);
          return;
        }
      }
    })
    .catch(() => {});
}

// Copy buttons on code blocks.
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  button.addEventListener("click", async () => {
    const text = document.getElementById(button.dataset.copy!)?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = dicts[currentLang]["install.copied"];
      setTimeout(() => (button.textContent = dicts[currentLang]["install.copy"]), 1600);
    } catch {}
  });
}
