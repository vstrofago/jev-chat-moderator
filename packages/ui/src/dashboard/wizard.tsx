import { useState } from "preact/hooks";
import { api, type Overview } from "./api";
import { saveLang, useT, type Lang } from "./i18n";
import { Mark } from "./app";
import { OverlayPanel } from "./settings";
import { useRun } from "./toast";

const STEPS = ["language", "rules", "spoilers", "overlay", "observe"] as const;

/** First run: the choices the host owns. Keys and the Twitch login come from the app or env. */
export function Wizard({ overview, lang, setLang, reload, done }: { overview: Overview; lang: Lang; setLang(l: Lang): void; reload(): void; done(): void }) {
  const t = useT();
  const run = useRun();
  const [step, setStep] = useState(0);
  const c = overview.config;
  const spoiler = c.rules.find((r) => "pack" in r && r.pack === "antispoiler");
  const [progress, setProgress] = useState(spoiler && "pack" in spoiler ? (spoiler.progress ?? "") : "");
  const name = STEPS[step];

  const next = async () => {
    if (name === "spoilers" && spoiler) {
      await run("", () => api("PATCH", `/api/rules/${spoiler.id}`, { progress: progress.trim() || null }));
    }
    if (step < STEPS.length - 1) return setStep(step + 1);
    await run("", () => api("POST", "/api/state", { setupDone: true }));
    done();
  };

  return (
    <div class="wizard">
      <div class="brand">
        <Mark />
        <span>Vigia</span>
      </div>
      <ol class="wizard-steps" aria-label={t("wizard.progress")}>
        {STEPS.map((s, i) => (
          <li key={s} class={i === step ? "now" : i < step ? "past" : ""} aria-current={i === step ? "step" : undefined}>
            <span class="step-n">{i + 1}</span> {t(`wizard.${s}.short`)}
          </li>
        ))}
      </ol>
      <section class="panel stack wizard-body">
        <h2>{t(`wizard.${name}.title`)}</h2>
        <p class="muted">{t(`wizard.${name}.body`)}</p>

        {name === "language" && (
          <div class="rule-grid">
            <label class="field">
              <span>{t("settings.uiLang")}</span>
              <select
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
            </label>
            <label class="field">
              <span>{t("settings.botLang")}</span>
              <select value={c.language} onChange={(e) => run("", () => api("PATCH", "/api/settings", { language: e.currentTarget.value })).then(reload)}>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </label>
          </div>
        )}

        {name === "rules" && (
          <ul class="wizard-rules">
            {c.rules.map((r) => (
              <li key={r.id}>
                <label class="check">
                  <input
                    type="checkbox"
                    checked={r.enabled !== false}
                    onChange={(e) => run("", () => api("PATCH", `/api/rules/${r.id}`, { enabled: e.currentTarget.checked })).then(reload)}
                  />
                  <span>
                    <b>{r.id}</b> <span class="muted">{"pack" in r ? t(`pack.${r.pack}`) : r.question}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {name === "spoilers" &&
          (spoiler ? (
            <label class="field">
              <span>{t("spoiler.progress")}</span>
              <input type="text" value={progress} placeholder={t("spoiler.progress.placeholder")} onInput={(e) => setProgress(e.currentTarget.value)} />
            </label>
          ) : (
            <p class="notice">{t("wizard.spoilers.none")}</p>
          ))}

        {name === "overlay" && (overview.overlayUrl ? <OverlayPanel url={overview.overlayUrl} /> : <p class="notice">{t("wizard.overlay.mods")}</p>)}

        {name === "observe" && <p class="notice">{t("wizard.observe.note")}</p>}

        <div class="row">
          {step > 0 && <button class="btn quiet" onClick={() => setStep(step - 1)}>{t("wizard.back")}</button>}
          <span class="spacer" />
          <button class="btn primary" onClick={next}>{step === STEPS.length - 1 ? t("wizard.finish") : t("wizard.next")}</button>
        </div>
      </section>
    </div>
  );
}
