/**
 * Error hierarchy for the TranscriptFetch SDK.
 *
 * The API returns a canonical error envelope:
 * `{ ok: false, request_id, error: { code, message, issues? } }`. We map
 * `error.code` (falling back to the HTTP status) to a specific subclass so
 * callers can branch cleanly with `instanceof`.
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
  requestId?: string | null;
  issues?: unknown[];
}

/** The API returned an error response. */
export class APIError extends TranscriptFetchError {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly issues: unknown[];

  constructor(message: string, init: APIErrorInit) {
    super(message);
    this.status = init.status;
    this.code = init.code ?? null;
    this.requestId = init.requestId ?? null;
    this.issues = init.issues ?? [];
  }
}

/** 401: missing or invalid API key. */
export class AuthenticationError extends APIError {}
/** 400: the request body failed validation (see `issues`). */
export class InvalidRequestError extends APIError {}
/** 402: not enough credits to complete the request. */
export class InsufficientCreditsError extends APIError {}
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

/** 502/503: the upstream transcript service was unreachable. Safe to retry. */
export class UpstreamUnavailableError extends APIError {}
/** 500: unexpected server error. */
export class InternalServerError extends APIError {}

const CODE_TO_EXC: Record<string, new (message: string, init: APIErrorInit) => APIError> = {
  unauthorized: AuthenticationError,
  invalid_request: InvalidRequestError,
  insufficient_credits: InsufficientCreditsError,
  idempotency_conflict: IdempotencyConflictError,
  rate_limited: RateLimitError,
  upstream_unavailable: UpstreamUnavailableError,
  internal_error: InternalServerError,
};

const STATUS_TO_EXC: Record<number, new (message: string, init: APIErrorInit) => APIError> = {
  400: InvalidRequestError,
  401: AuthenticationError,
  402: InsufficientCreditsError,
  409: IdempotencyConflictError,
  429: RateLimitError,
  500: InternalServerError,
  502: UpstreamUnavailableError,
  503: UpstreamUnavailableError,
};

interface ErrorEnvelope {
  error?: { code?: string; message?: string; issues?: unknown[] };
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
  const message = error?.message || `Request failed with status ${status}`;
  const issues = Array.isArray(error?.issues) ? error!.issues : [];

  const ctor = (code && CODE_TO_EXC[code]) || STATUS_TO_EXC[status] || APIError;

  if (ctor === RateLimitError) {
    let parsed: number | null = null;
    if (retryAfter != null) {
      const n = Number(retryAfter);
      parsed = Number.isFinite(n) ? n : null;
    }
    throw new RateLimitError(message, { status, code, requestId, issues, retryAfter: parsed });
  }

  throw new ctor(message, { status, code, requestId, issues });
}
