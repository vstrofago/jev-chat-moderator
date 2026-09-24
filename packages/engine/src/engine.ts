import { AuthError } from "@vigia/core";
import { parseCommand, type Command } from "./commands";
import { isPackRule, parseConfig, type ConfigResult, type Rule, type VigiaConfig } from "./config";
import { combine, type Outcome, type RuleVerdict } from "./decide";
import type { Evaluator } from "./evaluator";
import { isEmoteOnly, type ChatMessage, type Fragment } from "./message";
import { createPriorityQueue, DroppedError } from "./priority-queue";
import { reply, type ReplyKey } from "./replies";
import { buildRequest } from "./request";

export type { Evaluator } from "./evaluator";

/** What the engine needs from a streaming platform. Twitch implements it in M2. */
export interface ChatPlatform {
  deleteMessage(messageId: string): Promise<void>;
  timeout(userId: string, seconds: number, reason: string): Promise<void>;
  sendChat(text: string, replyToId?: string): Promise<void>;
  /** Manual bans from the dashboard only; rules can never ban. */
  ban?(userId: string, reason: string): Promise<void>;
}

export interface HighlightItem {
  id: string;
  kind: "question" | "highlight" | "announcement";
  text: string;
  authorName?: string;
  fragments?: Fragment[];
  ruleId?: string;
  source: "rule" | "command";
}

export interface RuntimeState {
  /** Moderation actions stopped by `!vigia pause`; highlights continue. */
  paused: boolean;
  /** Decisions are logged but nothing is done in chat. On right after setup. */
  observe: boolean;
  /** Jev rejected the key; nothing is evaluated until a new evaluator is set. */
  halted: boolean;
  progress?: string;
  category?: string;
  disabledRules: string[];
  /** Only the count: the topics themselves must never reach the streamer. */
  protectedTopicCount: number;
}

export type EngineEvent =
  | { type: "decision"; message: ChatMessage; outcome: Outcome; applied: boolean }
  | { type: "highlight"; item: HighlightItem }
  | { type: "clear-highlight" }
  | { type: "state"; state: RuntimeState }
  | { type: "warning"; code: "jev-unavailable" | "jev-auth" | "platform-error" | "dropped"; detail: string };

export interface EngineOptions {
  config: VigiaConfig;
  platform: ChatPlatform;
  evaluate: Evaluator;
  /** Keep observe mode on whatever the config or dashboard says (the read-only tools). */
  forceObserve?: boolean;
  concurrency?: number;
  maxPending?: number;
}

