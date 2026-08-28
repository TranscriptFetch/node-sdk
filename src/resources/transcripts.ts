/**
 * The `transcripts` resource: video / batch / channel / playlist / search /
 * job, plus auto-paginating async iterators.
 */

import type { TranscriptFetch } from "../client";
import {
  normalizeBatch,
  normalizeJob,
  normalizeTranscript,
  normalizeVideoList,
  type BatchResponse,
  type Transcript,
  type TranscriptJob,
  type Video,
  type VideoList,
} from "../models";

const VIDEO = "/api/v1/transcripts/video";
const CHANNEL = "/api/v1/transcripts/channel";
const PLAYLIST = "/api/v1/transcripts/playlist";
const SEARCH = "/api/v1/transcripts/search";
const BATCH = "/api/v1/transcripts/batch";
const JOBS = "/api/v1/transcripts/jobs";

/** Options for the paginated list endpoints (channel, playlist, search). */
export interface ListOptions {
  /** Page size. */
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor?: string;
  /** Override the auto-generated Idempotency-Key. */
  idempotencyKey?: string;
}

function listBody(key: string, value: string, options: ListOptions): Record<string, unknown> {
  const body: Record<string, unknown> = { [key]: value };
  if (options.limit != null) body["limit"] = options.limit;
  if (options.cursor != null) body["cursor"] = options.cursor;
  return body;
}

export class Transcripts {
  constructor(private readonly client: TranscriptFetch) {}

  /**
   * Fetch a single transcript (text + timestamped segments).
   *
   * Accepts a YouTube, TikTok or Instagram URL, a bare YouTube video ID, a
   * direct media file URL, or a podcast link (Spotify, Apple Podcasts, or an
   * RSS feed), which is resolved to that episode's audio and comes back with a
   * `podcast` block. The string is passed through to the API untouched, so
   * newly supported inputs work without an SDK upgrade.
   *
   * A source with no captions is transcribed from its audio, and the result
   * comes back as a job: `status` is "processing" and `jobId` is set, with no
   * text yet. Poll {@link job} with that id until it reports "completed".
   */
  async video(video: string, options: { idempotencyKey?: string } = {}): Promise<Transcript> {
    const env = await this.client.request("POST", VIDEO, {
      body: { video },
      idempotent: true,
      idempotencyKey: options.idempotencyKey,
    });
    return normalizeTranscript(env);
  }

  /** List a channel's videos (metadata only), one page. */
  async channel(channel: string, options: ListOptions = {}): Promise<VideoList> {
    const env = await this.client.request("POST", CHANNEL, {
      body: listBody("channel", channel, options),
      idempotent: true,
      idempotencyKey: options.idempotencyKey,
    });
    return normalizeVideoList(env);
  }

  /** List a playlist's videos (metadata only), one page. */
  async playlist(playlist: string, options: ListOptions = {}): Promise<VideoList> {
    const env = await this.client.request("POST", PLAYLIST, {
      body: listBody("playlist", playlist, options),
      idempotent: true,
      idempotencyKey: options.idempotencyKey,
    });
    return normalizeVideoList(env);
  }

  /** Search YouTube and return matching videos (metadata only), one page. */
  async search(query: string, options: ListOptions = {}): Promise<VideoList> {
    const env = await this.client.request("POST", SEARCH, {
      body: listBody("query", query, options),
      idempotent: true,
      idempotencyKey: options.idempotencyKey,
    });
    return normalizeVideoList(env);
  }

  /**
   * Fetch up to 50 transcripts in one call. Same accepted inputs as
   * {@link video}. Charges 1 credit per successfully fetched transcript;
   * failed entries are free.
   *
   * Entries with no caption track are transcribed from their audio by default:
   * those come back as outcome "processing" with a `jobId`, cost nothing on
   * this call, and are charged on delivery at the audio rate. Re-send the same
   * batch once they have finished (the text then returns normally), or poll
   * {@link job} - polling is optional. Pass `mode: "captions"` to keep the old
   * behaviour and have captionless entries fail as no_transcript instead.
   * ("audio" is not accepted on batch - use {@link video} per source to force
   * transcription.)
   */
  async batch(
    videoIds: string[],
    options: { mode?: "auto" | "captions"; idempotencyKey?: string } = {},
  ): Promise<BatchResponse> {
    const body: Record<string, unknown> = { videoIds };
    if (options.mode != null) body["mode"] = options.mode;
    const env = await this.client.request("POST", BATCH, {
      body,
      idempotent: true,
      idempotencyKey: options.idempotencyKey,
    });
    return normalizeBatch(env);
  }

  /**
   * Poll an async transcription job by id. Free: credits are charged once, on
   * delivery.
   *
   * Returns the same shape {@link video} does, plus an `error` block. A failed
   * job comes back as status "failed" rather than as a thrown error, because
   * the request itself succeeded.
   *
   * ```ts
   * let t = await tf.transcripts.video("https://example.com/episode.mp3");
   * while (t.status === "processing") {
   *   await new Promise((r) => setTimeout(r, 5000));
   *   t = await tf.transcripts.job(t.jobId!);
   * }
   * console.log(t.text);
   * ```
   */
  async job(jobId: string): Promise<TranscriptJob> {
    const env = await this.client.request("GET", `${JOBS}/${encodeURIComponent(jobId)}`, {
      allowFailureEnvelope: true,
    });
    return normalizeJob(env);
  }

  // ── Auto-paginating iterators ───────────────────────────────────────────────

  /** Iterate every video in a channel, transparently following cursors. */
  iterChannel(channel: string, options: { limit?: number } = {}): AsyncGenerator<Video> {
    return this.paginate((cursor) => this.channel(channel, { limit: options.limit, cursor }));
  }

  /** Iterate every video in a playlist, transparently following cursors. */
  iterPlaylist(playlist: string, options: { limit?: number } = {}): AsyncGenerator<Video> {
    return this.paginate((cursor) => this.playlist(playlist, { limit: options.limit, cursor }));
  }

  /** Iterate every search result, transparently following cursors. */
  iterSearch(query: string, options: { limit?: number } = {}): AsyncGenerator<Video> {
    return this.paginate((cursor) => this.search(query, { limit: options.limit, cursor }));
  }

  private async *paginate(
    fetchPage: (cursor: string | undefined) => Promise<VideoList>,
  ): AsyncGenerator<Video> {
    let cursor: string | undefined;
    for (;;) {
      const page = await fetchPage(cursor);
      for (const video of page.videos) yield video;
      if (!page.nextCursor) return;
      cursor = page.nextCursor;
    }
  }
}
