import type { ExemptRole } from "@vigia/engine";
import { useState } from "preact/hooks";
import { api, type Overview } from "./api";
import { saveLang, useT, type Lang } from "./i18n";
import { useRun } from "./toast";

const ROLES: ExemptRole[] = ["broadcaster", "moderators", "vips"];

export function SettingsTab({ overview, lang, setLang, reload }: { overview: Overview; lang: Lang; setLang(l: Lang): void; reload(): void }) {
  const t = useT();
  const run = useRun();
  const c = overview.config;
  const patch = (body: unknown) => run(t("done.saved"), () => api("PATCH", "/api/settings", body)).then(reload);
  return (
    <section class="stack page">
      <h2>{t("tab.settings")}</h2>

      <div class="panel stack">
        <h3>{t("settings.languages")}</h3>
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
            <select value={c.language} onChange={(e) => patch({ language: e.currentTarget.value })}>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
        </div>
      </div>

      <div class="panel stack">
        <h3>{t("settings.highlights")}</h3>
        <div class="rule-grid">
          <label class="field">
            <span>{t("settings.highlightMode")}</span>
            <select value={c.highlights.mode} onChange={(e) => patch({ highlights: { mode: e.currentTarget.value } })}>
              <option value="auto">{t("settings.mode.auto")}</option>
              <option value="approve">{t("settings.mode.approve")}</option>
            </select>
          </label>
          <SecondsField value={c.highlights.seconds} onSave={(s) => patch({ highlights: { seconds: s } })} />
        </div>
        <label class="check">
          <input type="checkbox" checked={c.highlights.includeBroadcaster} onChange={(e) => patch({ highlights: { includeBroadcaster: e.currentTarget.checked } })} />
          <span>{t("settings.includeBroadcaster")}</span>
        </label>
      </div>

      <div class="panel stack">
        <h3>{t("settings.exempt")}</h3>
        <p class="muted small">{t("settings.exempt.help")}</p>
        <div class="row">
          {ROLES.map((r) => (
            <label key={r} class="check">
              <input
                type="checkbox"
                checked={c.exempt.includes(r)}
                onChange={(e) => patch({ exempt: e.currentTarget.checked ? [...c.exempt, r] : c.exempt.filter((x) => x !== r) })}
              />
              <span>{t(`role.${r}`)}</span>
            </label>
          ))}
        </div>
      </div>

      {overview.overlayUrl && <OverlayPanel url={overview.overlayUrl} />}

      <div class="panel stack">
        <h3>{t("settings.connection")}</h3>
        <p class="muted">{overview.mode === "local" ? t("settings.mode.local") : t("settings.mode.exposed")}</p>
        {overview.user.role === "broadcaster" && overview.mode === "exposed" && <p class="muted small">{t("settings.adminCode")}</p>}
      </div>
    </section>
  );
}

function SecondsField({ value, onSave }: { value: number; onSave(s: number): void }) {
  const t = useT();
  const [v, setV] = useState(value);
  return (
    <label class="field">
      <span>{t("settings.seconds")}</span>
      <div class="row">
        <input type="number" min={3} max={120} value={v} onInput={(e) => setV(Number(e.currentTarget.value))} />
        <button class="btn" disabled={v === value || !(v > 0)} onClick={() => onSave(v)}>{t("rules.save")}</button>
      </div>
    </label>
  );
}

export function OverlayPanel({ url }: { url: string }) {
  const t = useT();
  const run = useRun();
  const [theme, setTheme] = useState("default");
  const [pos, setPos] = useState("bl");
  const full = `${url}${theme !== "default" ? `&theme=${theme}` : ""}${pos !== "bl" ? `&pos=${pos}` : ""}`;
  return (
    <div class="panel stack">
      <h3>{t("overlay.title")}</h3>
      <p class="muted small">{t("overlay.help")}</p>
      <div class="rule-grid">
        <label class="field">
          <span>{t("overlay.theme")}</span>
          <select value={theme} onChange={(e) => setTheme(e.currentTarget.value)}>
            <option value="default">{t("overlay.theme.default")}</option>
            <option value="minimal">{t("overlay.theme.minimal")}</option>
            <option value="neon">{t("overlay.theme.neon")}</option>
          </select>
        </label>
        <label class="field">
          <span>{t("overlay.pos")}</span>
          <select value={pos} onChange={(e) => setPos(e.currentTarget.value)}>
            {["bl", "bc", "br", "tl", "tr"].map((p) => (
              <option key={p} value={p}>{t(`overlay.pos.${p}`)}</option>
            ))}
          </select>
        </label>
      </div>
      <div class="row">
        <input type="text" readOnly value={full} onFocus={(e) => e.currentTarget.select()} aria-label={t("overlay.url")} />
        <button class="btn primary" onClick={() => run(t("done.copied"), () => navigator.clipboard.writeText(full))}>{t("overlay.copy")}</button>
        <a class="btn" href={`${full}&preview=1`} target="_blank" rel="noreferrer">{t("overlay.preview")}</a>
      </div>
      <p class="muted small">{t("overlay.secret")}</p>
    </div>
  );
}
