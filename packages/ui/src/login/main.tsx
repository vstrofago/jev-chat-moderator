import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "../styles/app.css";
import "../styles/dashboard.css";
import { api, ApiError } from "../dashboard/api";
import { Mark } from "../dashboard/app";
import { initialLang, LangContext, useT } from "../dashboard/i18n";

const STATE_KEY = "vigia.oauth.state";

function Login() {
  const t = useT();
  const [info, setInfo] = useState<{ mode: string; twitchClientId: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = async (call: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await call();
      location.replace("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  };

  useEffect(() => {
    api<{ mode: string; twitchClientId: string | null }>("GET", "/api/login-info").then((i) => {
      if (i.mode === "local") return location.replace("/");
      setInfo(i);
      // Back from Twitch: the token is in the fragment, which never reaches any server log.
      const hash = new URLSearchParams(location.hash.slice(1));
      const token = hash.get("access_token");
      if (location.pathname === "/auth/callback" && token) {
        const expected = sessionStorage.getItem(STATE_KEY);
        sessionStorage.removeItem(STATE_KEY);
        history.replaceState(null, "", "/login");
        if (!expected || hash.get("state") !== expected) return setError(t("login.stateError"));
        finish(() => api("POST", "/api/login/twitch", { token }));
      } else if (location.pathname === "/auth/callback") {
        setError(t("login.twitchDenied"));
      }
    });
  }, []);

  const twitch = () => {
    const state = crypto.randomUUID();
    sessionStorage.setItem(STATE_KEY, state);
    const q = new URLSearchParams({
      response_type: "token",
      client_id: info!.twitchClientId!,
      redirect_uri: `${location.origin}/auth/callback`,
      scope: "",
      state,
    });
    location.href = `https://id.twitch.tv/oauth2/authorize?${q}`;
  };

  return (
    <main class="login">
      <div class="panel stack login-card">
        <div class="brand">
          <Mark />
          <span>Vigia</span>
        </div>
        <h1>{t("login.title")}</h1>
        {info?.twitchClientId && (
          <>
            <button class="btn primary big" disabled={busy} onClick={twitch}>{t("login.twitch")}</button>
            <p class="muted small">{t("login.twitchHelp")}</p>
          </>
        )}
        <form
          class="stack"
          onSubmit={(e) => {
            e.preventDefault();
            finish(() => api("POST", "/api/login/code", { code }));
          }}
        >
          <label class="field">
            <span>{t("login.code")}</span>
            <input type="password" autoComplete="off" value={code} onInput={(e) => setCode(e.currentTarget.value)} />
          </label>
          <p class="muted small">{t("login.codeHelp")}</p>
          <button class="btn" disabled={busy || !code.trim()}>{t("login.codeSubmit")}</button>
        </form>
        {error && <p class="error" role="alert">{error}</p>}
      </div>
    </main>
  );
}

render(
  <LangContext.Provider value={initialLang()}>
    <Login />
  </LangContext.Provider>,
  document.getElementById("app")!,
);
