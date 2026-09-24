import { useCallback, useEffect, useState } from "preact/hooks";
import { api, connectLive, type HighlightItem, type LiveEvent, type Overview, type RuntimeState, type SpoilerStatus, type Stats, type StoredDecision } from "./api";
import { HighlightsTab } from "./highlights";
import { initialLang, LangContext, translate, useT, type Lang } from "./i18n";
import { LiveTab } from "./live";
import { RulesTab } from "./rules";
import { SettingsTab } from "./settings";
import { StatsTab } from "./stats";
import { ToastHost, useRun } from "./toast";
import { UncertainTab } from "./uncertain";
import { Wizard } from "./wizard";

const TABS = ["live", "uncertain", "highlights", "rules", "settings", "stats"] as const;
type Tab = (typeof TABS)[number];
const MAX_FEED = 300;

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = translate(lang, "app.title");
  }, [lang]);
  return (
    <LangContext.Provider value={lang}>
      <ToastHost>
        <Dashboard lang={lang} setLang={setLang} />
      </ToastHost>
    </LangContext.Provider>
  );
}

function Dashboard({ lang, setLang }: { lang: Lang; setLang(l: Lang): void }) {
  const t = useT();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [state, setState] = useState<RuntimeState | null>(null);
  const [decisions, setDecisions] = useState<StoredDecision[]>([]);
  const [uncertain, setUncertain] = useState<StoredDecision[]>([]);
  const [highlight, setHighlight] = useState<{ current: HighlightItem | null; waiting: HighlightItem[] }>({ current: null, waiting: [] });
  const [stats, setStats] = useState<Stats | null>(null);
  const [warning, setWarning] = useState<{ code: string; detail: string } | null>(null);
  const [connected, setConnected] = useState(true);
  const [tab, setTab] = useState<Tab>(() => (TABS.includes(location.hash.slice(1) as Tab) ? (location.hash.slice(1) as Tab) : "live"));
  const [wizardDone, setWizardDone] = useState(false);
  const [spoilers, setSpoilers] = useState<SpoilerStatus>({ pack: null, checkpoint: null });

  const reload = useCallback(async () => {
    const [o, d, u] = await Promise.all([
      api<Overview>("GET", "/api/overview"),
      api<StoredDecision[]>("GET", "/api/decisions?limit=150"),
      api<StoredDecision[]>("GET", "/api/uncertain"),
    ]);
    setOverview(o);
    setState(o.state);
    setDecisions(d);
    setUncertain(u);
  }, []);

  useEffect(() => {
    reload();
    api<Stats>("GET", "/api/stats").then(setStats);
    api<SpoilerStatus>("GET", "/api/spoiler-pack").then(setSpoilers);
    return connectLive((e: LiveEvent) => {
      switch (e.type) {
        case "decision":
          setDecisions((list) => [e.decision, ...list].slice(0, MAX_FEED));
          if (e.decision.outcome.uncertain.length > 0) setUncertain((list) => [e.decision, ...list]);
          return;
        case "state":
          return setState(e.state);
        case "highlight":
          return setHighlight({ current: e.current, waiting: e.waiting });
        case "warning":
          return setWarning({ code: e.code, detail: e.detail });
        case "stats":
          return setStats(e.stats);
        case "spoilers":
          return setSpoilers({ pack: e.pack, checkpoint: e.checkpoint });
      }
    }, setConnected);
  }, [reload]);

  useEffect(() => {
    history.replaceState(null, "", `#${tab}`);
  }, [tab]);

  if (!overview || !state) return <p class="loading muted">{t("app.loading")}</p>;

  if (!overview.setupDone && !wizardDone && overview.user.role === "broadcaster") {
    return <Wizard overview={overview} lang={lang} setLang={setLang} reload={reload} done={() => setWizardDone(true)} />;
  }

  return (
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <Mark />
          <span>Vigia</span>
        </div>
        <Lantern state={state} />
        <div class="context muted small">
          {state.category && <span>{state.category}</span>}
          {state.progress && <span>{t("top.progress", { p: state.progress })}</span>}
        </div>
        <span class="spacer" />
        {!connected && <span class="offline small">{t("top.offline")}</span>}
        <span class="muted small">{overview.user.role === "moderator" ? t("top.mod", { login: overview.user.login }) : ""}</span>
        {overview.mode === "exposed" && (
          <button class="btn quiet" onClick={() => api("POST", "/api/logout").then(() => (location.href = "/login"))}>
            {t("top.logout")}
          </button>
        )}
      </header>

      <nav class="rail" aria-label={t("nav.label")}>
        {TABS.map((id) => (
          <button key={id} class={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
            <span>{t(`tab.${id}`)}</span>
            {id === "uncertain" && uncertain.length > 0 && <span class="badge">{uncertain.length}</span>}
          </button>
        ))}
      </nav>

      <main class="main">
        {warning && <Warning code={warning.code} detail={warning.detail} close={() => setWarning(null)} />}
        {state.halted && <p class="notice error">{t("warn.halted")}</p>}
        {tab === "live" && <LiveTab decisions={decisions} current={highlight.current} waiting={highlight.waiting.length} />}
        {tab === "uncertain" && <UncertainTab items={uncertain} config={overview.config} reload={reload} />}
        {tab === "highlights" && (
          <HighlightsTab decisions={decisions} config={overview.config} current={highlight.current} waiting={highlight.waiting} />
        )}
        {tab === "rules" && <RulesTab config={overview.config} decisions={decisions} user={overview.user} progress={state.progress} spoilers={spoilers} setSpoilers={setSpoilers} reload={reload} />}
        {tab === "settings" && <SettingsTab overview={overview} lang={lang} setLang={setLang} reload={reload} />}
        {tab === "stats" && <StatsTab stats={stats} user={overview.user} />}
      </main>
    </div>
  );
}

/**
 * The one loud element: what Vigia is doing right now. Amber lantern while it only
 * watches, green light while it moderates, dark while paused.
 */
function Lantern({ state }: { state: RuntimeState }) {
  const t = useT();
  const run = useRun();
  const [open, setOpen] = useState(false);
  const mode = state.paused ? "paused" : state.observe ? "observing" : "acting";
  const set = async (body: Record<string, boolean>, done: string) => {
    setOpen(false);
    await run(done, () => api("POST", "/api/state", body));
  };
  return (
    <div class="lantern-wrap">
      <button class={`lantern lantern-${mode}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="lantern-light" aria-hidden="true" />
        <span class="lantern-text">
          <b>{t(`mode.${mode}`)}</b>
          <span class="small">{t(`mode.${mode}.hint`)}</span>
        </span>
      </button>
      {open && (
        <div class="lantern-menu panel stack" role="menu">
          {state.observe ? (
            <button class="btn go" role="menuitem" onClick={() => confirm(t("confirm.act")) && set({ observe: false }, t("done.acting"))}>
              {t("mode.toActing")}
            </button>
          ) : (
            <button class="btn" role="menuitem" onClick={() => set({ observe: true }, t("done.observing"))}>
              {t("mode.toObserving")}
            </button>
          )}
          {state.paused ? (
            <button class="btn" role="menuitem" onClick={() => set({ paused: false }, t("done.resumed"))}>{t("mode.resume")}</button>
          ) : (
            <button class="btn" role="menuitem" onClick={() => set({ paused: true }, t("done.paused"))}>{t("mode.pause")}</button>
          )}
        </div>
      )}
    </div>
  );
}

function Warning({ code, detail, close }: { code: string; detail: string; close(): void }) {
  const t = useT();
  return (
    <div class="notice row warning" role="alert">
      <span>
        <b>{t(`warn.${code}`)}</b> <span class="muted small">{detail}</span>
      </span>
      <span class="spacer" />
      <button class="btn quiet" onClick={close}>{t("common.dismiss")}</button>
    </div>
  );
}

/** The logo, for now: a bat, the night lookout. */
export function Mark() {
  return (
    <span class="mark" aria-hidden="true">
      🦇
    </span>
  );
}
