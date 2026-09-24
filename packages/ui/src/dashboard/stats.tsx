import { useEffect, useState } from "preact/hooks";
import { api, type AuditEntry, type Stats, type User } from "./api";
import { useT } from "./i18n";
import { Empty } from "./shared";

export function StatsTab({ stats, user }: { stats: Stats | null; user: User }) {
  const t = useT();
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    if (user.role === "broadcaster") api<AuditEntry[]>("GET", "/api/audit").then(setAudit);
  }, [user.role]);
  const figures: [string, string][] = stats
    ? [
        [t("stats.perMinute"), String(stats.messagesPerMinute)],
        [t("stats.hour"), String(stats.messagesLastHour)],
        [t("stats.actions"), String(stats.actionsLastHour)],
        [t("stats.cost"), `$${stats.costPerHour.toFixed(3)}`],
      ]
    : [];
  return (
    <section class="stack page">
      <h2>{t("tab.stats")}</h2>
      {stats ? (
        <dl class="figures">
          {figures.map(([label, value]) => (
            <div key={label} class="figure">
              <dt class="muted small">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p class="muted">{t("stats.waiting")}</p>
      )}
      <p class="muted small">{t("stats.costNote")}</p>
      {audit && (
        <div class="stack">
          <h3>{t("audit.title")}</h3>
          {audit.length === 0 ? (
            <Empty title={t("audit.empty")} />
          ) : (
            <table class="audit">
              <thead>
                <tr>
                  <th>{t("audit.when")}</th>
                  <th>{t("audit.who")}</th>
                  <th>{t("audit.what")}</th>
                  <th>{t("audit.target")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={`${a.ts}${a.action}${a.target}`}>
                    <td>{new Date(a.ts).toLocaleString()}</td>
                    <td>{a.login}</td>
                    <td>{t(`audit.action.${a.action}`)}{a.detail ? ` (${a.detail})` : ""}</td>
                    <td>{a.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
