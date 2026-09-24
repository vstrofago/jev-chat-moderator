import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "../styles/app.css";
import "../styles/dashboard.css";
import { Mark } from "../dashboard/app";
import { initialLang, LangContext, saveLang, useT, type Lang } from "../dashboard/i18n";
import { desktop, LockedError, type SetupState } from "./bridge";

const TWITCH_CONSOLE = "https://dev.twitch.tv/console/apps/create";
const GATEWAY_KEYS = "https://vercel.com/docs/ai-gateway";

function Setup({ lang, setLang }: { lang: Lang; setLang(l: Lang): void }) {
  const t = useT();
  const [state, setState] = useState<SetupState | null>(null);
  const [locked, setLocked] = useState(false);
  const load = () =>
    desktop()
      .state()
      .then((s) => {
        setLocked(false);
        setState(s);
      })
      .catch((e) => {
        if (e instanceof LockedError) setLocked(true);
      });
  useEffect(() => {
    load();
  }, []);
  if (!state && !locked) return null;

  return (
    <main class="wizard setup">
      <div class="row">
        <div class="brand">
          <Mark />
          <span>Vigia</span>
        </div>
        <span class="spacer" />
        <select
          aria-label={t("settings.uiLang")}
          class="lang"
          value={lang}
          onChange={(e) => {
            const l = e.currentTarget.value as Lang;
            saveLang(l);
            setLang(l);
          }}
        >
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </div>
      {locked || !state ? (
        <Unlock onUnlocked={load} />
      ) : (
        <>
          {state.weak && <p class="notice">{t("setup.weak")}</p>}
          {state.step === "source" && <Source setState={setState} />}
          {state.step === "twitch-app" && <TwitchApp setState={setState} />}
          {state.step === "twitch-login" && <TwitchLogin setState={setState} />}
          {state.step === "jev-key" && <JevKey setState={setState} />}
          {state.step === "done" && <Done />}
        </>
      )}
    </main>
  );
}

/** Web setup reachable from other machines: the code printed in Vigia's logs unlocks it. */
function Unlock({ onUnlocked }: { onUnlocked(): void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  return (
    <form
      class="panel stack wizard-body"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(false);
        if (await desktop().unlock?.(code)) onUnlocked();
        else setError(true);
      }}
    >
      <h2>{t("setup.unlock.title")}</h2>
      <p class="muted">{t("setup.unlock.body")}</p>
      <label class="field">
        <span>{t("setup.unlock.code")}</span>
        <input type="text" required autoComplete="off" autoCapitalize="characters" spellcheck={false} value={code} onInput={(e) => setCode(e.currentTarget.value)} />
      </label>
      {error && <p class="error" role="alert">{t("setup.unlock.wrong")}</p>}
      <div class="row">
        <span class="spacer" />
        <button class="btn primary">{t("setup.unlock.go")}</button>
      </div>
    </form>
  );
}

function Back({ setState }: { setState(s: SetupState): void }) {
  const t = useT();
  return (
    <button class="btn quiet" onClick={() => desktop().back().then(setState)}>
      {t("wizard.back")}
    </button>
  );
}

