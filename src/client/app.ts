import { AuthError, detectProvider, RateLimitError, type Provider } from "../core/jev-client";
import { moderate } from "../core/moderate";
import { decide, DEFAULT_THRESHOLDS } from "../core/policy";
import { createQueue } from "../core/queue";
import { CATEGORIES, type Category, type ModerationResult, type Thresholds, type Verdict } from "../core/types";
import messages from "../data/messages.json";
import replay from "../data/replay.json";
import { currentLang, setLang, t, type Key, type Lang } from "./i18n";
import { computeStats } from "./stats";
import { safeGet, safeSet } from "./storage";

interface ScriptedMessage {
  id: string;
  user: string;
  lang: string;
  text: string;
  expected: Category;
}

interface Item {
  key: number;
  user: string;
  text: string;
  expected?: Category;
  own?: boolean;
  status: "queued" | "pending" | "done" | "error";
  result?: ModerationResult;
  error?: string;
  el: HTMLLIElement;
}

const MAX_ITEMS = 150;
const KEY_STORAGE = "jev-chat-moderator.key";
const PROVIDER_STORAGE = "jev-chat-moderator.provider";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const chat = $<HTMLOListElement>("chat");
const playBtn = $<HTMLButtonElement>("play");
const speedSel = $<HTMLSelectElement>("speed");
const removeInput = $<HTMLInputElement>("remove-threshold");
const reviewInput = $<HTMLInputElement>("review-threshold");
const keyInput = $<HTMLInputElement>("api-key");
const providerSel = $<HTMLSelectElement>("provider");
const liveToggle = $<HTMLButtonElement>("live-toggle");
const liveNotice = $<HTMLParagraphElement>("live-notice");
const modeBadge = $<HTMLSpanElement>("mode-badge");
const composeForm = $<HTMLFormElement>("compose");
const composeInput = $<HTMLInputElement>("compose-input");
const composeBtn = composeForm.querySelector("button") as HTMLButtonElement;
const dialog = $<HTMLDialogElement>("detail");

const script = messages as ScriptedMessage[];
const recorded = replay as { recordedAt: string; model: string; results: Record<string, ModerationResult> };

const items: Item[] = [];
let nextKey = 0;
let cursor = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let playing = false;
let thresholds: Thresholds = { ...DEFAULT_THRESHOLDS };
let live: { apiKey: string; provider: Provider; controller: AbortController } | undefined;
let detailItem: Item | undefined;
const queue = createQueue(4);

// Browsers can't call the TypeSafe API directly (no CORS), so TypeSafe keys only work where a
// same-origin proxy exists: `pnpm dev` (Vite) or the Docker image (nginx). Never on the public site.
const typesafeBaseUrl: string | undefined =
  import.meta.env.DEV || import.meta.env.PUBLIC_TYPESAFE_LOCAL_PROXY === "true" ? "/typesafe-api" : undefined;

const pct = (p: number) => `${Math.round(p * 100)}%`;

// ---------- rendering ----------

function verdictOf(item: Item): Verdict | undefined {
  return item.status === "done" && item.result ? decide(item.result, thresholds) : undefined;
}

/** The probability that best explains a verdict: spam removals cite spam, the rest cite "offensive". */
function reason(r: ModerationResult): string {
  const spamRule = r.category === "spam" && r.offensive < thresholds.remove;
  return `${t(`cat.${r.category}` as Key)} ${pct(spamRule ? r.categoryProbabilities.spam : r.offensive)}`;
}

