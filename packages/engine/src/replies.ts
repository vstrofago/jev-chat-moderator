export type ReplyKey =
  | "paused"
  | "resumed"
  | "progress"
  | "ruleOn"
  | "ruleOff"
  | "unknownRule"
  | "highlightUsage"
  | "cleared"
  | "status"
  | "help";

const REPLIES: Record<"en" | "es", Record<ReplyKey, string>> = {
  en: {
    paused: "Vigia paused: no automatic moderation until !vigia resume. Highlights continue.",
    resumed: "Vigia is moderating again.",
    progress: "Anti-spoiler progress set to: {progress}",
    ruleOn: "Rule {id} is on.",
    ruleOff: "Rule {id} is off.",
    unknownRule: "There is no rule called {id}.",
    highlightUsage: 'Reply to a message with !vigia highlight, or write !vigia highlight "text".',
    cleared: "Overlay cleared.",
    status: "Active rules: {rules}. Paused: {paused}. Observe mode: {observe}.",
    help: "Commands: pause, resume, progress, rule <id> on/off, highlight, clear, status.",
  },
  es: {
    paused: "Vigia en pausa: sin moderación automática hasta !vigia sigue. Los destacados continúan.",
    resumed: "Vigia vuelve a moderar.",
    progress: "Progreso del antispoiler: {progress}",
    ruleOn: "Regla {id} activada.",
    ruleOff: "Regla {id} desactivada.",
    unknownRule: "No existe la regla {id}.",
    highlightUsage: 'Responde a un mensaje con !vigia destaca, o escribe !vigia destaca "texto".',
    cleared: "Overlay limpio.",
    status: "Reglas activas: {rules}. En pausa: {paused}. Modo observación: {observe}.",
    help: "Comandos: pausa, sigue, progreso, regla <id> on/off, destaca, limpia, estado.",
  },
};

export function reply(lang: "en" | "es", key: ReplyKey, vars: Record<string, string> = {}): string {
  return REPLIES[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? "");
}
