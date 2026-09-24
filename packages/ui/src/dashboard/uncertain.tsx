import { api, type StoredDecision, type VigiaConfig } from "./api";
import { useT } from "./i18n";
import { clock, Empty, MessageText, pct } from "./shared";
import { useRun } from "./toast";

const STRENGTH: Record<string, number> = { timeout: 3, delete: 2, log: 1 };

export function UncertainTab({ items, config, reload }: { items: StoredDecision[]; config: VigiaConfig; reload(): void }) {
  const t = useT();
  const run = useRun();
  const resolve = async (d: StoredDecision, how: "apply" | "dismiss", done: string) => {
    await run(done, () => api("POST", `/api/uncertain/${d.id}/${how}`));
    reload();
  };
  return (
    <section class="stack page">
      <div>
        <h2>{t("tab.uncertain")}</h2>
        <p class="muted">{t("uncertain.intro")}</p>
      </div>
      {items.length === 0 ? (
        <Empty title={t("uncertain.empty.title")}>{t("uncertain.empty.body")}</Empty>
      ) : (
        <ol class="messages">
          {items.map((d) => {
            const top = [...d.outcome.uncertain].sort((a, b) => (STRENGTH[b.action] ?? 0) - (STRENGTH[a.action] ?? 0))[0];
            const seconds = config.rules.find((r) => r.id === top?.ruleId)?.seconds ?? 60;
            const applyLabel =
              top?.action === "timeout" ? t("uncertain.apply.timeout", { s: seconds }) : top?.action === "delete" ? t("uncertain.apply.delete") : t("uncertain.apply.log");
            return (
              <li key={d.id} class="message">
                <time class="msg-time muted small">{clock(d.ts)}</time>
                <div class="msg-body">
                  <div>
                    <b class="msg-author">{d.authorName}</b> <MessageText d={d} />
                  </div>
                  <span class="verdicts">
                    {d.outcome.uncertain.map((v) => (
                      <span key={v.ruleId} class="tag tag-lantern">
                        {v.ruleId} <b>{pct(v.probability)}</b>
                      </span>
                    ))}
                  </span>
                </div>
                <div class="msg-actions always">
                  <button class="btn danger" onClick={() => resolve(d, "apply", t("done.applied"))}>{applyLabel}</button>
                  <button class="btn" onClick={() => resolve(d, "dismiss", t("done.dismissed"))}>{t("uncertain.dismiss")}</button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
