import { api, type HighlightItem, type StoredDecision, type VigiaConfig } from "./api";
import { useT } from "./i18n";
import { OnScreen } from "./live";
import { clock, Empty, pct } from "./shared";
import { useRun } from "./toast";

/** Suggestions: unsure highlights, plus everything Jev picked when a mod must approve. */
function suggestions(decisions: StoredDecision[], config: VigiaConfig) {
  return decisions.filter(
    (d) => !d.spoiler && (d.outcome.suggestion !== null || (config.highlights.mode === "approve" && d.outcome.highlight !== null)),
  );
}

export function HighlightsTab(p: { decisions: StoredDecision[]; config: VigiaConfig; current: HighlightItem | null; waiting: HighlightItem[] }) {
  const t = useT();
  const run = useRun();
  const list = suggestions(p.decisions, p.config).slice(0, 50);
  return (
    <div class="live">
      <section class="stack page">
        <div>
          <h2>{t("tab.highlights")}</h2>
          <p class="muted">{p.config.highlights.mode === "approve" ? t("highlights.intro.approve") : t("highlights.intro.auto")}</p>
        </div>
        {list.length === 0 ? (
          <Empty title={t("highlights.empty.title")}>{t("highlights.empty.body")}</Empty>
        ) : (
          <ol class="messages">
            {list.map((d) => {
              const v = d.outcome.highlight ?? d.outcome.suggestion!;
              return (
                <li key={d.id} class="message">
                  <time class="msg-time muted small">{clock(d.ts)}</time>
                  <div class="msg-body">
                    <div>
                      <b class="msg-author">{d.authorName}</b> <span class="msg-text">{d.text}</span>
                    </div>
                    <span class="verdicts">
                      <span class="tag tag-go">
                        {v.ruleId} <b>{pct(v.probability)}</b>
                      </span>
                    </span>
                  </div>
                  <div class="msg-actions always">
                    <button class="btn go" onClick={() => run(t("done.highlight", { user: d.authorName }), () => api("POST", "/api/actions", { action: "highlight", decisionId: d.id }))}>
                      {t("highlights.show")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {p.waiting.length > 0 && (
          <div class="stack">
            <h3>{t("highlights.queue")}</h3>
            <ol class="queue">
              {p.waiting.map((h) => (
                <li key={h.id}>
                  <span class="muted small">{h.authorName ?? t(`kind.${h.kind}`)}</span> {h.text}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
      <aside class="side">
        <OnScreen current={p.current} waiting={p.waiting.length} />
      </aside>
    </div>
  );
}
