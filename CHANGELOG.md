# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [1.0.0]

First stable release. The public docs promise the SDKs follow semver, and a 0.x
version says the opposite ("anything may break"), so the surface is now declared
stable: breaking changes land only in a new major.

Added

- `client.me()` - validate the API key and read the credit balance. Free, and
  unlike `health()` it authenticates, so it is a real credential test.
- `transcripts.job(jobId)` - poll an async transcription job, created when a
  video has no captions and the API escalates to transcribing its audio. A job
  that failed is returned as a `TranscriptJob` with status `"failed"` rather
  than thrown, because the request itself succeeded.
- `Me` and `TranscriptJob` types.

Changed

- Documented the real platform coverage. `video()` and `batch()` accept YouTube,
  TikTok and Instagram URLs as well as direct media file URLs, not YouTube only.
  No behaviour change: the input string has always been passed through as-is.
  `channel()`, `playlist()` and `search()` remain YouTube-only.

## [0.1.0]

Initial release.

- `TranscriptFetch` client with `transcripts.video`, `channel`, `playlist`, `search`, and `batch`.
- Auto-paginating async iterators: `iterChannel`, `iterPlaylist`, `iterSearch`.
- Typed error hierarchy mapped from the API error envelope.
- Automatic retries on 429 and 5xx with backoff, and auto-generated idempotency keys.
- Full TypeScript types, shipped as ESM and CommonJS.
