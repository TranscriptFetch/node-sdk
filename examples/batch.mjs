// Batch: fetch up to 50 transcripts in one call.
// Run: TRANSCRIPTFETCH_API_KEY=tf_live_... node examples/batch.mjs
import { TranscriptFetch } from "transcriptfetch";

const tf = new TranscriptFetch();

const res = await tf.transcripts.batch(["dQw4w9WgXcQ", "9bZkp7q19f0"]);
for (const r of res.results) {
  console.log(r.videoId, r.outcome, r.text ? `${r.text.length} chars` : "(no text)");
}
console.log("credits spent:", res.usage?.creditsSpent);
