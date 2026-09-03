# TranscriptFetch Node.js SDK

The official Node.js / TypeScript client for the [TranscriptFetch API](https://transcriptfetch.com). Fetch transcripts as clean, typed data, with built-in retries, idempotency, and a typed error hierarchy.

- Transcripts from **YouTube, TikTok, Instagram, podcasts, and direct media file URLs**
- YouTube channel, playlist, and search listing
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

## Supported inputs

`transcripts.video()` and `transcripts.batch()` accept:

| Input | Example |
| --- | --- |
| YouTube URL or bare video ID | `https://youtu.be/aircAruvnKk`, `aircAruvnKk` |
| TikTok video URL | `https://www.tiktok.com/@user/video/7137723462233555205` |
| Instagram post or reel URL | `https://www.instagram.com/reel/Cxyz.../` |
| Podcast episode or feed | `https://open.spotify.com/episode/...`, `https://podcasts.apple.com/...`, `https://feeds.example.com/show.xml` |
| Direct media file URL | `https://example.com/talk.mp3` |

The string is sent to the API as-is, so the SDK never has to be upgraded for the
API to accept a new input.

A podcast link is resolved to that episode's audio automatically, and the
response carries a `podcast` block naming the show and episode:

```ts
const t = await tf.transcripts.video("https://open.spotify.com/episode/...");
console.log(t.podcast?.show, "-", t.podcast?.episode);
```

`channel()`, `playlist()`, and `search()` are YouTube-only concepts and take
YouTube handles, IDs, and queries.

## Sources without captions

When a source has no captions the API transcribes its audio, which takes longer
than one request. You get a transcript back with `status: "processing"` and a
`jobId` instead of text. Poll it:

```ts
let t = await tf.transcripts.video("https://example.com/episode.mp3");

while (t.status === "processing") {
  await new Promise((r) => setTimeout(r, 5_000));
  // Polling is free: credits are charged once, on delivery.
  const polled = await tf.transcripts.job(t.jobId!);
  if (polled.status === "failed") throw new Error(polled.error?.message ?? "job failed");
  t = polled;
}

console.log(t.text);
```

Everything else answers in one call, so `status` is null there and no polling is
needed.

Batch works the same way: an entry with no captions comes back as outcome
`"processing"` with a `jobId`, costs nothing on that call, and is charged on
delivery at the audio rate. Re-send the same batch once it has finished (the
text then returns normally), or poll the job - polling is optional. Pass
`mode: "captions"` to skip the audio fallback and have captionless entries fail
as outcome `"error"` with `error.code === "no_captions"` (and
`error.retryWith` naming the audio mode) instead:

```ts
const res = await tf.transcripts.batch(videoIds, { mode: "captions" });
```

## Endpoints

```ts
await tf.transcripts.video(video);                     // single transcript (text + segments)
await tf.transcripts.batch(videoIds, { mode });        // up to 50 transcripts in one call
await tf.transcripts.channel(channel, { limit, cursor });   // a YouTube channel's videos (metadata)
await tf.transcripts.playlist(playlist, { limit, cursor }); // a YouTube playlist's videos
await tf.transcripts.search(query, { limit, cursor });      // search YouTube
await tf.transcripts.job(jobId);                       // poll an async transcription job (free)
await tf.me();                                         // validate the key, read the balance (free)
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
  UnprocessableInputError,
  APIError,
} from "transcriptfetch";

try {
  await tf.transcripts.video("bad");
} catch (err) {
  if (err instanceof InsufficientCreditsError) {
    // 402: top up at /pricing
  } else if (err instanceof RateLimitError) {
    console.log("retry after", err.retryAfter); // 429
  } else if (err instanceof UnprocessableInputError && err.retryWith) {
    // A different request would work, e.g. { mode: "audio" } for a captionless video.
  } else if (err instanceof APIError) {
    // err.number's thousands digit is the family; err.retryable says whether to back off and retry.
    console.log(err.status, err.code, err.number, err.docs, err.requestId);
  }
}
```

The full hierarchy: `AuthenticationError`, `InvalidRequestError`, `InsufficientCreditsError`, `IdempotencyConflictError`, `RateLimitError`, `UpstreamUnavailableError`, `InternalServerError` (all extend `APIError`), plus `APIConnectionError` and `APITimeoutError` for transport failures. All extend `TranscriptFetchError`.

A source platform blocking the upstream fetch answers 503
(`UpstreamUnavailableError`), never 429: a `RateLimitError` always means your
own key's limit. Both are retried automatically with backoff.

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

## Versioning

This package follows [Semantic Versioning](https://semver.org/). Breaking
changes only land in a new major version.

## License

MIT