function render(item: Item): void {
  const verdict = verdictOf(item);
  const el = item.el;
  el.className = ["msg", item.status, verdict ?? "", verdict === "remove" ? "collapsed" : "", item.own ? "own" : ""]
    .filter(Boolean)
    .join(" ");

  const text =
    verdict === "remove" && item.result ? `<${t("chat.removed")} · ${reason(item.result)}>` : item.text;

  let note = "";
  if (verdict === "review" && item.result) note = `${t("chat.review")} · ${reason(item.result)}`;
  if (item.status === "error") note = t("chat.unmoderated");

  el.replaceChildren();
  const body = document.createElement("div");
  body.className = "msg-body";
  const user = document.createElement("span");
  user.className = "msg-user";
  user.textContent = item.own ? `${item.user} (${t("chat.you")})` : item.user;
  const msgText = document.createElement("span");
  msgText.className = "msg-text";
  msgText.textContent = text;
  body.append(user, msgText);
  const metaEl = document.createElement("span");
  metaEl.className = "msg-meta";
  if (item.status === "pending") {
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-label", t("chat.pending"));
    metaEl.append(dot);
  } else if (item.status === "queued") metaEl.textContent = t("chat.queued");
  else if (item.result) metaEl.textContent = `${item.result.latencyMs} ms`;
  el.append(body, metaEl);
  if (note) {
    const noteEl = document.createElement("span");
    noteEl.className = "msg-note";
    noteEl.textContent = note;
    el.append(noteEl);
  }
}

function renderAll(): void {
  for (const item of items) render(item);
  renderStats();
  if (detailItem) renderDetail(detailItem);
}

function renderStats(): void {
  const s = computeStats(items, thresholds);
  $("s-processed").textContent = String(s.processed);
  $("s-removed").textContent = String(s.removed);
  $("s-review").textContent = String(s.review);
  $("s-latency").textContent = s.avgLatencyMs === undefined ? "–" : `${s.avgLatencyMs} ms`;
  $("s-cost").textContent = s.costUsd === 0 ? "$0" : `$${s.costUsd.toFixed(s.costUsd < 0.001 ? 6 : 4)}`;
  $("s-agreement").textContent = s.agreement === undefined ? "–" : pct(s.agreement);
  $("s-errors").textContent = String(s.errors);
  $("s-errors-row").hidden = s.errors === 0;
}

function update(item: Item, patch: Partial<Item>): void {
  Object.assign(item, patch);
  if (item.el.isConnected) render(item);
  renderStats();
  if (detailItem === item) renderDetail(item);
}

// ---------- chat stream ----------

function addItem(data: Omit<Item, "key" | "status" | "el">, status: Item["status"]): Item {
  chat.querySelector(".chat-empty")?.remove();
  const el = document.createElement("li");
  const item: Item = { ...data, key: nextKey++, status, el };
  el.tabIndex = 0;
  el.addEventListener("click", () => openDetail(item));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDetail(item);
    }
  });
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
  items.push(item);
  chat.append(el);
  render(item);
  while (items.length > MAX_ITEMS) items.shift()!.el.remove();
  if (nearBottom) chat.scrollTop = chat.scrollHeight;
  renderStats();
  return item;
}

function playReplay(item: Item, id: string): void {
  const result = recorded.results[id];
  if (!result) {
    update(item, { status: "error", error: "No recorded answer for this message." });
    return;
  }
  // Replay the recorded latency so the demo feels like the real thing.
  setTimeout(() => update(item, { status: "done", result }), result.latencyMs);
}

function playLive(item: Item): void {
  const session = live!;
  queue
    .push(async () => {
      if (live !== session) throw new Error("live session ended");
      update(item, { status: "pending" });
      for (;;) {
        try {
          return await moderate(item.text, {
            apiKey: session.apiKey,
            provider: session.provider,
            typesafeBaseUrl,
            signal: session.controller.signal,
          });
        } catch (e) {
          if (!(e instanceof RateLimitError) || live !== session) throw e;
          showNotice(t("live.rateLimited"), false);
          update(item, { status: "queued" });
          await new Promise((r) => setTimeout(r, e.retryAfterMs));
          update(item, { status: "pending" });
        }
      }
    })
    .then(
      (result) => update(item, { status: "done", result }),
      (e: unknown) => {
        update(item, { status: "error", error: (e as Error)?.message ?? String(e) });
        if (e instanceof AuthError && live === session) {
          stopLive();
          showNotice(`${t("live.authError")} (${e.message})`, true);
        }
      },
    );
}

