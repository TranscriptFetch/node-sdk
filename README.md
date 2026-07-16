# TranscriptFetch Node.js SDK

The official Node.js / TypeScript client for the [TranscriptFetch API](https://transcriptfetch.com). Fetch YouTube transcripts, channels, playlists, and search as clean, typed data, with built-in retries, idempotency, and a typed error hierarchy.

- Typed responses (full TypeScript types, ESM + CommonJS)
- Automatic retries on 429 and 5xx with backoff
- Auto-generated idempotency keys on writes
- Auto-paginating async iterators
- Zero runtime dependencies (uses the built-in `fetch`, Node 18+)

## Install

```bash
npm install transcriptfetch
```

## Quickstart

```ts
import { TranscriptFetch } from "transcriptfetch";

// apiKey falls back to the TRANSCRIPTFETCH_API_KEY env var
const tf = new TranscriptFetch("tf_live_...");

const t = await tf.transcripts.video("https://youtu.be/aircAruvnKk");
console.log(t.title);
console.log(t.text);
for (const seg of t.segments) {
  console.log(`[${seg.start.toFixed(1)}] ${seg.text}`);
}

console.log("credits left:", t.usage?.balance);
```

Keep your key server-side. Never ship it to the browser.

## Endpoints

```ts
await tf.transcripts.video(video);                     // single transcript (text + segments)
await tf.transcripts.channel(channel, { limit, cursor });   // a channel's videos (metadata)
await tf.transcripts.playlist(playlist, { limit, cursor }); // a playlist's videos
await tf.transcripts.search(query, { limit, cursor });      // search YouTube
await tf.transcripts.batch(videoIds);                  // up to 50 transcripts in one call
await tf.health();                                     // unauthenticated liveness probe
```

## Pagination

Skip cursor bookkeeping with the auto-paginating iterators:

```ts
for await (const video of tf.transcripts.iterChannel("@lexfridman", { limit: 10 })) {
  console.log(video.videoId, video.title);
}
```

Or page manually via `page.nextCursor` and the `cursor` option.

## Errors

Every failure maps to a typed subclass so you can branch with `instanceof`:

```ts
import {
  TranscriptFetch,
  InsufficientCreditsError,
  RateLimitError,
  APIError,
} from "transcriptfetch";

try {
  await tf.transcripts.video("bad");
} catch (err) {
  if (err instanceof InsufficientCreditsError) {
    // 402: top up at /pricing
  } else if (err instanceof RateLimitError) {
    console.log("retry after", err.retryAfter); // 429
  } else if (err instanceof APIError) {
    console.log(err.status, err.code, err.requestId);
  }
}
```

The full hierarchy: `AuthenticationError`, `InvalidRequestError`, `InsufficientCreditsError`, `IdempotencyConflictError`, `RateLimitError`, `UpstreamUnavailableError`, `InternalServerError` (all extend `APIError`), plus `APIConnectionError` and `APITimeoutError` for transport failures. All extend `TranscriptFetchError`.

## Configuration

```ts
const tf = new TranscriptFetch({
  apiKey: "tf_live_...",              // or TRANSCRIPTFETCH_API_KEY
  baseUrl: "https://transcriptfetch.com",
  timeout: 30_000,                    // ms
  maxRetries: 2,                      // retries 429 + 5xx
});
```

## Links

- API docs: https://transcriptfetch.com/docs
- Python SDK: https://github.com/TranscriptFetch/python-sdk

## License

MIT
