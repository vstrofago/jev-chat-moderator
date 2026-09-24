import { useState } from "preact/hooks";
import { api, type HighlightItem, type StoredDecision } from "./api";
import { useT } from "./i18n";
import { clock, Empty, MessageText, Verdicts } from "./shared";
import { useRun } from "./toast";

type Filter = "all" | "acted" | "unsure" | "highlights";

const matches = (d: StoredDecision, f: Filter) =>
  f === "all" ||
  (f === "acted" && d.outcome.moderation !== null) ||
  (f === "unsure" && d.outcome.uncertain.length > 0) ||
  (f === "highlights" && (d.outcome.highlight !== null || d.outcome.suggestion !== null));

export function LiveTab({ decisions, current, waiting }: { decisions: StoredDecision[]; current: HighlightItem | null; waiting: number }) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = decisions.filter((d) => matches(d, filter));
  return (
    <div class="live">
      <section class="feed" aria-label={t("live.feed")}>
        <div class="row feed-head">
          <h2>{t("tab.live")}</h2>
          <span class="spacer" />
          <div class="segmented" role="group" aria-label={t("live.filter")}>
            {(["all", "acted", "unsure", "highlights"] as Filter[]).map((f) => (
              <button key={f} class={filter === f ? "on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`live.filter.${f}`)}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <Empty title={t("live.empty.title")}>{t("live.empty.body")}</Empty>
        ) : (
          <ol class="messages">
            {shown.map((d) => (
              <MessageRow key={d.id} d={d} />
            ))}
          </ol>
        )}
      </section>
      <aside class="side">
        <OnScreen current={current} waiting={waiting} />
      </aside>
    </div>
  );
}

function MessageRow({ d }: { d: StoredDecision }) {
  const t = useT();
  const run = useRun();
  const act = (action: string, extra: Record<string, unknown> = {}) =>
    run(t(`done.${action}`, { user: d.authorName }), () => api("POST", "/api/actions", { action, decisionId: d.id, ...extra }));
  const tone = d.outcome.moderation && d.outcome.moderation.action !== "log" ? (d.applied ? "hit" : "would") : "";
  return (
    <li class={`message ${tone}`}>
      <time class="msg-time muted small">{clock(d.ts)}</time>
      <div class="msg-body">
        <div>
          <b class="msg-author">{d.authorName}</b> <MessageText d={d} />
        </div>
        <Verdicts d={d} />
      </div>
      <div class="msg-actions">
        <button class="btn quiet" onClick={() => act("delete")}>{t("action.delete")}</button>
        <button class="btn quiet" onClick={() => act("timeout", { seconds: 600 })}>{t("action.timeout10")}</button>
        <button class="btn quiet danger" onClick={() => confirm(t("confirm.ban", { user: d.authorName })) && act("ban")}>
          {t("action.ban")}
        </button>
        <button class="btn quiet go" disabled={d.spoiler} title={d.spoiler ? t("spoiler.noHighlight") : ""} onClick={() => act("highlight")}>
          {t("action.highlight")}
        </button>
      </div>
    </li>
  );
}

export function OnScreen({ current, waiting }: { current: HighlightItem | null; waiting: number }) {
  const t = useT();
  const run = useRun();
  const [text, setText] = useState("");
  const announce = async (e: Event) => {
    e.preventDefault();
    const ok = await run(t("done.announce"), () => api("POST", "/api/actions", { action: "announce", text }));
    if (ok) setText("");
  };
  return (
    <div class="panel stack on-screen">
      <h3>{t("screen.title")}</h3>
      {current ? (
        <div class="screen-card">
          <span class="small muted">{t(`kind.${current.kind}`)}{current.authorName ? `, ${current.authorName}` : ""}</span>
          <p>{current.text}</p>
        </div>
      ) : (
        <p class="muted">{t("screen.empty")}</p>
      )}
      <div class="row">
        <span class="muted small">{t("screen.waiting", { n: waiting })}</span>
        <span class="spacer" />
        <button class="btn" disabled={!current && waiting === 0} onClick={() => run("", () => api("POST", "/api/highlights/next"))}>
          {t("screen.next")}
        </button>
        <button class="btn" disabled={!current} onClick={() => run("", () => api("POST", "/api/highlights/clear"))}>
          {t("screen.clear")}
        </button>
      </div>
      <form class="stack" onSubmit={announce}>
        <label class="field">
          <span>{t("screen.announce")}</span>
          <input type="text" maxLength={300} value={text} placeholder={t("screen.announce.placeholder")} onInput={(e) => setText(e.currentTarget.value)} />
        </label>
        <button class="btn primary" disabled={!text.trim()}>{t("screen.announce.send")}</button>
      </form>
    </div>
  );
}