function tick(): void {
  const m = script[cursor % script.length];
  cursor++;
  const item = addItem({ user: m.user, text: m.text, expected: m.expected }, live ? "queued" : "pending");
  if (live) playLive(item);
  else playReplay(item, m.id);
  schedule();
}

function schedule(): void {
  clearTimeout(timer);
  if (!playing) return;
  // A little jitter so the chat doesn't feel like a metronome.
  const base = Number(speedSel.value);
  timer = setTimeout(tick, base * (0.5 + Math.random()));
}

function setPlaying(next: boolean): void {
  const wasPlaying = playing;
  playing = next;
  playBtn.dataset.i18n = next ? "chat.pause" : "chat.play";
  playBtn.textContent = t(playBtn.dataset.i18n as Key);
  if (next && !wasPlaying) tick();
  if (!next) clearTimeout(timer);
}

function restart(): void {
  for (const item of items) item.el.remove();
  items.length = 0;
  cursor = 0;
  closeDetail();
  renderStats();
  setPlaying(false);
  setPlaying(true);
}

// ---------- policy ----------

function readThresholds(changed?: HTMLInputElement): void {
  let remove = Number(removeInput.value);
  let review = Number(reviewInput.value);
  // Keep review <= remove, moving whichever slider the user isn't dragging.
  if (review > remove) {
    if (changed === reviewInput) remove = review;
    else review = remove;
    removeInput.value = String(remove);
    reviewInput.value = String(review);
  }
  thresholds = { remove, review };
  $("remove-value").textContent = remove.toFixed(2);
  $("review-value").textContent = review.toFixed(2);
  const scale = document.querySelector(".scale") as HTMLElement;
  (scale.children[0] as HTMLElement).style.width = pct(review);
  (scale.children[1] as HTMLElement).style.width = pct(remove - review);
  (scale.children[2] as HTMLElement).style.width = pct(1 - remove);
  renderAll();
}

// ---------- live mode ----------

function showNotice(text: string, isError: boolean): void {
  liveNotice.textContent = text;
  liveNotice.classList.toggle("error", isError);
  liveNotice.hidden = false;
}

function setModeUi(): void {
  const isLive = Boolean(live);
  modeBadge.dataset.i18n = isLive ? "mode.live" : "mode.replay";
  modeBadge.textContent = t(modeBadge.dataset.i18n as Key);
  modeBadge.classList.toggle("live", isLive);
  liveToggle.dataset.i18n = isLive ? "live.stop" : "live.start";
  liveToggle.textContent = t(liveToggle.dataset.i18n as Key);
  composeInput.disabled = !isLive;
  composeBtn.disabled = !isLive;
  composeInput.dataset.i18nPlaceholder = isLive ? "compose.placeholder" : "compose.locked";
  composeInput.placeholder = t(composeInput.dataset.i18nPlaceholder as Key);
  keyInput.disabled = isLive;
  providerSel.disabled = isLive;
}

