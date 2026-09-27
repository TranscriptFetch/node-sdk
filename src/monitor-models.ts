/** Typed monitor responses. Public fields use camelCase like the transcript models. */
import {
  normalizeErrorBlock, normalizeTranscript, normalizeUsage, normalizeVideo,
  type ApiErrorBlock, type Transcript, type Usage, type Video,
} from "./models";

export type MonitorInterval = 15 | 60 | 360 | 1440;
export interface MonitorSnapshot {
  id: string;
  name: string | null;
  type: "channel";
  platform: string;
  target: string;
}
export interface Monitor extends MonitorSnapshot {
  kind: "monitor";
  options: { tab?: "videos" | "shorts" | "live" };
  status: "active" | "paused";
  hasNew: boolean;
  lastEventId: string | null;
  intervalMinutes: MonitorInterval;
  transcripts: boolean;
  webhookUrl: string | null;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  lastError: (ApiErrorBlock & { at: string | null }) | null;
  createdAt: string;
  updatedAt: string;
  /** Returned on creation only. Save securely before discarding the response. */
  webhookSecret: string | null;
  /** Returned on creation only; existing videos skipped by the baseline. */
  baselineCount: number | null;
  usage: Usage | null;
}
export interface MonitorList {
  kind: "monitor_list";
  monitors: Monitor[];
  hasNew: boolean;
  lastEventId: string | null;
  limits: { maxMonitors: number | null; minIntervalMinutes: number };
}
export interface MonitorDeleted { kind: "monitor_deleted"; id: string }
export interface MonitorDelivery {
  status: "none" | "pending" | "delivered" | "failed";
  attempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  lastError: string | null;
  deliveredAt: string | null;
}
export interface MonitorTranscriptResult {
  videoId: string;
  url: string;
  outcome: "ok" | "processing" | "error";
  /** Present when an audio job has already been queued. */
  jobId: string | null;
  transcript: Transcript | null;
  error: ApiErrorBlock | null;
}
interface MonitorEventBase {
  id: string;
  createdAt: string;
  monitor: MonitorSnapshot;
  creditsSpent: number;
  /** Absent on webhook bodies; present in event listing/check responses. */
  delivery: MonitorDelivery | null;
}
export type MonitorEvent = MonitorEventBase & (
  | { type: "monitor.videos"; data: { videos: Video[]; transcripts?: MonitorTranscriptResult[] } }
  | { type: "monitor.transcript"; data: MonitorTranscriptResult & { videosEventId: string } }
);
export interface MonitorEventList {
  kind: "monitor_event_list";
  monitorId: string;
  events: MonitorEvent[];
  nextCursor: string | null;
}
export interface MonitorCheck {
  kind: "monitor_check";
  monitor: Monitor;
  newVideos: number;
  event: MonitorEvent | null;
  /** An HTTP 200 check may still report a listing failure. */
  error: ApiErrorBlock | null;
  usage: Usage | null;
}

type Wire = Record<string, unknown>;
const obj = (v: unknown): Wire => v && typeof v === "object" ? v as Wire : {};
const nullable = (v: unknown): string | null => typeof v === "string" ? v : null;
const num = (v: unknown): number => typeof v === "number" ? v : 0;
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
function snapshot(raw: unknown): MonitorSnapshot {
  const d = obj(raw);
  return { id: String(d.id ?? ""), name: nullable(d.name), type: "channel", platform: String(d.platform ?? ""), target: String(d.target ?? "") };
}
export function normalizeMonitor(env: Wire): Monitor {
  const d = obj(env.data);
  const error = normalizeErrorBlock(d.last_error);
  return {
    ...snapshot(d), kind: "monitor", options: obj(d.options) as Monitor["options"],
    status: d.status as Monitor["status"], hasNew: d.has_new === true, lastEventId: nullable(d.last_event_id),
    intervalMinutes: num(d.interval_minutes) as MonitorInterval, transcripts: d.transcripts === true,
    webhookUrl: nullable(d.webhook_url), nextCheckAt: nullable(d.next_check_at), lastCheckedAt: nullable(d.last_checked_at),
    lastError: error ? { ...error, at: nullable(obj(d.last_error).at) } : null,
    createdAt: String(d.created_at ?? ""), updatedAt: String(d.updated_at ?? ""),
    webhookSecret: nullable(d.webhook_secret), baselineCount: typeof d.baseline_count === "number" ? d.baseline_count : null,
    usage: normalizeUsage(env),
  };
}
export function normalizeMonitorList(env: Wire): MonitorList {
  const d = obj(env.data), limits = obj(d.limits);
  return {
    kind: "monitor_list", monitors: arr(d.monitors).map(data => normalizeMonitor({ data })),
    hasNew: d.has_new === true, lastEventId: nullable(d.last_event_id),
    limits: { maxMonitors: typeof limits.max_monitors === "number" ? limits.max_monitors : null, minIntervalMinutes: num(limits.min_interval_minutes) },
  };
}
function transcriptResult(raw: unknown): MonitorTranscriptResult {
  const d = obj(raw);
  return {
    videoId: String(d.video_id ?? ""), url: String(d.url ?? ""), outcome: d.outcome as MonitorTranscriptResult["outcome"],
    jobId: nullable(d.job_id),
    transcript: d.transcript ? normalizeTranscript({ data: d.transcript }) : null,
    error: normalizeErrorBlock(d.error),
  };
}
export function normalizeMonitorEvent(raw: unknown): MonitorEvent {
  const e = obj(raw), d = obj(e.data), delivery = obj(e.delivery);
  const base: MonitorEventBase = {
    id: String(e.id ?? ""), createdAt: String(e.created_at ?? ""), monitor: snapshot(e.monitor), creditsSpent: num(e.credits_spent),
    delivery: e.delivery ? {
      status: delivery.status as MonitorDelivery["status"], attempts: num(delivery.attempts),
      lastAttemptAt: nullable(delivery.last_attempt_at), nextAttemptAt: nullable(delivery.next_attempt_at),
      lastError: nullable(delivery.last_error), deliveredAt: nullable(delivery.delivered_at),
    } : null,
  };
  return e.type === "monitor.videos"
    ? { ...base, type: "monitor.videos", data: { videos: arr(d.videos).map(normalizeVideo), ...(Array.isArray(d.transcripts) ? { transcripts: d.transcripts.map(transcriptResult) } : {}) } }
    : { ...base, type: "monitor.transcript", data: { ...transcriptResult(d), videosEventId: String(d.videos_event_id ?? "") } };
}
export function normalizeMonitorEvents(env: Wire): MonitorEventList {
  const d = obj(env.data);
  return { kind: "monitor_event_list", monitorId: String(d.monitor_id ?? ""), events: arr(d.events).map(normalizeMonitorEvent), nextCursor: nullable(d.next_cursor) };
}
export function normalizeMonitorCheck(env: Wire): MonitorCheck {
  const d = obj(env.data);
  return { kind: "monitor_check", monitor: normalizeMonitor({ data: d.monitor }), newVideos: num(d.new_videos), event: d.event ? normalizeMonitorEvent(d.event) : null, error: normalizeErrorBlock(d.error), usage: normalizeUsage(env) };
}
