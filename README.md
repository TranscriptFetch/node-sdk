# TranscriptFetch Node.js SDK

The official Node.js / TypeScript client for the [TranscriptFetch API](https://transcriptfetch.com). Fetch transcripts as clean, typed data, with built-in retries, idempotency, and a typed error hierarchy.

- Transcripts from **YouTube, TikTok, Instagram, and direct media file URLs**
- Channel, playlist and search listing across YouTube, TikTok and Instagram
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

Every transcript carries the same metadata whichever platform served it:
`videoId`, `url`, `platform`, `title`, `channel` (the creator), `duration` in
seconds, `language`, `thumbnailUrl` and `source` (`"captions"` or `"audio"`).
A value the API could not determine is `null`, never missing.

Keep your key server-side. Never ship it to the browser.

## Supported inputs

`transcripts.video()` and `transcripts.batch()` accept:

| Input | Example |
| --- | --- |
| YouTube URL or bare video ID | `https://youtu.be/aircAruvnKk`, `aircAruvnKk` |
| TikTok video URL | `https://www.tiktok.com/@user/video/7137723462233555205` |
| Instagram post or reel URL | `https://www.instagram.com/reel/Cxyz.../` |
| Direct media file URL | `https://example.com/talk.mp3` |

The string is sent to the API as-is, so the SDK never has to be upgraded for the
API to accept a new input.

`channel()` and `playlist()` take a YouTube, TikTok or Instagram URL (or a
YouTube `@handle` / `PL…` id) and detect the platform
from it. `search()` searches YouTube unless you pass `platform`:

```ts
const page = await tf.transcripts.search("lofi hip hop", { platform: "tiktok", limit: 10 });
for (const v of page.videos) {
  console.log(v.title, v.publishedAt, v.stats?.plays);
  const t = await tf.transcripts.video(v.url!); // every row's url is accepted as-is
}
```

Rows carry `videoId`, `url`, `title`, `channel`, `duration`, `publishedAt` and
`stats` (`plays` where the source exposes it); the page carries `platform`.

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
await tf.transcripts.channel(channel, { limit, cursor });   // a channel's or creator's videos (metadata)
await tf.transcripts.playlist(playlist, { limit, cursor }); // a playlist's videos
await tf.transcripts.search(query, { platform, limit, cursor }); // keyword search, YouTube by default
await tf.transcripts.job(jobId);                       // poll an async transcription job (free)
await tf.me();                                         // validate the key, read the balance (free)
await tf.health();                                     // unauthenticated liveness probe
```

## Monitors (2.4.0+)

Watch a YouTube channel or a TikTok/Instagram profile for new videos. Creating
one reads the target once to record what is already there (existing videos are
skipped) and starts scheduled checks. Every check costs 1 credit whether or not
it finds new videos, and so does that first read; caption transcripts cost 1
credit more each when enabled. A check whose listing fails is free. See
[monitor docs](https://transcriptfetch.com/docs/monitors) for plan limits, audio
billing, retention and webhook verification.

```ts
const tf = new TranscriptFetch({ timeout: 120_000 });
const monitor = await tf.monitors.create("@lexfridman", {
  intervalMinutes: 60,
  transcripts: true,
  // webhookUrl: "https://your-app.com/hooks/transcriptfetch", // optional
  // tab: "shorts", // YouTube only: videos (default), shorts, live
});
// Save monitor.webhookSecret securely: it is only returned on creation.

const all = await tf.monitors.list();
const news = await tf.monitors.list({ since: all.lastEventId ?? undefined });
const current = await tf.monitors.get(monitor.id);
const page = await tf.monitors.events(monitor.id, { limit: 10 });
for await (const event of tf.monitors.iterEvents(monitor.id, { since: current.lastEventId ?? undefined })) {
  console.log(event.type, event.data);
}
await tf.monitors.update(monitor.id, { status: "paused" });
await tf.monitors.update(monitor.id, { webhookUrl: null, name: null, transcripts: false });
// Omitted settings stay unchanged. null clears webhookUrl/name.
await tf.monitors.update(monitor.id, { status: "active" });
const check = await tf.monitors.check(monitor.id); // 1 credit, found or not
if (check.error) console.error(check.error); // listing failure, even with HTTP 200
await tf.monitors.delete(monitor.id); // removes events too
```

All SDK result fields use camelCase, including `nextCursor`, `hasNew`,
`videosEventId` and `webhookSecret`. `monitor.videos` events contain `data.videos`
and optional `data.transcripts`; each transcript outcome is `ok`, `processing`
or `error`. `monitor.transcript` events carry the completed or failed follow-up
in `data`, linked by `videosEventId`. `delivery` describes webhook attempts.
Reading events never marks them read: persist the latest event id and pass it
as `since`. `iterEvents` follows cursor pages while retaining that lower bound.
Create/check accept `idempotencyKey`; the generated key stays stable on retries.
Use a longer client timeout for creation or manual checks, which read the platform.

Single-video options are also supported:

```ts
const transcript = await tf.transcripts.video("dQw4w9WgXcQ", {
  mode: "captions", timestamps: false,
});
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
- Python SDK: https://github.com/TranscriptFetch/transcript-api-python

## Versioning

This package follows [Semantic Versioning](https://semver.org/). Breaking
changes only land in a new major version.

## License

MIT
