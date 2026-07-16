/**
 * Official Node.js / TypeScript SDK for the TranscriptFetch API.
 *
 * ```ts
 * import { TranscriptFetch } from "transcriptfetch";
 *
 * const tf = new TranscriptFetch("tf_live_..."); // or set TRANSCRIPTFETCH_API_KEY
 * const t = await tf.transcripts.video("dQw4w9WgXcQ");
 * console.log(t.title, t.text);
 * ```
 */

export { TranscriptFetch, type RequestOptions } from "./client";
export type { ClientOptions } from "./config";
export type { ListOptions } from "./resources/transcripts";
export { VERSION } from "./version";

export {
  TranscriptFetchError,
  APIError,
  APIConnectionError,
  APITimeoutError,
  AuthenticationError,
  InvalidRequestError,
  InsufficientCreditsError,
  IdempotencyConflictError,
  RateLimitError,
  UpstreamUnavailableError,
  InternalServerError,
} from "./errors";

export type {
  Usage,
  Segment,
  Transcript,
  Video,
  VideoList,
  BatchResult,
  BatchResponse,
  Health,
} from "./models";
