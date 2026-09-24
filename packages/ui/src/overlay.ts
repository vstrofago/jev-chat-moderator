import type { Fragment, HighlightItem } from "@vigia/engine";

/**
 * OBS browser source: shows the highlight the host pushes over WebSocket.
 * URL parameters: key (required), lang=en|es, theme=default|minimal|neon,
 * pos=bl|br|bc|tl|tr, preview=1 (a sample card that stays, for placing it in OBS).
 */
const params = new URLSearchParams(location.search);
const key = params.get("key") ?? "";
const lang = params.get("lang") === "es" ? "es" : "en";
document.body.dataset.theme = params.get("theme") ?? "default";
document.body.dataset.pos = params.get("pos") ?? "bl";
document.documentElement.lang = lang;

const LABELS = {
  en: { question: "Question", highlight: "Highlight", announcement: "Announcement" },
  es: { question: "Pregunta", highlight: "Destacado", announcement: "Anuncio" },
} as const;

const stage = document.getElementById("stage")!;

function emoteUrl(f: Extract<Fragment, { type: "emote" }>) {
  return f.imageUrl ?? `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(f.id)}/default/dark/2.0`;
}

/** Builds the card with DOM nodes only (never innerHTML): chat text is untrusted. */
function card(item: HighlightItem): HTMLElement {
  const el = document.createElement("article");
  el.className = "card";

  const meta = document.createElement("div");
  meta.className = "meta";
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = LABELS[lang][item.kind];
  meta.append(label);
  if (item.authorName) {
    const author = document.createElement("span");
    author.className = "author";
    author.textContent = item.authorName;
    meta.append(author);
  }

  const text = document.createElement("p");
  text.className = "text";
  for (const f of item.fragments ?? [{ type: "text", text: item.text } as Fragment]) {
    if (f.type === "text") {
      text.append(document.createTextNode(f.text));
      continue;
    }
    const img = document.createElement("img");
    img.src = emoteUrl(f);
    img.alt = f.text;
    img.onerror = () => img.replaceWith(document.createTextNode(f.text));
    text.append(img);
  }

  el.append(meta, text);
  return el;
}

function show(item: HighlightItem) {
  hide();
  stage.append(card(item));
}

function hide() {
  for (const old of stage.querySelectorAll(".card:not(.leaving)")) {
    old.classList.add("leaving");
    old.addEventListener("animationend", () => old.remove(), { once: true });
  }
}

if (params.get("preview") === "1") {
  show({
    id: "preview",
    kind: "question",
    authorName: "Viewer42",
    text: lang === "es" ? "¿Qué sensibilidad usas? Kappa" : "What sensitivity do you use? Kappa",
    fragments: [
      { type: "text", text: lang === "es" ? "¿Qué sensibilidad usas? " : "What sensitivity do you use? " },
      { type: "emote", text: "Kappa", id: "25" },
    ],
    source: "rule",
  });
} else {
  let delay = 1000;
  const connect = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/overlay?key=${encodeURIComponent(key)}`);
    ws.onopen = () => (delay = 1000);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "show") show(msg.item);
      else if (msg.type === "clear") hide();
    };
    ws.onclose = () => {
      hide();
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, 10_000);
    };
  };
  connect();
}
