# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.1.0]

Initial release.

- `TranscriptFetch` client with `transcripts.video`, `channel`, `playlist`, `search`, and `batch`.
- Auto-paginating async iterators: `iterChannel`, `iterPlaylist`, `iterSearch`.
- Typed error hierarchy mapped from the API error envelope.
- Automatic retries on 429 and 5xx with backoff, and auto-generated idempotency keys.
- Full TypeScript types, shipped as ESM and CommonJS.
