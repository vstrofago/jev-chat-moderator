import { useState } from "preact/hooks";
import type { StoredDecision } from "./api";
import { useT } from "./i18n";

export const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Message text; possible spoilers stay blurred until someone chooses to read them. */
export function MessageText({ d }: { d: StoredDecision }) {
  const t = useT();
  const [shown, setShown] = useState(false);
  if (!d.spoiler || shown) return <span class="msg-text">{d.text}</span>;
  return (
    <button class="spoiler" onClick={() => setShown(true)} title={t("spoiler.reveal")}>
      <span class="spoiler-blur" aria-hidden="true">{d.text}</span>
      <span class="spoiler-label">{t("spoiler.hidden")}</span>
    </button>
  );
}

/** What each rule thought, for the rules that mattered on this message. */
export function Verdicts({ d }: { d: StoredDecision }) {
  const t = useT();
  const o = d.outcome;
  const tags = o.verdicts.filter((v) => v.band !== "none");
  if (tags.length === 0) return null;
  return (
    <span class="verdicts">
      {tags.map((v) => {
        const acted = o.moderation?.ruleId === v.ruleId;
        const kind = v.action === "highlight" ? "go" : v.band === "act" ? "port" : "lantern";
        let label = v.ruleId;
        if (acted && o.moderation) {
          const action = o.moderation.action;
          label = o.moderation.downgraded
            ? t("verdict.downgraded", { rule: v.ruleId })
            : action === "log"
              ? t("verdict.logged", { rule: v.ruleId })
              : t(d.applied ? `verdict.did.${action}` : `verdict.would.${action}`, { rule: v.ruleId });
        } else if (v.band === "unsure") label = t("verdict.unsure", { rule: v.ruleId });
        return (
          <span key={v.ruleId} class={`tag tag-${kind}`} title={`${v.ruleId}: ${pct(v.probability)}`}>
            {label} <b>{pct(v.probability)}</b>
          </span>
        );
      })}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: preact.ComponentChildren }) {
  return (
    <div class="empty">
      <h3>{title}</h3>
      {children && <p class="muted">{children}</p>}
    </div>
  );
}
