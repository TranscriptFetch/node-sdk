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

/**
 * The show and episode behind a podcast transcript.
 *
 * Present only when the input resolved to a podcast episode. A job polled back
 * later carries the short form (show + episode); the rest is filled in on the
 * response that did the resolving, so treat every field as optional.
 */
export interface PodcastMeta {
  show: string | null;
  episode: string | null;
  publishedAt: string | null;
  feedUrl: string | null;
  audioUrl: string | null;
  /** How the link was matched to a feed, e.g. "rss" or "itunes_search". */
  resolvedVia: string | null;
}

/**
 * A single video's transcript, from any supported source.
 *
 * This also covers the "not ready yet" case. A source with no captions is
 * transcribed from its audio, and the API answers 202 with `kind:
 * "transcript_job"` and no text. `kind` is therefore a plain string rather than
 * a literal: pinning it would make a perfectly good 202 look like a wrong
 * shape. When `status` is "processing", pass `jobId` to `transcripts.job()`
 * until it reports "completed".
 */
export interface Transcript {
  /** transcript | transcript_job */
  kind: string;
  videoId: string;
  /** Source platform: youtube | tiktok | instagram | podcast | file. */
  platform: string | null;
  title: string | null;
  text: string | null;
  segments: Segment[];
  /** Set only when the input resolved to a podcast episode. */
  podcast: PodcastMeta | null;
  usage: Usage | null;
  // Envelope-level fields, lifted onto the model so an async job round-trips as
  // one object (the API returns them beside `data`, not inside it).
  /** processing | completed | failed. Only set on async transcription jobs. */
  status: string | null;
  jobId: string | null;
  /** Path to poll for the finished transcript. */
  pollUrl: string | null;
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

/** The account behind the API key, from `/me`. */
export interface Me {
  kind: "me";
  userId: string;
  /** Remaining credit balance. */
  credits: number;
  usage: Usage | null;
}

/**
 * A polled transcription job: a {@link Transcript} plus why it failed, if it did.
 *
 * It extends Transcript rather than wrapping one so the poll loop reads the
 * same whether the transcript arrived synchronously or via a job, and so the
 * completed job can be handed to anything that takes a Transcript.
 *
 * "failed" is a normal outcome here rather than an HTTP error: the endpoint
 * answers 200 in all three states and `status` carries the meaning.
 */
export interface TranscriptJob extends Transcript {
  /** Why the job failed. Only present when `status` is "failed". */
  error: { code: string | null; message: string | null } | null;
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

function normalizePodcast(raw: unknown): PodcastMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Wire;
  return {
    show: strOrNull(pick(p, "show")),
    episode: strOrNull(pick(p, "episode")),
    publishedAt: strOrNull(pick(p, "publishedAt", "published_at")),
    feedUrl: strOrNull(pick(p, "feedUrl", "feed_url")),
    audioUrl: strOrNull(pick(p, "audioUrl", "audio_url")),
    resolvedVia: strOrNull(pick(p, "resolvedVia", "resolved_via")),
  };
}

/**
 * Parse a `{ data, usage }` transcript envelope.
 *
 * `data` is null while an async job is still processing, which `obj()` already
 * absorbs, so a 202 parses into a Transcript carrying only its job fields.
 */
export function normalizeTranscript(env: Wire): Transcript {
  const d = obj(env.data);
  return {
    // Trust the wire kind: a 202 says "transcript_job", a finished one says
    // "transcript".
    kind: str(pick(d, "kind")) || "transcript",
    videoId: str(pick(d, "videoId", "video_id")),
    platform: strOrNull(pick(d, "platform")),
    title: strOrNull(pick(d, "title")),
    text: strOrNull(pick(d, "text")),
    segments: normalizeSegments(d.segments),
    podcast: normalizePodcast(d.podcast),
    usage: normalizeUsage(env),
    status: strOrNull(pick(env, "status")),
    jobId: strOrNull(pick(env, "jobId", "job_id")),
    pollUrl: strOrNull(pick(env, "pollUrl", "poll_url")),
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

/** Parse a `{ data, usage }` account envelope. */
export function normalizeMe(env: Wire): Me {
  const d = obj(env.data);
  return {
    kind: "me",
    userId: str(pick(d, "userId", "user_id")),
    credits: num(pick(d, "credits")),
    usage: normalizeUsage(env),
  };
}

/**
 * Parse a job-poll envelope: a transcript envelope that may also carry an
 * `error` block, which a failed job delivers at HTTP 200 alongside `ok: false`.
 */
export function normalizeJob(env: Wire): TranscriptJob {
  const rawError = obj(env.error);
  const hasError = env.error != null && typeof env.error === "object";
  return {
    ...normalizeTranscript(env),
    error: hasError
      ? { code: strOrNull(pick(rawError, "code")), message: strOrNull(pick(rawError, "message")) }
      : null,
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
