export type Command =
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "status" }
  | { kind: "clear" }
  | { kind: "progress"; text: string }
  | { kind: "rule"; id: string; enabled: boolean }
  | { kind: "highlight"; text?: string }
  | { kind: "invalid" };

// Every command has an English name and a Spanish alias.
const VERBS: Record<string, Command["kind"]> = {
  pause: "pause",
  pausa: "pause",
  resume: "resume",
  sigue: "resume",
  status: "status",
  estado: "status",
  clear: "clear",
  limpia: "clear",
  progress: "progress",
  progreso: "progress",
  rule: "rule",
  regla: "rule",
  highlight: "highlight",
  destaca: "highlight",
};
const ON = new Set(["on", "si", "sí"]);
const OFF = new Set(["off", "no"]);

// Twitch starts the text of a reply with "@author ".
const COMMAND = /^\s*(?:@\w+\s+)?!vigia(?:\s+(.*))?$/is;

/** Parses `!vigia ...`. Returns null when the text is not a Vigía command at all. */
export function parseCommand(text: string): Command | null {
  const match = COMMAND.exec(text);
  if (!match) return null;
  const rest = (match[1] ?? "").trim();
  const [verb = "", ...args] = rest.split(/\s+/);
  const kind = VERBS[verb.toLowerCase()];
  const argText = unquote(rest.slice(verb.length).trim());

  switch (kind) {
    case "pause":
    case "resume":
    case "status":
    case "clear":
      return { kind };
    case "progress":
      return argText ? { kind, text: argText } : { kind: "invalid" };
    case "highlight":
      return argText ? { kind, text: argText } : { kind };
    case "rule": {
      const [id, state] = args;
      const flag = state?.toLowerCase() ?? "";
      if (args.length !== 2 || !(ON.has(flag) || OFF.has(flag))) return { kind: "invalid" };
      return { kind, id, enabled: ON.has(flag) };
    }
    default:
      return { kind: "invalid" };
  }
}

function unquote(s: string): string {
  const m = /^(["“”])(.*)(["“”])$/s.exec(s);
  return (m ? m[2] : s).trim();
}