export function createEngine(o: EngineOptions) {
  let config = o.config;
  let evaluate = o.evaluate;
  let protectedTopics: string[] = [];
  const state: Omit<RuntimeState, "protectedTopicCount"> = {
    paused: false,
    observe: true,
    halted: false,
    disabledRules: [],
  };

  /** The file is the source of truth for observe mode, rule switches and progress. */
  function seedFromConfig() {
    state.observe = o.forceObserve || config.observe;
    state.disabledRules = config.rules.filter((r) => r.enabled === false).map((r) => r.id);
    const spoiler = config.rules.find((r) => isPackRule(r) && r.pack === "antispoiler");
    state.progress = spoiler && isPackRule(spoiler) ? spoiler.progress : undefined;
  }
  seedFromConfig();
  const maxPending = o.maxPending ?? 200;
  const queue = createPriorityQueue({ concurrency: o.concurrency ?? 8, maxPending });
  const listeners = new Set<(e: EngineEvent) => void>();
  let highlightSeq = 0;

  const snapshot = (): RuntimeState => ({
    ...state,
    disabledRules: [...state.disabledRules],
    protectedTopicCount: protectedTopics.length,
  });
  // A failing listener (a UI bug) must never stop moderation or crash the process.
  const emit = (e: EngineEvent) =>
    listeners.forEach((l) => {
      try {
        l(e);
      } catch (err) {
        console.error("Vigía event listener failed:", err);
      }
    });
  const changed = () => emit({ type: "state", state: snapshot() });
  const warn = (code: Extract<EngineEvent, { type: "warning" }>["code"], e: unknown) =>
    emit({ type: "warning", code, detail: e instanceof Error ? e.message : String(e) });

  async function platformCall(call: () => Promise<void>) {
    try {
      await call();
    } catch (e) {
      warn("platform-error", e);
    }
  }

  const say = (m: ChatMessage, key: ReplyKey, vars?: Record<string, string>) =>
    platformCall(() => o.platform.sendChat(reply(config.language, key, vars), m.id));

  function highlight(item: Omit<HighlightItem, "id">) {
    emit({ type: "highlight", item: { id: `h${++highlightSeq}`, ...item } });
  }

  async function runCommand(cmd: Command, m: ChatMessage) {
    switch (cmd.kind) {
      case "pause":
      case "resume":
        state.paused = cmd.kind === "pause";
        changed();
        return say(m, state.paused ? "paused" : "resumed");
      case "progress":
        state.progress = cmd.text;
        changed();
        return say(m, "progress", { progress: cmd.text });
      case "rule": {
        if (!config.rules.some((r) => r.id === cmd.id)) return say(m, "unknownRule", { id: cmd.id });
        state.disabledRules = state.disabledRules.filter((id) => id !== cmd.id);
        if (!cmd.enabled) state.disabledRules.push(cmd.id);
        changed();
        return say(m, cmd.enabled ? "ruleOn" : "ruleOff", { id: cmd.id });
      }
      case "highlight":
        if (cmd.text) return highlight({ kind: "announcement", text: cmd.text, source: "command" });
        if (m.replyTo) {
          return highlight({ kind: "highlight", text: m.replyTo.text, authorName: m.replyTo.authorLogin, source: "command" });
        }
        return say(m, "highlightUsage");
      case "clear":
        return emit({ type: "clear-highlight" });
      case "status": {
        const yes = config.language === "es" ? "sí" : "yes";
        const flag = (b: boolean) => (b ? yes : "no");
        const rules = activeRules().map((r) => r.id).join(", ") || "-";
        return say(m, "status", { rules, paused: flag(state.paused), observe: flag(state.observe) });
      }
      case "invalid":
        return say(m, "help");
    }
  }

  const activeRules = () => config.rules.filter((r) => !state.disabledRules.includes(r.id));

  /**
   * Rules to ask about for this message. When the queue is half full (a raid), highlight
   * questions are left out so moderation keeps up; exempt authors' highlight-only calls
   * are then dropped by the queue first.
   */
  function rulesFor(m: ChatMessage): Rule[] {
    const busy = queue.pending() >= maxPending / 2;
    const a = m.author;
    const exempt =
      (a.broadcaster && config.exempt.includes("broadcaster")) ||
      (a.moderator && config.exempt.includes("moderators")) ||
      (a.vip && config.exempt.includes("vips"));
    return activeRules().filter((r) => {
      if (r.action !== "highlight") return !exempt && !state.paused;
      if (a.broadcaster && !config.highlights.includeBroadcaster) return false;
      return !busy || exempt;
    });
  }

  async function apply(m: ChatMessage, outcome: Outcome, rules: Rule[]) {
    const mod = outcome.moderation;
    const acts = mod !== null && mod.action !== "log";
    const applied = acts && !state.observe;
    if (applied && mod.action === "delete") await platformCall(() => o.platform.deleteMessage(m.id));
    if (applied && mod.action === "timeout") {
      await platformCall(() => o.platform.timeout(m.author.id, mod.seconds ?? 60, `Vigía: ${mod.ruleId}`));
    }
    emit({ type: "decision", message: m, outcome, applied });

    if (outcome.highlight && config.highlights.mode === "auto") {
      const rule = rules.find((r) => r.id === outcome.highlight!.ruleId);
      highlight({
        kind: rule && isPackRule(rule) && rule.pack === "questions" ? "question" : "highlight",
        text: m.text,
        authorName: m.author.displayName,
        fragments: m.fragments,
        ruleId: outcome.highlight.ruleId,
        source: "rule",
      });
    }
  }

  return {
    async handleMessage(m: ChatMessage): Promise<void> {
      const cmd = parseCommand(m.text);
      if (cmd && (m.author.broadcaster || m.author.moderator)) return runCommand(cmd, m);
      if (state.halted) return;

      const rules = rulesFor(m);
      if (rules.length === 0) return;
      const { state: jevState, questions } = buildRequest(m, rules, {
        category: state.category,
        progress: state.progress,
        protectedTopics,
        emotes: config.emotes,
      });
      const priority = rules.some((r) => r.action !== "highlight") ? "high" : "low";

      let probabilities: Record<string, number>;
      try {
        probabilities = await queue.push(() => evaluate(jevState, questions), priority);
      } catch (e) {
        if (e instanceof AuthError) {
          state.halted = true;
          warn("jev-auth", e);
          changed();
        } else warn(e instanceof DroppedError ? "dropped" : "jev-unavailable", e);
        return;
      }
      const outcome = combine(probabilities, rules, config.defaults, { emoteOnly: isEmoteOnly(m) });
      await apply(m, outcome, rules);
    },

    /** The dashboard's test box: every enabled rule on `text`, without acting or logging. */
    async test(text: string): Promise<RuleVerdict[]> {
      const rules = activeRules();
      if (rules.length === 0) return [];
      const m: ChatMessage = {
        id: "test",
        text,
        author: { id: "test", login: "test", displayName: "test", broadcaster: false, moderator: false, vip: false },
        fragments: [{ type: "text", text }],
      };
      const { state: jevState, questions } = buildRequest(m, rules, {
        category: state.category,
        progress: state.progress,
        protectedTopics,
        emotes: config.emotes,
      });
      const probabilities = await evaluate(jevState, questions);
      return combine(probabilities, rules, config.defaults, { emoteOnly: isEmoteOnly(m) }).verdicts;
    },

    setPaused(on: boolean) {
      state.paused = on;
      changed();
    },

    /** Parses and applies new YAML. On errors the previous config keeps running. */
    updateConfig(text: string): ConfigResult {
      const r = parseConfig(text);
      if (r.ok) {
        config = r.config;
        seedFromConfig();
        changed();
      }
      return r;
    },
    setConfig(c: VigiaConfig) {
      config = c;
      seedFromConfig();
      changed();
    },
    setCategory(name: string | undefined) {
      state.category = name;
      changed();
    },
    setProtectedTopics(topics: string[]) {
      protectedTopics = [...topics];
      changed();
    },
    setObserve(on: boolean) {
      state.observe = o.forceObserve || on;
      changed();
    },
    /** Replaces the evaluator (for example after a new key) and clears `halted`. */
    setEvaluator(e: Evaluator) {
      evaluate = e;
      state.halted = false;
      changed();
    },
    state: snapshot,
    on(listener: (e: EngineEvent) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
