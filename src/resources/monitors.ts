/** Channel/profile monitors, their checks, and paginated events. */
import type { TranscriptFetch } from "../client";
import type { ListPlatform } from "../models";
import {
  normalizeMonitor, normalizeMonitorCheck, normalizeMonitorEvents, normalizeMonitorList,
  type Monitor, type MonitorCheck, type MonitorDeleted, type MonitorEvent,
  type MonitorEventList, type MonitorInterval, type MonitorList,
} from "../monitor-models";

export interface CreateMonitorOptions {
  type?: "channel";
  platform?: ListPlatform;
  /** YouTube only. Fixed for the lifetime of the monitor. */
  tab?: "videos" | "shorts" | "live";
  webhookUrl?: string | null;
  intervalMinutes?: MonitorInterval;
  transcripts?: boolean;
  name?: string | null;
  idempotencyKey?: string;
}
export interface UpdateMonitorOptions {
  /** null removes the webhook; omitted leaves it unchanged. */
  webhookUrl?: string | null;
  intervalMinutes?: MonitorInterval;
  transcripts?: boolean;
  /** null clears the name. */
  name?: string | null;
  status?: "active" | "paused";
}
export interface MonitorEventsOptions {
  limit?: number;
  cursor?: string;
  /** Only events newer than this event id (newest first). */
  since?: string;
}

const BASE = "/api/v2/monitors";
function path(id: string): string { return `${BASE}/${encodeURIComponent(id)}`; }
function query(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, String(value));
  return params.size ? `?${params}` : "";
}
function settings(options: UpdateMonitorOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  // undefined means absent; null and false must survive PATCH.
  if (options.webhookUrl !== undefined) body.webhook_url = options.webhookUrl;
  if (options.intervalMinutes !== undefined) body.interval_minutes = options.intervalMinutes;
  if (options.transcripts !== undefined) body.transcripts = options.transcripts;
  if (options.name !== undefined) body.name = options.name;
  if (options.status !== undefined) body.status = options.status;
  return body;
}

export class Monitors {
  constructor(private readonly client: TranscriptFetch) {}

  /** Create a scheduled monitor. Baseline is free; only later videos produce events.
   * Save webhookSecret now: it is only returned on creation. */
  async create(target: string, options: CreateMonitorOptions = {}): Promise<Monitor> {
    const body = { ...settings(options), target, type: options.type, platform: options.platform, tab: options.tab };
    return normalizeMonitor(await this.client.request("POST", BASE, {
      body, idempotent: true, idempotencyKey: options.idempotencyKey,
    }));
  }

  /** All monitors on the account. Free. Pass lastEventId as since to check for news. */
  async list(options: { since?: string } = {}): Promise<MonitorList> {
    return normalizeMonitorList(await this.client.request("GET", BASE + query({ since: options.since })));
  }

  /** Read settings and news without marking anything read. Free. */
  async get(monitorId: string, options: { since?: string } = {}): Promise<Monitor> {
    return normalizeMonitor(await this.client.request("GET", path(monitorId) + query({ since: options.since })));
  }

  /** Update settings; status: "paused" pauses, "active" resumes. Free. */
  async update(monitorId: string, options: UpdateMonitorOptions): Promise<Monitor> {
    return normalizeMonitor(await this.client.request("PATCH", path(monitorId), { body: settings(options) }));
  }

  /** Delete the monitor and its events. An already-running transcription may still bill. */
  async delete(monitorId: string): Promise<MonitorDeleted> {
    const env = await this.client.request("DELETE", path(monitorId));
    return env.data as MonitorDeleted;
  }

  /** Check now (even when paused). New videos cost credits; inspect error for listing failures. */
  async check(monitorId: string, options: { idempotencyKey?: string } = {}): Promise<MonitorCheck> {
    return normalizeMonitorCheck(await this.client.request("POST", `${path(monitorId)}/check`, {
      idempotent: true, idempotencyKey: options.idempotencyKey,
    }));
  }

  /** One page of events, newest first. Free. */
  async events(monitorId: string, options: MonitorEventsOptions = {}): Promise<MonitorEventList> {
    return normalizeMonitorEvents(await this.client.request("GET", `${path(monitorId)}/events` + query({
      limit: options.limit, cursor: options.cursor, since: options.since,
    })));
  }

  /** Iterate events, preserving since across cursor pages. Free. */
  async *iterEvents(monitorId: string, options: MonitorEventsOptions = {}): AsyncGenerator<MonitorEvent> {
    let cursor = options.cursor;
    for (;;) {
      const page = await this.events(monitorId, { ...options, cursor });
      yield* page.events;
      if (!page.nextCursor) return;
      cursor = page.nextCursor;
    }
  }
}
