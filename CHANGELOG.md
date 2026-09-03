# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-09-03

Targets API v2 (`/api/v2`). v1 is deprecated server-side with a twelve-month
window, so 1.x keeps working until 2027-09-03; upgrade before then.

### Breaking

- Every request goes to `/api/v2/...`.
- `APIError` gains `number` (stable integer code; the thousands digit is the
  family, 5xxx = retry), `docs`, `retryWith`, `details`, and a `retryable`
  getter. New subclasses: `NotFoundError` (404), `BatchTooLargeError` (400,
  `details.max`), `UnprocessableInputError` (422, the whole 3xxx/4xxx family:
  unsupported platform, no captions, private, live, and so on; `retryWith` is
  set when a different request would work, e.g. `{ mode: "audio" }`).
- `BatchResult`: `outcome` is exactly `"ok" | "processing" | "error"`; the
  `reason` and `message` fields are replaced by `error` (an `ApiErrorBlock`,
  the same shape a request-level error carries); `source` added on ok entries.
- `TranscriptJob.error` is an `ApiErrorBlock` (code, number, message, docs,
  retryWith, details) instead of `{ code, message }`.
- The API no longer sends the `ai_fallback` block or a top-level `reason`; the
  SDK never exposed them, so nothing to change unless you read the raw body.

### Added

- `Transcript.source`: `"captions"` or `"audio"`, where the words came from.

## [1.1.1] - 2026-08-28

### Changed

- npm listing refresh: description covers podcasts + AI speech-to-text fallback, richer keywords, homepage points at the Node docs. No code changes.

## [1.1.0]

Batch audio fallback, matching the API change: entries with no caption track
are now transcribed from their audio by default instead of failing.

Added

- `mode` option on `transcripts.batch()`: `"auto"` (the default) reads captions
  and transcribes the audio when there are none; `"captions"` keeps the old
  behaviour, failing captionless entries as `no_transcript`. (`"audio"` is not
  accepted on batch.)
- `BatchResult.jobId` and `BatchResult.pollUrl` - set when an entry escalated
  to audio transcription. Such entries report outcome `"processing"`, cost
  nothing on that call, and are charged on delivery at the audio rate; re-send
  the batch once finished, or poll `transcripts.job(jobId)`.
- `BatchResult.reason` and `BatchResult.message` - the structured failure
  reason and its human-readable explanation, which the wire has always
  carried but the model dropped.
- Optional `Segment.speaker`, the podcast speaker-diarization id. Present only
  on diarized podcast segments; previously the normalizer silently discarded it.

Removed

- `BatchResult.cached`. The API stopped sending the field (whether a result
  came from cache is an internal cost detail, not part of the contract), so
  the SDK was reporting a hardcoded `false` - worse than absent. Strictly a
  type-level removal; no runtime behaviour changes.

## [1.0.0]

First stable release. The public docs promise the SDKs follow semver, and a 0.x
version says the opposite ("anything may break"), so the surface is now declared
stable: breaking changes land only in a new major.

Added

- `client.me()` - validate the API key and read the credit balance. Free, and
  unlike `health()` it authenticates, so it is a real credential test.
- `transcripts.job(jobId)` - poll an async transcription job, created when a
  source has no captions and the API escalates to transcribing its audio. A job
  that failed is returned with status `"failed"` rather than thrown, because
  the request itself succeeded.
- Async job support on `Transcript`. A source without captions answers 202 with
  no text, which the SDK used to hand back as an empty transcript with no sign a
  job existed. `status`, `jobId` and `pollUrl` are now lifted from the envelope
  onto the model, so `video()` and `job()` return the same shape and the poll
  loop is a `while (t.status === "processing")`.
- `Transcript.podcast`, the show and episode behind a podcast transcript, and
  `Transcript.platform` (`youtube` | `tiktok` | `instagram` | `podcast` | `file`).
- `Me`, `TranscriptJob` and `PodcastMeta` types.

Changed

- Documented the real platform coverage. `video()` and `batch()` accept YouTube,
  TikTok and Instagram URLs, direct media file URLs, and podcast links (Spotify,
  Apple Podcasts, or an RSS feed), not YouTube only. No behaviour change: the
  input string has always been passed through as-is. `channel()`, `playlist()`
  and `search()` remain YouTube-only, because no other source has those.
- `Transcript.kind` is a plain string rather than the literal `"transcript"`.
  A 202 returns `"transcript_job"`, and pinning the type made a valid response
  look like a wrong one.

## [0.1.0]

Initial release.

- `TranscriptFetch` client with `transcripts.video`, `channel`, `playlist`, `search`, and `batch`.
- Auto-paginating async iterators: `iterChannel`, `iterPlaylist`, `iterSearch`.
- Typed error hierarchy mapped from the API error envelope.
- Automatic retries on 429 and 5xx with backoff, and auto-generated idempotency keys.
- Full TypeScript types, shipped as ESM and CommonJS.
