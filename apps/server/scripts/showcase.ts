/**
 * A full Vigía with a scripted chat and canned Jev answers: no key, no Twitch, no network.
 * For working on the dashboard and overlay, and for the screenshots on the landing page.
 *
 *   pnpm --filter @vigia/ui build && pnpm --filter @vigia/server-app showcase [--port 7790] [--lang es]
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { ChatAuthor, ChatMessage, Engine } from "@vigia/engine";
import { defaultUiDir, startVigia, type ChatSource } from "@vigia/server";

const { values } = parseArgs({ options: { port: { type: "string", default: "7790" }, lang: { type: "string", default: "en" } } });
const es = values.lang === "es";

const RULES = `version: 1
language: ${es ? "es" : "en"}
observe: false
defaults: { act: 0.85, unsure: 0.5 }
exempt: [broadcaster, moderators, vips]
highlights: { mode: auto, seconds: 12, includeBroadcaster: false }
rules:
  - { id: toxicity, pack: toxicity, action: timeout, seconds: 60 }
  - { id: spam, pack: spam, action: delete }
  - { id: spoilers, pack: antispoiler, action: delete, work: auto }
  - id: backseat
    question: "Does the message tell the streamer how to play without being asked?"
    yes: "Gives unrequested instructions or advice about the game"
    no: "Reactions, jokes, or answers to something the streamer asked"
    action: delete
    act: 0.9
  - { id: questions, pack: questions, action: highlight }
  - { id: interesting, pack: interesting, action: highlight }
`;

// [author, English text, Spanish text, canned probabilities per rule]
type Line = [string, string, string, Record<string, number>];
const CHAT: Line[] = [
  ["nightowl", "hi chat! first time catching this live", "hola chat! primera vez que lo veo en vivo", { interesting: 0.3 }],
  ["pixelpaula", "what controller are you using?", "¿qué control estás usando?", { questions: 0.96 }],
  ["freeviewz", "Buy followers and viewers at cheap-views dot shop", "Compra seguidores y viewers en vistas-baratas punto shop", { spam: 0.98 }],
  ["tomkat", "that dodge was insane", "qué esquive tan brutal", {}],
  ["lorekeeper", "enjoy Malenia's brother while you can ;)", "disfruta al hermano de Malenia mientras puedas ;)", { spoilers: 0.93 }],
  ["grumpy_gus", "you're so bad, uninstall already", "eres malísimo, ya desinstala", { toxicity: 0.91 }],
  ["sofi_draws", "5 years watching today! your streams got me through college", "¡hoy cumplo 5 años viéndote! tus streams me ayudaron en la universidad", { interesting: 0.94 }],
  ["backseater99", "go left, the item is on the left, LEFT", "ve a la izquierda, el objeto está a la izquierda, IZQUIERDA", { backseat: 0.88 }],
  ["mika", "is the DLC worth it?", "¿vale la pena el DLC?", { questions: 0.9 }],
  ["hypetrain", "GG GG GG", "GG GG GG", {}],
  ["vague_viewer", "the next area is where things get really wild", "el siguiente área es donde todo se pone intenso", { spoilers: 0.62 }],
  ["quietfan", "this music is so good", "qué buena está esta música", {}],
  ["rustyblade", "lol that death was kinda dumb tho", "jaja esa muerte estuvo medio tonta", { toxicity: 0.55 }],
];

const author = (login: string): ChatAuthor => ({ id: `u-${login}`, login, displayName: login, broadcaster: false, moderator: false, vip: false });
const canned = new Map(CHAT.map(([, en, esText, p]) => [es ? esText : en, p]));

let engine: Engine | undefined;
const source: ChatSource = {
  platform: { deleteMessage: async () => {}, timeout: async () => {}, ban: async () => {}, sendChat: async () => {} },
  connect(e, on) {
    engine = e;
    e.setCategory("Elden Ring", "512953");
    on.status("connected");
    return { close() {} };
  },
};

const dir = await mkdtemp(join(tmpdir(), "vigia-showcase-"));
const vigia = await startVigia({
  configPath: join(dir, "vigia.yaml"),
  dataDir: join(dir, "data"),
  uiDir: defaultUiDir(),
  exampleText: RULES,
  source,
  evaluate: async (state, questions) => {
    const p = canned.get(String((state as { message: string }).message)) ?? {};
    return Object.fromEntries(Object.keys(questions).map((id) => [id, p[id] ?? 0.04]));
  },
  port: Number(values.port),
  log: () => {},
});
vigia.store.setSetting("setupDone", true);

let seq = 0;
for (const [login, en, esText] of CHAT) {
  const text = es ? esText : en;
  const m: ChatMessage = { id: `m${++seq}`, text, author: author(login), fragments: [{ type: "text", text }] };
  await engine!.handleMessage(m);
}
console.log(`Showcase dashboard: ${vigia.url}/  (overlay: ${vigia.overlayUrl})`);
