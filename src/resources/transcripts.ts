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
   * Fetch a single video's transcript (text + timestamped segments).
   *
   * Accepts a YouTube, TikTok or Instagram URL, a bare YouTube video ID, or a
   * direct media file URL. The string is passed through to the API untouched,
   * so newly supported inputs work without an SDK upgrade.
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

  /** Fetch up to 50 transcripts in one call. Same accepted inputs as {@link video}. */
  async batch(videoIds: string[], options: { idempotencyKey?: string } = {}): Promise<BatchResponse> {
    const env = await this.client.request("POST", BATCH, {
      body: { videoIds },
      idempotent: true,
      idempotencyKey: options.idempotencyKey,
    });
    return normalizeBatch(env);
  }

  /**
   * Poll an async transcription job by id. Free: credits are charged once, on
   * delivery.
   *
   * A job is created when a video has no captions and the API escalates to
   * transcribing its audio. A failed job comes back as a `TranscriptJob` with
   * status "failed" rather than as a thrown error, because the request itself
   * succeeded.
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
