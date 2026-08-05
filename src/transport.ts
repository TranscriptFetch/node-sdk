/**
 * Transport-agnostic HTTP helpers: header building, retry policy, backoff, and
 * envelope parsing / error mapping. The client owns the fetch call and the
 * retry loop; these are the pure pieces around it.
 */

import type { ResolvedConfig } from "./config";
import { raiseApiError } from "./errors";
import { VERSION } from "./version";

export const USER_AGENT = `transcriptfetch-node/${VERSION}`;

export function buildHeaders(
  config: ResolvedConfig,
  idempotencyKey: string | undefined,
  needsKey = true,
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  if (needsKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return headers;
}

export function newIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, "");
  // Fallback for environments without crypto.randomUUID.
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export function backoffMs(attempt: number, retryAfter?: string | null): number {
  if (retryAfter != null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds, 60) * 1000;
  }
  const base = Math.min(0.5 * 2 ** attempt, 8);
  return (base + Math.random() * 0.25) * 1000;
}

type Envelope = Record<string, unknown>;

export interface ParseOptions {
  /**
   * Return a 2xx `ok: false` body instead of throwing.
   *
   * Only the job-poll endpoint needs this: a job that failed to transcribe is a
   * reportable state delivered at HTTP 200, not a failed request.
   */
  allowFailureEnvelope?: boolean;
}

/**
 * Return the parsed JSON body, or throw the mapped APIError. Handles both the
 * `{ ok, request_id, data, usage }` envelope and the bare health-check body
 * (which has no `ok` field).
 */
export async function parseEnvelope(
  response: Response,
  options: ParseOptions = {},
): Promise<Envelope> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const isObj = payload != null && typeof payload === "object";
  const requestId = isObj ? ((payload as Envelope).request_id as string | undefined) ?? null : null;

  const failureEnvelope =
    isObj && (payload as Envelope).ok === false && !options.allowFailureEnvelope;
  const isError = response.status >= 400 || failureEnvelope;
  if (isError) {
    raiseApiError(
      response.status,
      isObj ? (payload as Envelope) : {},
      requestId,
      response.headers.get("retry-after"),
    );
  }

  if (!isObj) {
    raiseApiError(response.status, {}, requestId, null);
  }

  return payload as Envelope;
}