function startLive(): void {
  const apiKey = keyInput.value.trim();
  if (!apiKey) {
    keyInput.focus();
    return;
  }
  const choice = providerSel.value;
  const provider: Provider = choice === "gateway" || choice === "typesafe" ? choice : detectProvider(apiKey);
  if (provider === "typesafe" && !typesafeBaseUrl) {
    showNotice(t("live.typesafeLocalOnly"), true);
    return;
  }
  safeSet(KEY_STORAGE, apiKey);
  safeSet(PROVIDER_STORAGE, choice);
  liveNotice.hidden = true;
  live = { apiKey, provider, controller: new AbortController() };
  setModeUi();
  if (!playing) setPlaying(true);
  // The live controls sit below the chat; bring the chat back into view.
  $("chat-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function stopLive(): void {
  live?.controller.abort();
  live = undefined;
  setModeUi();
}

// ---------- detail dialog ----------

function openDetail(item: Item): void {
  detailItem = item;
  renderDetail(item);
  if (!dialog.open) dialog.showModal();
}

function closeDetail(): void {
  detailItem = undefined;
  if (dialog.open) dialog.close();
}

function renderDetail(item: Item): void {
  $("detail-message").textContent = `${item.user}: ${item.text}`;
  const body = $("detail-body");
  const raw = $("detail-raw");
  body.replaceChildren();
  const r = item.result;
  if (!r) {
    body.textContent = item.status === "error" ? `${t("chat.unmoderated")} — ${item.error ?? ""}` : t("chat.pending");
    raw.textContent = "";
    return;
  }
  const verdict = decide(r, thresholds);
  const rows: Array<[string, string]> = [
    [t("detail.offensive"), pct(r.offensive)],
    [t("detail.category"), `${t(`cat.${r.category}` as Key)}${r.confidence !== undefined ? ` · ${t("detail.confidence")} ${pct(r.confidence)}` : ""}`],
    [t("detail.verdict"), t(`verdict.${verdict}` as Key)],
    [t("detail.latency"), `${r.latencyMs} ms`],
  ];
  if (item.expected) {
    const match = (item.expected === "ok") === (verdict === "allow");
    rows.push([t("detail.expected"), `${t(`cat.${item.expected}` as Key)} · ${t(match ? "detail.match" : "detail.mismatch")}`]);
  }
  const kv = document.createElement("dl");
  kv.className = "kv";
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    kv.append(dt, dd);
  }
  const bars = document.createElement("div");
  bars.className = "bars";
  for (const c of CATEGORIES) {
    const p = r.categoryProbabilities[c];
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.innerHTML = `<span></span><div class="bar-track"><div class="bar-fill"></div></div><span class="bar-value"></span>`;
    (bar.children[0] as HTMLElement).textContent = t(`cat.${c}` as Key);
    const fill = bar.querySelector(".bar-fill") as HTMLElement;
    fill.style.width = pct(p);
    fill.classList.toggle("top", c === r.category && c !== "ok");
    (bar.children[2] as HTMLElement).textContent = pct(p);
    bars.append(bar);
  }
  body.append(kv, bars);
  raw.textContent = JSON.stringify(r.raw, null, 2);
}

// ---------- wiring ----------

playBtn.addEventListener("click", () => setPlaying(!playing));
$("restart").addEventListener("click", restart);
speedSel.addEventListener("change", schedule);
removeInput.addEventListener("input", () => readThresholds(removeInput));
reviewInput.addEventListener("input", () => readThresholds(reviewInput));

$<HTMLFormElement>("live-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (live) stopLive();
  else startLive();
});
$("forget-key").addEventListener("click", () => {
  stopLive();
  keyInput.value = "";
  safeSet(KEY_STORAGE, null);
  liveNotice.hidden = true;
});

composeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = composeInput.value.trim().slice(0, 500);
  if (!text || !live) return;
  composeInput.value = "";
  const item = addItem({ user: "viewer", text, own: true }, "queued");
  chat.scrollTop = chat.scrollHeight;
  playLive(item);
});

$("detail-close").addEventListener("click", closeDetail);
dialog.addEventListener("close", () => (detailItem = undefined));
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) closeDetail();
});

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
  b.addEventListener("click", () => {
    setLang(b.dataset.lang as Lang);
    renderAll();
  });
}

$("recorded-model").textContent = recorded.model;
$("recorded-at").textContent = recorded.recordedAt ? recorded.recordedAt.slice(0, 10) : "";
keyInput.value = safeGet(KEY_STORAGE) ?? "";
providerSel.value = safeGet(PROVIDER_STORAGE) ?? "auto";

setLang(currentLang());
setModeUi();
readThresholds();
setPlaying(true);
