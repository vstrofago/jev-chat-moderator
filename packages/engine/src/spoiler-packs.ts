import { parse } from "yaml";

/**
 * A community spoiler pack: protected topics for one game or show, matched to the stream by
 * Twitch category. Checkpoints have non-spoiler names so the streamer can say how far they
 * are without reading any topic. See spoiler-packs/README.md for the format.
 */
export interface SpoilerPack {
  name: string;
  /** Twitch category id; the most reliable match. */
  categoryId?: string;
  /** Twitch category name; matched (ignoring case) when the source has no id. */
  category?: string;
  /** Always protected, wherever the streamer is. */
  topics: string[];
  /** In story order; each lists the topics revealed in that part. */
  checkpoints: { name: string; topics: string[] }[];
}

/** What the dashboard may show: names and counts, never a topic. */
export interface SpoilerPackSummary {
  name: string;
  checkpoints: string[];
  topicCount: number;
}

const MAX_TOPICS = 500;
const MAX_TEXT = 200;

export function parseSpoilerPack(text: string): { ok: true; pack: SpoilerPack } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["must be a mapping"] };
  if (raw.version !== 1) errors.push("version: must be 1");
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.push("name: required");
  const categoryId = raw.category_id === undefined ? undefined : String(raw.category_id).trim();
  const category = typeof raw.category === "string" ? raw.category.trim() : undefined;
  if (!categoryId && !category) errors.push("category_id or category: one is required");

  const topicList = (value: unknown, path: string): string[] => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      errors.push(`${path}: must be a list`);
      return [];
    }
    const out: string[] = [];
    value.forEach((t, i) => {
      if (typeof t !== "string" || !t.trim()) errors.push(`${path}.${i}: must be text`);
      else if (t.length > MAX_TEXT) errors.push(`${path}.${i}: longer than ${MAX_TEXT} characters`);
      else out.push(t.trim());
    });
    return out;
  };

  const topics = topicList(raw.topics, "topics");
  const checkpoints: SpoilerPack["checkpoints"] = [];
  if (raw.checkpoints !== undefined) {
    if (!Array.isArray(raw.checkpoints)) errors.push("checkpoints: must be a list");
    else
      raw.checkpoints.forEach((c, i) => {
        const cname = isObj(c) && typeof c.name === "string" ? c.name.trim() : "";
        if (!cname) return errors.push(`checkpoints.${i}.name: required`);
        if (checkpoints.some((x) => x.name === cname)) return errors.push(`checkpoints.${i}.name: "${cname}" is repeated`);
        checkpoints.push({ name: cname, topics: topicList((c as Record<string, unknown>).topics, `checkpoints.${i}.topics`) });
      });
  }
  const total = topics.length + checkpoints.reduce((n, c) => n + c.topics.length, 0);
  if (total === 0) errors.push("topics: the pack protects nothing");
  if (total > MAX_TOPICS) errors.push(`topics: more than ${MAX_TOPICS} in total`);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, pack: { name, categoryId: categoryId || undefined, category: category || undefined, topics, checkpoints } };
}

/** The first pack for this category: by id when both sides have one, otherwise by name. */
export function findSpoilerPack(packs: SpoilerPack[], c: { id?: string; name?: string }): SpoilerPack | undefined {
  if (c.id) {
    const byId = packs.find((p) => p.categoryId === c.id);
    if (byId) return byId;
  }
  const name = c.name?.trim().toLowerCase();
  return name ? packs.find((p) => p.category?.toLowerCase() === name) : undefined;
}

/** Where the chosen checkpoint is remembered. */
export function spoilerPackKey(p: SpoilerPack): string {
  return p.categoryId ?? `name:${p.category!.toLowerCase()}`;
}

/**
 * The topics to protect when the streamer is at `checkpoint`: the pack-wide ones, plus
 * those of that checkpoint and every later one. Unknown or no checkpoint protects all.
 */
export function activeSpoilerTopics(p: SpoilerPack, checkpoint?: string | null): string[] {
  const at = checkpoint ? p.checkpoints.findIndex((c) => c.name === checkpoint) : -1;
  const from = at < 0 ? 0 : at;
  return [...p.topics, ...p.checkpoints.slice(from).flatMap((c) => c.topics)];
}

export function summarizeSpoilerPack(p: SpoilerPack): SpoilerPackSummary {
  return {
    name: p.name,
    checkpoints: p.checkpoints.map((c) => c.name),
    topicCount: p.topics.length + p.checkpoints.reduce((n, c) => n + c.topics.length, 0),
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
