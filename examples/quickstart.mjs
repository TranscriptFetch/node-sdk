// Quickstart: fetch a single transcript.
// Run: TRANSCRIPTFETCH_API_KEY=tf_live_... node examples/quickstart.mjs
import { TranscriptFetch } from "transcriptfetch";

const tf = new TranscriptFetch();

// A TikTok or Instagram URL, or a direct media file URL, works here too.
const t = await tf.transcripts.video("https://youtu.be/aircAruvnKk");
console.log(t.title);
console.log(t.text?.slice(0, 200), "...");
console.log("segments:", t.segments.length);
console.log("credits left:", t.usage?.balance);
