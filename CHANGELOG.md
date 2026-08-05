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
