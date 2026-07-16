// Pagination: iterate every video in a channel without managing cursors.
// Run: TRANSCRIPTFETCH_API_KEY=tf_live_... node examples/paginate.mjs
import { TranscriptFetch } from "transcriptfetch";

const tf = new TranscriptFetch();

let count = 0;
for await (const video of tf.transcripts.iterChannel("@lexfridman", { limit: 10 })) {
  console.log(video.videoId, video.title);
  if (++count >= 30) break; // stop early for the demo
}