function Source({ setState }: { setState(s: SetupState): void }) {
  const t = useT();
  const [channel, setChannel] = useState("");
  return (
    <section class="panel stack wizard-body">
      <h2>{t("setup.source.title")}</h2>
      <p class="muted">{t("setup.source.body")}</p>
      <div class="choices">
        <button class="choice" onClick={() => desktop().chooseSource("twitch").then(setState)}>
          <b>{t("setup.source.twitch")}</b>
          <span class="muted small">{t("setup.source.twitch.help")}</span>
        </button>
        <form
          class="choice"
          onSubmit={(e) => {
            e.preventDefault();
            desktop().chooseSource("observe", channel.trim().replace(/^#/, "").toLowerCase()).then(setState);
          }}
        >
          <b>{t("setup.source.observe")}</b>
          <span class="muted small">{t("setup.source.observe.help")}</span>
          <div class="row">
            <input type="text" required pattern="[A-Za-z0-9_#]{3,26}" placeholder={t("setup.source.observe.placeholder")} value={channel} onInput={(e) => setChannel(e.currentTarget.value)} />
            <button class="btn">{t("setup.source.observe.go")}</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function TwitchApp({ setState }: { setState(s: SetupState): void }) {
  const t = useT();
  const [clientId, setClientId] = useState("");
  return (
    <section class="panel stack wizard-body">
      <h2>{t("setup.app.title")}</h2>
      <p class="muted">{t("setup.app.body")}</p>
      <ol class="steps">
        <li>
          {t("setup.app.step1")}{" "}
          <button class="btn" onClick={() => desktop().openExternal(TWITCH_CONSOLE)}>{t("setup.app.open")}</button>
        </li>
        <li>{t("setup.app.step2")}</li>
        <li>
          {t("setup.app.step3")}
          <dl class="app-fields">
            <dt>{t("setup.app.name")}</dt>
            <dd>{t("setup.app.name.value")}</dd>
            <dt>{t("setup.app.redirect")}</dt>
            <dd>
              <code>http://localhost</code>
            </dd>
            <dt>{t("setup.app.category")}</dt>
            <dd>Chat Bot</dd>
            <dt>{t("setup.app.type")}</dt>
            <dd>
              <b>Public</b>
            </dd>
          </dl>
        </li>
        <li>{t("setup.app.step4")}</li>
      </ol>
      <p class="muted small">{t("setup.app.2fa")}</p>
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          desktop().saveClientId(clientId.trim()).then(setState);
        }}
      >
        <input type="text" required minLength={10} placeholder={t("setup.app.clientId")} aria-label={t("setup.app.clientId")} value={clientId} onInput={(e) => setClientId(e.currentTarget.value)} />
        <button class="btn primary">{t("wizard.next")}</button>
      </form>
      <div class="row">
        <Back setState={setState} />
      </div>
    </section>
  );
}

function TwitchLogin({ setState }: { setState(s: SetupState): void }) {
  const t = useT();
  const [code, setCode] = useState<{ uri: string; code: string; minutes: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    desktop().onTwitchLogin((r) => {
      if (r.ok) desktop().state().then(setState);
      else {
        setCode(null);
        setError(r.error ?? "");
      }
    });
  }, []);
  const start = async () => {
    setError("");
    try {
      setCode(await desktop().startTwitchLogin());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section class="panel stack wizard-body">
      <h2>{t("setup.login.title")}</h2>
      <p class="muted">{t("setup.login.body")}</p>
      {code ? (
        <div class="stack device-code">
          <p>{t(desktop().autoOpens ? "setup.login.opened" : "setup.login.openThis")}</p>
          <p class="code-big" aria-label={t("setup.login.code")}>{code.code}</p>
          <p class="muted small">{t("setup.login.waiting", { minutes: code.minutes })}</p>
          <button class={desktop().autoOpens ? "btn" : "btn primary"} onClick={() => desktop().openExternal(code.uri)}>
            {t(desktop().autoOpens ? "setup.login.reopen" : "setup.login.open")}
          </button>
        </div>
      ) : (
        <button class="btn primary big" onClick={start}>{t("setup.login.start")}</button>
      )}
      {error && <p class="error" role="alert">{error}</p>}
      <div class="row">
        <Back setState={setState} />
      </div>
    </section>
  );
}

function JevKey({ setState }: { setState(s: SetupState): void }) {
  const t = useT();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const provider = key.trim().startsWith("vck_") ? "gateway" : key.trim() ? "typesafe" : "";
  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await desktop().saveJevKey(key.trim());
    setBusy(false);
    if (r.ok) setState(r.state);
    else if (r.code === "bad-key") setError(t("setup.jev.error.badKey"));
    else if (r.code === "unreachable") setError(`${t("setup.jev.error.unreachable")} ${r.error ?? ""}`.trim());
    else setError(r.error ?? "");
  };
  return (
    <form class="panel stack wizard-body" onSubmit={save}>
      <h2>{t("setup.jev.title")}</h2>
      <p class="muted">{t(desktop().autoOpens ? "setup.jev.body" : "setup.jev.body.server")}</p>
      <label class="field">
        <span>{t("setup.jev.key")}</span>
        <input type="password" autoComplete="off" required value={key} onInput={(e) => setKey(e.currentTarget.value)} />
      </label>
      {provider && <p class="muted small">{t(`setup.jev.provider.${provider}`)}</p>}
      <p class="muted small">
        {t("setup.jev.where")}{" "}
        <a href={GATEWAY_KEYS} onClick={(e) => (e.preventDefault(), desktop().openExternal(GATEWAY_KEYS))}>
          {t("setup.jev.whereLink")}
        </a>
      </p>
      {error && <p class="error" role="alert">{error}</p>}
      <div class="row">
        <Back setState={setState} />
        <span class="spacer" />
        <button class="btn primary" disabled={busy || !key.trim()}>{busy ? t("setup.jev.testing") : t("setup.jev.save")}</button>
      </div>
    </form>
  );
}

function Done() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <section class="panel stack wizard-body">
      <h2>{t("setup.done.title")}</h2>
      <p class="muted">{t("setup.done.body")}</p>
      <div class="row">
        <span class="spacer" />
        <button
          class="btn primary big"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            desktop().finish();
          }}
        >
          {busy ? t("setup.done.starting") : t("setup.done.start")}
        </button>
      </div>
    </section>
  );
}

function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <LangContext.Provider value={lang}>
      <Setup lang={lang} setLang={setLang} />
    </LangContext.Provider>
  );
}

render(<App />, document.getElementById("app")!);
