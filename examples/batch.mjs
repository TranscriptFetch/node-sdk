// Batch: fetch up to 50 transcripts in one call.
// Run: TRANSCRIPTFETCH_API_KEY=tf_live_... node examples/batch.mjs
import { TranscriptFetch } from "transcriptfetch";

const tf = new TranscriptFetch();

// Entries with no captions are transcribed from audio: they come back as
// outcome "processing" with a jobId, free on this call, billed on delivery.
// Pass { mode: "captions" } to have captionless entries fail as no_transcript instead.
const res = await tf.transcripts.batch(["dQw4w9WgXcQ", "9bZkp7q19f0"]);
for (const r of res.results) {
  if (r.outcome === "processing") console.log(r.videoId, "transcribing audio, job", r.jobId);
  else console.log(r.videoId, r.outcome, r.text ? `${r.text.length} chars` : "(no text)");
}
console.log("credits spent:", res.usage?.creditsSpent);
