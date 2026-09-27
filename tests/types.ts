import { TranscriptFetch, type Monitor, type MonitorEvent } from '../src/index';
// Typecheck the consumer-facing API and discriminated event payloads.
export async function example(tf: TranscriptFetch): Promise<MonitorEvent[]> {
  const monitor: Monitor = await tf.monitors.create('@example', { tab: 'shorts', intervalMinutes: 60 });
  await tf.monitors.update(monitor.id, { webhookUrl: null, transcripts: false, status: 'paused' });
  await tf.transcripts.video('id', { timestamps: false, mode: 'captions', callbackUrl: 'https://example.com' });
  // @ts-expect-error Monitor creation only supports channels/profiles.
  await tf.monitors.create('id', { type: 'playlist' });
  // @ts-expect-error Target cannot be changed by PATCH.
  await tf.monitors.update(monitor.id, { target: '@different' });
  const events: MonitorEvent[] = [];
  for await (const event of tf.monitors.iterEvents(monitor.id)) {
    if (event.type === 'monitor.videos') event.data.videos.map(video => video.url);
    else event.data.transcript?.segments.map(segment => segment.text);
    events.push(event);
  }
  return events;
}
