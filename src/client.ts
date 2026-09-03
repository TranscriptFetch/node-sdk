/** The main TranscriptFetch client. */

import { resolveConfig, type ClientOptions, type ResolvedConfig } from "./config";
import { APIConnectionError, APITimeoutError } from "./errors";
import { normalizeMe, type Health, type Me } from "./models";
import { Transcripts } from "./resources/transcripts";
import { backoffMs, buildHeaders, isRetryable, newIdempotencyKey, parseEnvelope } from "./transport";

export interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  /** Send the Authorization header. Defaults to true. */
  auth?: boolean;
  /** Auto-generate an Idempotency-Key when one is not supplied. */
  idempotent?: boolean;
  /** Accept a 2xx `ok: false` body as data rather than raising (job polling). */
  allowFailureEnvelope?: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Client for the TranscriptFetch API.
 *
 * ```ts
 * import { TranscriptFetch } from "transcriptfetch";
 *
 * const tf = new TranscriptFetch("tf_live_..."); // or set TRANSCRIPTFETCH_API_KEY
 * const t = await tf.transcripts.video("dQw4w9WgXcQ");
 * console.log(t.text, t.usage?.balance);
 * ```
 */
export class TranscriptFetch {
  /** The transcripts resource: video, batch, channel, playlist, search, job. */
  readonly transcripts: Transcripts;
  private readonly config: ResolvedConfig;

  constructor(apiKey?: string, options?: ClientOptions);
  constructor(options: ClientOptions);
  constructor(apiKeyOrOptions?: string | ClientOptions, options: ClientOptions = {}) {
    const opts: ClientOptions =
      typeof apiKeyOrOptions === "string"
        ? { ...options, apiKey: apiKeyOrOptions }
        : (apiKeyOrOptions ?? {});
    this.config = resolveConfig(opts);
    this.transcripts = new Transcripts(this);
  }

  /** Low-level request with the shared retry loop. Resources call this. */
  async request(method: string, path: string, options: RequestOptions = {}): Promise<Record<string, unknown>> {
    let key = options.idempotencyKey;
    if (options.idempotent && !key) key = newIdempotencyKey();
    const baseHeaders = buildHeaders(this.config, key, options.auth !== false);
    const hasBody = options.body != null;
    const headers = hasBody ? { ...baseHeaders, "Content-Type": "application/json" } : baseHeaders;

    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeout);
      let response: Response;
      try {
        response = await this.config.fetch(this.config.baseUrl + path, {
          method,
          headers,
          body: hasBody ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new APITimeoutError(`Request timed out after ${this.config.timeout}ms`);
        }
        throw new APIConnectionError(err instanceof Error ? err.message : String(err));
      } finally {
        clearTimeout(timer);
      }

      if (isRetryable(response.status) && attempt < this.config.maxRetries) {
        await sleep(backoffMs(attempt, response.headers.get("retry-after")));
        attempt += 1;
        continue;
      }
      return parseEnvelope(response, { allowFailureEnvelope: options.allowFailureEnvelope });
    }
  }

  /**
   * Validate the API key and read the account's credit balance. Free.
   *
   * Unlike {@link health}, this authenticates, so it is the right credential
   * test for an integration.
   */
  async me(): Promise<Me> {
    return normalizeMe(await this.request("GET", "/api/v2/me"));
  }

  /** Unauthenticated liveness probe. No credits used. */
  async health(): Promise<Health> {
    return (await this.request("GET", "/api/v2/health", { auth: false })) as unknown as Health;
  }
}
