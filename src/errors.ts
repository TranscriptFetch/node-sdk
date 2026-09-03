/**
 * Error hierarchy for the TranscriptFetch SDK.
 *
 * The API (v2) returns one error block on every failure:
 * `{ ok: false, request_id, error: { code, number, message, docs, retry_with?, details?, issues? } }`.
 * `code` is a stable string and `number` a stable integer whose thousands
 * digit is the family (1 request, 2 account, 3 input, 4 content, 5 transient,
 * 9 ours). We map `error.code` (falling back to the HTTP status) to a specific
 * subclass so callers can branch cleanly with `instanceof`, and expose the
 * rest of the block on the error object.
 */

/** Base class for every error raised by this SDK. */
export class TranscriptFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    // Restore the prototype chain (needed when targeting ES5-era down-levels).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A network problem prevented the request from completing (DNS/TLS/connect). */
export class APIConnectionError extends TranscriptFetchError {}

/** The request did not complete within the configured timeout. */
export class APITimeoutError extends APIConnectionError {}

export interface APIErrorInit {
  status: number;
  code?: string | null;
  /** Stable numeric code; the thousands digit is the family. */
  number?: number | null;
  requestId?: string | null;
  /** Per-code documentation URL. */
  docs?: string | null;
  /** The request change that would succeed, e.g. `{ mode: "audio" }`. */
  retryWith?: Record<string, unknown> | null;
  /** Structured specifics for the few codes that document them. */
  details?: Record<string, unknown> | null;
  issues?: unknown[];
}

/** The API returned an error response. */
export class APIError extends TranscriptFetchError {
  readonly status: number;
  readonly code: string | null;
  readonly number: number | null;
  readonly requestId: string | null;
  readonly docs: string | null;
  readonly retryWith: Record<string, unknown> | null;
  readonly details: Record<string, unknown> | null;
  readonly issues: unknown[];

  constructor(message: string, init: APIErrorInit) {
    super(message);
    this.status = init.status;
    this.code = init.code ?? null;
    this.number = init.number ?? null;
    this.requestId = init.requestId ?? null;
    this.docs = init.docs ?? null;
    this.retryWith = init.retryWith ?? null;
    this.details = init.details ?? null;
    this.issues = init.issues ?? [];
  }

  /**
   * Whether the SAME request is worth retrying with backoff: the transient
   * (5xxx) and server (9xxx) families, plus rate limits and credit exhaustion
   * once the condition clears. Never true for 1xxx/3xxx/4xxx, where the
   * request itself has to change (see `retryWith`).
   */
  get retryable(): boolean {
    if (this.number != null) {
      const family = Math.floor(this.number / 1000);
      return family === 5 || family === 9 || this.code === "rate_limited" || this.code === "insufficient_credits";
    }
    return this.status === 429 || this.status >= 500;
  }
}

/** 401: missing or invalid API key. */
export class AuthenticationError extends APIError {}
/** 400: the request body failed validation (see `issues`), or a stale cursor. */
export class InvalidRequestError extends APIError {}
/** 404: no such job for this account. */
export class NotFoundError extends APIError {}
/** 402: not enough credits to complete the request. */
export class InsufficientCreditsError extends APIError {}
/** 400 batch_too_large: over your plan's per-batch cap (see `details.max`). */
export class BatchTooLargeError extends InvalidRequestError {}
/** 409: Idempotency-Key reused with a different body, or still in flight. */
export class IdempotencyConflictError extends APIError {}

/** 429: per-key rate limit exceeded. */
export class RateLimitError extends APIError {
  /** Seconds to wait before retrying, parsed from the Retry-After header when present. */
  readonly retryAfter: number | null;

  constructor(message: string, init: APIErrorInit & { retryAfter?: number | null }) {
    super(message, init);
    this.retryAfter = init.retryAfter ?? null;
  }
}

/**
 * 422: this input cannot be served, permanently (the 3xxx and 4xxx families):
 * an unsupported platform, the wrong endpoint for the platform, a podcast
 * with no public feed, a private or live video, no captions, no speech.
 * `code` says which; `retryWith` is set when a different request would work
 * (e.g. `{ mode: "audio" }` to transcribe a captionless video).
 */
export class UnprocessableInputError extends APIError {}

/**
 * 502/503: the upstream fetch failed - the transcript service was unreachable,
 * or the source platform blocked the fetch (code "upstream_error"). Safe to
 * retry with backoff. Platform blocks never surface as 429: a
 * {@link RateLimitError} always means your own key's limit.
 */
export class UpstreamUnavailableError extends APIError {}
/** 500: unexpected server error. */
export class InternalServerError extends APIError {}

type Ctor = new (message: string, init: APIErrorInit) => APIError;

const CODE_TO_EXC: Record<string, Ctor> = {
  unauthorized: AuthenticationError,
  invalid_request: InvalidRequestError,
  invalid_cursor: InvalidRequestError,
  not_found: NotFoundError,
  insufficient_credits: InsufficientCreditsError,
  batch_too_large: BatchTooLargeError,
  idempotency_conflict: IdempotencyConflictError,
  rate_limited: RateLimitError,
  upstream_unavailable: UpstreamUnavailableError,
  internal_error: InternalServerError,
};

const STATUS_TO_EXC: Record<number, Ctor> = {
  400: InvalidRequestError,
  401: AuthenticationError,
  402: InsufficientCreditsError,
  404: NotFoundError,
  409: IdempotencyConflictError,
  422: UnprocessableInputError,
  429: RateLimitError,
  500: InternalServerError,
  502: UpstreamUnavailableError,
  503: UpstreamUnavailableError,
};

/** Choose the class from the number's family when the code is not listed. */
function ctorFor(code: string | null, number: number | null, status: number): Ctor {
  if (code && CODE_TO_EXC[code]) return CODE_TO_EXC[code];
  if (number != null) {
    const family = Math.floor(number / 1000);
    if (family === 3 || family === 4) return UnprocessableInputError;
    if (family === 5) return UpstreamUnavailableError;
    if (family === 9) return InternalServerError;
  }
  return STATUS_TO_EXC[status] || APIError;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    number?: number;
    message?: string;
    docs?: string;
    retry_with?: Record<string, unknown>;
    details?: Record<string, unknown>;
    issues?: unknown[];
  };
}

/** Map an error response to the appropriate exception and throw it. */
export function raiseApiError(
  status: number,
  payload: ErrorEnvelope,
  requestId: string | null,
  retryAfter?: string | null,
): never {
  const error = payload && typeof payload === "object" ? payload.error : undefined;
  const code = error?.code ?? null;
  const number = typeof error?.number === "number" ? error.number : null;
  const message = error?.message || `Request failed with status ${status}`;
  const init: APIErrorInit = {
    status,
    code,
    number,
    requestId,
    docs: error?.docs ?? null,
    retryWith: error?.retry_with && typeof error.retry_with === "object" ? error.retry_with : null,
    details: error?.details && typeof error.details === "object" ? error.details : null,
    issues: Array.isArray(error?.issues) ? error!.issues : [],
  };

  const ctor = ctorFor(code, number, status);

  if (ctor === RateLimitError) {
    let parsed: number | null = null;
    if (retryAfter != null) {
      const n = Number(retryAfter);
      parsed = Number.isFinite(n) ? n : null;
    }
    throw new RateLimitError(message, { ...init, retryAfter: parsed });
  }

  throw new ctor(message, init);
}
