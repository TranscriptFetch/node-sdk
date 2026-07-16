/**
 * Typed response models, matching the TranscriptFetch API schemas.
 *
 * The API mixes snake_case (transcript/list envelopes) and camelCase (video
 * list items). The `normalize*` helpers accept either wire shape and return
 * clean camelCase objects, so consumers never see the inconsistency.
 */

/** Credit + byte accounting returned alongside every successful response. */
export interface Usage {
  creditsSpent: number;
  /** null for unlimited (admin) accounts. */
  balance: number | null;
  bytes: number;
}

/** A single timestamped caption cue. */
export interface Segment {
  start: number;
  duration: number;
  text: string;
}

/** A single video's transcript. */
export interface Transcript {
  kind: "transcript";
  videoId: string;
  title: string | null;
  text: string | null;
  segments: Segment[];
  usage: Usage | null;
}

/** A video reference from a channel/playlist/search list (metadata only). */
export interface Video {
  videoId: string;
  title: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  channel: string | null;
}

/** A paginated list of videos. */
export interface VideoList {
  kind: "video_list";
  source: string;
  videos: Video[];
  nextCursor: string | null;
  usage: Usage | null;
}

/** One video's result inside a batch response. */
export interface BatchResult {
  videoId: string;
  /** ok | no_transcript | blocked | error | null */
  outcome: string | null;
  title: string | null;
  text: string | null;
  segments: Segment[] | null;
  cached: boolean;
  bytes: number;
}

/** Result of a batch fetch. */
export interface BatchResponse {
  kind: "transcript_batch";
  results: BatchResult[];
  usage: Usage | null;
}

/** The public health-check body. */
export interface Health {
  status: string;
  service: string;
  version: string;
  time: string;
}

// ── Wire helpers ──────────────────────────────────────────────────────────────

type Wire = Record<string, unknown>;

function obj(value: unknown): Wire {
  return value && typeof value === "object" ? (value as Wire) : {};
}

/** Read the first present key (supports both snake_case and camelCase wire names). */
function pick(source: Wire, ...keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSegment(raw: unknown): Segment {
  const s = obj(raw);
  return { start: num(s.start), duration: num(s.duration), text: str(s.text) };
}

function normalizeSegments(raw: unknown): Segment[] {
  return Array.isArray(raw) ? raw.map(normalizeSegment) : [];
}

function normalizeUsage(env: Wire): Usage | null {
  const raw = env.usage;
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Wire;
  return {
    creditsSpent: num(pick(u, "creditsSpent", "credits_spent")),
    balance: numOrNull(pick(u, "balance")),
    bytes: num(pick(u, "bytes")),
  };
}

function normalizeVideo(raw: unknown): Video {
  const v = obj(raw);
  return {
    videoId: str(pick(v, "videoId", "video_id")),
    title: strOrNull(pick(v, "title")),
    thumbnailUrl: strOrNull(pick(v, "thumbnailUrl", "thumbnail_url")),
    duration: numOrNull(pick(v, "duration")),
    channel: strOrNull(pick(v, "channel")),
  };
}

/** Parse a `{ data, usage }` transcript envelope. */
export function normalizeTranscript(env: Wire): Transcript {
  const d = obj(env.data);
  return {
    kind: "transcript",
    videoId: str(pick(d, "videoId", "video_id")),
    title: strOrNull(pick(d, "title")),
    text: strOrNull(pick(d, "text")),
    segments: normalizeSegments(d.segments),
    usage: normalizeUsage(env),
  };
}

/** Parse a `{ data, usage }` video-list envelope. */
export function normalizeVideoList(env: Wire): VideoList {
  const d = obj(env.data);
  const videos = Array.isArray(d.videos) ? d.videos.map(normalizeVideo) : [];
  return {
    kind: "video_list",
    source: str(pick(d, "source")),
    videos,
    nextCursor: strOrNull(pick(d, "nextCursor", "next_cursor")),
    usage: normalizeUsage(env),
  };
}

/** Parse a `{ data, usage }` batch envelope. */
export function normalizeBatch(env: Wire): BatchResponse {
  const d = obj(env.data);
  const rawResults = Array.isArray(d.results) ? d.results : [];
  const results: BatchResult[] = rawResults.map((raw) => {
    const r = obj(raw);
    const segments = r.segments;
    return {
      videoId: str(pick(r, "videoId", "video_id")),
      outcome: strOrNull(pick(r, "outcome")),
      title: strOrNull(pick(r, "title")),
      text: strOrNull(pick(r, "text")),
      segments: Array.isArray(segments) ? normalizeSegments(segments) : null,
      cached: pick(r, "cached") === true,
      bytes: num(pick(r, "bytes")),
    };
  });
  return { kind: "transcript_batch", results, usage: normalizeUsage(env) };
}
