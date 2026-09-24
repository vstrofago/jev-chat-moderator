import type { Rule } from "@vigia/engine";
import { useEffect, useState } from "preact/hooks";
import { api, ApiError, type ConfigError, type RuleVerdict, type StoredDecision, type User, type VigiaConfig } from "./api";
import { useT } from "./i18n";
import { pct } from "./shared";
import { useRun } from "./toast";

const isPack = (r: Rule): r is Extract<Rule, { pack: string }> => "pack" in r;

export function RulesTab(p: { config: VigiaConfig; decisions: StoredDecision[]; user: User; progress?: string; reload(): void }) {
  const t = useT();
  return (
    <section class="stack page rules">
      <div>
        <h2>{t("tab.rules")}</h2>
        <p class="muted">{t("rules.intro")}</p>
      </div>
      <TestBox />
      {p.config.rules.map((rule) => (
        <RuleEditor key={rule.id} rule={rule} config={p.config} decisions={p.decisions} user={p.user} reload={p.reload} />
      ))}
      <AddRule reload={p.reload} />
      <RawEditor reload={p.reload} />
    </section>
  );
}

function TestBox() {
  const t = useT();
  const run = useRun();
  const [text, setText] = useState("");
  const [verdicts, setVerdicts] = useState<RuleVerdict[] | null>(null);
  const [busy, setBusy] = useState(false);
  const test = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    const r = await run("", () => api<{ verdicts: RuleVerdict[] }>("POST", "/api/test", { text }));
    setBusy(false);
    if (r) setVerdicts(r.verdicts);
  };
  return (
    <form class="panel stack" onSubmit={test}>
      <label class="field">
        <span>{t("test.label")}</span>
        <input type="text" value={text} maxLength={500} placeholder={t("test.placeholder")} onInput={(e) => setText(e.currentTarget.value)} />
      </label>
      <div class="row">
        <button class="btn primary" disabled={!text.trim() || busy}>{busy ? t("test.running") : t("test.run")}</button>
        <span class="muted small">{t("test.note")}</span>
      </div>
      {verdicts && (
        <ul class="bars">
          {verdicts.map((v) => (
            <li key={v.ruleId} class={`bar-row band-${v.band}`}>
              <span class="bar-name">{v.ruleId}</span>
              <span class="bar" style={{ "--p": v.probability }} />
              <span class="bar-value">{pct(v.probability)}</span>
              <span class="bar-band small">{t(`band.${v.band}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function RuleEditor({ rule, config, decisions, user, reload }: { rule: Rule; config: VigiaConfig; decisions: StoredDecision[]; user: User; reload(): void }) {
  const t = useT();
  const run = useRun();
  const [act, setAct] = useState(rule.act ?? config.defaults.act);
  const [unsure, setUnsure] = useState(rule.unsure ?? config.defaults.unsure);
  const [action, setAction] = useState(rule.action);
  const [seconds, setSeconds] = useState(rule.seconds ?? 60);
  const [errors, setErrors] = useState<ConfigError[]>([]);
  useEffect(() => {
    setAct(rule.act ?? config.defaults.act);
    setUnsure(rule.unsure ?? config.defaults.unsure);
    setAction(rule.action);
    setSeconds(rule.seconds ?? 60);
  }, [rule, config.defaults]);

  const dirty =
    act !== (rule.act ?? config.defaults.act) ||
    unsure !== (rule.unsure ?? config.defaults.unsure) ||
    action !== rule.action ||
    (action === "timeout" && seconds !== (rule.seconds ?? 60));

  // Re-evaluate recent messages with the new thresholds, using the probabilities Jev gave.
  const seen = decisions.flatMap((d) => d.outcome.verdicts.filter((v) => v.ruleId === rule.id));
  const wouldAct = seen.filter((v) => v.probability >= act).length;
  const wouldDoubt = seen.filter((v) => v.probability < act && v.probability >= Math.min(unsure, act)).length;
  const enabled = rule.enabled !== false;
  const kind = isPack(rule) ? t(`pack.${rule.pack}`) : rule.question;

  const save = async () => {
    setErrors([]);
    try {
      await api("PATCH", `/api/rules/${rule.id}`, {
        act: act === config.defaults.act ? null : act,
        unsure: unsure === config.defaults.unsure ? null : unsure,
        action,
        seconds: action === "timeout" ? seconds : null,
      });
      reload();
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.errors.length ? e.errors : [{ path: "", message: e.message }]);
    }
  };

  return (
    <article class={`panel stack rule ${enabled ? "" : "off"}`}>
      <div class="row">
        <div class="stack rule-title">
          <h3>{rule.id}</h3>
          <p class="muted small">{kind}</p>
        </div>
        <span class="spacer" />
        <label class="switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => run("", () => api("PATCH", `/api/rules/${rule.id}`, { enabled: e.currentTarget.checked })).then(reload)}
          />
          <span>{enabled ? t("rules.on") : t("rules.off")}</span>
        </label>
      </div>

      <div class="rule-grid">
        <label class="field">
          <span>{t("rules.action")}</span>
          <select value={action} onChange={(e) => setAction(e.currentTarget.value as Rule["action"])}>
            {(["delete", "timeout", "highlight", "log"] as const).map((a) => (
              <option key={a} value={a}>{t(`action.${a}`)}</option>
            ))}
          </select>
        </label>
        {action === "timeout" && (
          <label class="field">
            <span>{t("rules.seconds")}</span>
            <input type="number" min={1} max={1209600} value={seconds} onInput={(e) => setSeconds(Number(e.currentTarget.value))} />
          </label>
        )}
        <label class="field">
          <span>{t("rules.act", { v: pct(act) })}</span>
          <input type="range" min={0.5} max={0.99} step={0.01} value={act} onInput={(e) => setAct(Number(e.currentTarget.value))} />
        </label>
        <label class="field">
          <span>{t("rules.unsure", { v: pct(unsure) })}</span>
          <input type="range" min={0.2} max={0.95} step={0.01} value={unsure} onInput={(e) => setUnsure(Number(e.currentTarget.value))} />
        </label>
      </div>
      <p class="muted small">
        {seen.length === 0
          ? t("rules.preview.none")
          : t(action === "highlight" ? "rules.preview.highlight" : "rules.preview", { n: seen.length, act: wouldAct, unsure: wouldDoubt })}
      </p>

      {isPack(rule) && rule.pack === "antispoiler" && <SpoilerSettings rule={rule} user={user} reload={reload} />}

      {errors.map((e) => (
        <p key={e.path + e.message} class="error small">{e.message}</p>
      ))}
      <div class="row">
        <button class="btn primary" disabled={!dirty} onClick={save}>{t("rules.save")}</button>
        <span class="spacer" />
        <button
          class="btn quiet danger"
          onClick={() => confirm(t("confirm.removeRule", { id: rule.id })) && run(t("done.removed"), () => api("DELETE", `/api/rules/${rule.id}`)).then(reload)}
        >
          {t("rules.remove")}
        </button>
      </div>
    </article>
  );
}

function SpoilerSettings({ rule, user, reload }: { rule: Extract<Rule, { pack: string }>; user: User; reload(): void }) {
  const t = useT();
  const run = useRun();
  const [progress, setProgress] = useState(rule.progress ?? "");
  const [topics, setTopics] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const isMod = user.role === "moderator";
  useEffect(() => {
    api<{ topics?: string[]; count?: number }>("GET", "/api/topics").then((r) => {
      if (r.topics) setTopics(r.topics.join("\n"));
      setCount(r.count ?? r.topics?.length ?? 0);
    });
  }, []);
  return (
    <div class="stack spoiler-settings">
      <label class="field">
        <span>{t("spoiler.progress")}</span>
        <div class="row">
          <input type="text" value={progress} placeholder={t("spoiler.progress.placeholder")} onInput={(e) => setProgress(e.currentTarget.value)} />
          <button class="btn" onClick={() => run(t("done.saved"), () => api("PATCH", `/api/rules/${rule.id}`, { progress: progress.trim() || null })).then(reload)}>
            {t("rules.save")}
          </button>
        </div>
      </label>
      {isMod && topics !== null ? (
        <label class="field">
          <span>{t("spoiler.topics")}</span>
          <textarea rows={3} value={topics} placeholder={t("spoiler.topics.placeholder")} onInput={(e) => setTopics(e.currentTarget.value)} />
          <button
            class="btn"
            onClick={() => run(t("done.saved"), () => api("PUT", "/api/topics", { topics: topics.split("\n").map((s) => s.trim()).filter(Boolean) }))}
          >
            {t("spoiler.topics.save")}
          </button>
        </label>
      ) : (
        <p class="muted small">{count === 0 ? t("spoiler.topics.none") : t("spoiler.topics.count", { n: count })}</p>
      )}
    </div>
  );
}

function AddRule({ reload }: { reload(): void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: "", question: "", yes: "", no: "", action: "delete", seconds: 60 });
  const [errors, setErrors] = useState<ConfigError[]>([]);
  const set = (k: keyof typeof form) => (e: Event) => setForm({ ...form, [k]: (e.currentTarget as HTMLInputElement).value });
  const submit = async (e: Event) => {
    e.preventDefault();
    setErrors([]);
    const rule: Record<string, unknown> = { id: form.id.trim(), question: form.question, yes: form.yes, no: form.no, action: form.action };
    if (form.action === "timeout") rule.seconds = Number(form.seconds);
    try {
      await api("POST", "/api/rules", rule);
      setForm({ id: "", question: "", yes: "", no: "", action: "delete", seconds: 60 });
      setOpen(false);
      reload();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.errors.length ? err.errors : [{ path: "", message: err.message }]);
    }
  };
  if (!open) {
    return (
      <button class="btn add-rule" onClick={() => setOpen(true)}>
        {t("add.open")}
      </button>
    );
  }
  return (
    <form class="panel stack" onSubmit={submit}>
      <h3>{t("add.title")}</h3>
      <p class="muted small">{t("add.help")}</p>
      <label class="field">
        <span>{t("add.id")}</span>
        <input type="text" required pattern="[a-z0-9_\-]+" value={form.id} placeholder="backseat" onInput={set("id")} />
      </label>
      <label class="field">
        <span>{t("add.question")}</span>
        <input type="text" required value={form.question} placeholder={t("add.question.placeholder")} onInput={set("question")} />
      </label>
      <div class="rule-grid">
        <label class="field">
          <span>{t("add.yes")}</span>
          <textarea rows={2} required value={form.yes} placeholder={t("add.yes.placeholder")} onInput={set("yes")} />
        </label>
        <label class="field">
          <span>{t("add.no")}</span>
          <textarea rows={2} required value={form.no} placeholder={t("add.no.placeholder")} onInput={set("no")} />
        </label>
        <label class="field">
          <span>{t("rules.action")}</span>
          <select value={form.action} onChange={set("action")}>
            {(["delete", "timeout", "highlight", "log"] as const).map((a) => (
              <option key={a} value={a}>{t(`action.${a}`)}</option>
            ))}
          </select>
        </label>
        {form.action === "timeout" && (
          <label class="field">
            <span>{t("rules.seconds")}</span>
            <input type="number" min={1} value={form.seconds} onInput={set("seconds")} />
          </label>
        )}
      </div>
      {errors.map((e) => (
        <p key={e.path + e.message} class="error small">{e.message}</p>
      ))}
      <div class="row">
        <button class="btn primary">{t("add.submit")}</button>
        <button type="button" class="btn quiet" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

function RawEditor({ reload }: { reload(): void }) {
  const t = useT();
  const run = useRun();
  const [text, setText] = useState<string | null>(null);
  const [errors, setErrors] = useState<ConfigError[]>([]);
  const load = () => api<{ text: string }>("GET", "/api/config").then((r) => setText(r.text));
  const save = async () => {
    setErrors([]);
    try {
      await api("PUT", "/api/config", { text });
      await run(t("done.saved"), async () => undefined);
      reload();
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.errors.length ? e.errors : [{ path: "", message: e.message }]);
    }
  };
  return (
    <details class="panel raw" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
      <summary>{t("raw.title")}</summary>
      <div class="stack">
        <p class="muted small">{t("raw.help")}</p>
        {text !== null && <textarea class="code" rows={18} spellcheck={false} value={text} onInput={(e) => setText(e.currentTarget.value)} />}
        {errors.map((e) => (
          <p key={e.path + e.message} class="error small">{t("raw.error", { line: e.line ?? "?", path: e.path, message: e.message })}</p>
        ))}
        <div class="row">
          <button class="btn primary" onClick={save}>{t("raw.save")}</button>
        </div>
      </div>
    </details>
  );
}
