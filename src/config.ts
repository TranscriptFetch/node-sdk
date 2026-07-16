/** Client configuration resolution, shared by the client and its resources. */

export const DEFAULT_BASE_URL = "https://transcriptfetch.com";
export const ENV_API_KEY = "TRANSCRIPTFETCH_API_KEY";

/** Options accepted by the {@link TranscriptFetch} constructor. */
export interface ClientOptions {
  /** Your API key. Falls back to the TRANSCRIPTFETCH_API_KEY environment variable. */
  apiKey?: string;
  /** Override the API origin. Defaults to https://transcriptfetch.com. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
  /** How many times to retry 429 and 5xx responses. Defaults to 2. */
  maxRetries?: number;
  /** Inject a custom fetch implementation (defaults to the global fetch). */
  fetch?: typeof fetch;
}

export interface ResolvedConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  fetch: typeof fetch;
}

/** Resolve user options into a complete config, reading env and applying defaults. */
export function resolveConfig(options: ClientOptions = {}): ResolvedConfig {
  const envKey = typeof process !== "undefined" ? process.env?.[ENV_API_KEY] : undefined;
  const apiKey = options.apiKey ?? envKey;
  if (!apiKey) {
    throw new Error(
      `No API key provided. Pass { apiKey } or set the ${ENV_API_KEY} environment variable.`,
    );
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "global fetch is not available. Use Node 18+, or pass a fetch implementation via { fetch }.",
    );
  }

  return {
    apiKey,
    baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    timeout: options.timeout ?? 30_000,
    maxRetries: Math.max(0, options.maxRetries ?? 2),
    fetch: fetchImpl,
  };
}
