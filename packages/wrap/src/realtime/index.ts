/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Realtime — import from "@donilite/wrap/realtime" (Bun-only subpath:
 * it relies on Bun's native WebSocket topics and Redis client).
 *
 * - WebSocket endpoint with channel subscribe/unsubscribe protocol
 * - fan-out through Bun.serve topics (ws.subscribe / server.publish)
 * - optional Redis pub/sub relay for multi-instance deployments
 * - `bindEntityEvents()` auto-publishes repository writes on
 *   `entity:<table>` channels — realtime
 *
 * ```ts
 * const realtime = createRealtime({ redisUrl: process.env.REDIS_URL });
 * app.get("/realtime", realtime.upgrade);
 * realtime.bindEntityEvents();
 * const server = Bun.serve({ fetch: app.fetch, websocket: realtime.websocket, port });
 * realtime.attach(server);
 * ```
 *
 * Client protocol (JSON):
 *   → { "action": "subscribe",   "channel": "entity:examples" }
 *   → { "action": "unsubscribe", "channel": "entity:examples" }
 *   ← { "type": "subscribed", "channel": "..." }
 *   ← { "type": "message", "channel": "...", "data": ... }
 */
import type { Server } from "bun";
import type { Context, MiddlewareHandler } from "hono";

type BunServer = Server<any>;
import { onEntityEvent, type EntityEvent } from "../events";
import { logger } from "../logger";
import { upgradeWebSocket, websocket } from "hono/bun";

export interface RealtimeOptions {
  /** Redis connection string — enables the multi-instance relay. */
  redisUrl?: string;
  /** Prefix of the Bun topics / Redis channels (default: "wrap:rt"). */
  topicPrefix?: string;
  /**
   * Channel-level authorization, evaluated on every subscribe.
   * Default: every channel is open.
   */
  authorize?: (c: Context, channel: string) => boolean | Promise<boolean>;
}

export interface Realtime {
  /** Hono handler upgrading the connection: `app.get("/realtime", realtime.upgrade)` */
  upgrade: MiddlewareHandler;
  /** WebSocket handlers for `Bun.serve({ websocket })` */
  websocket: typeof websocket;
  /** Give the realtime layer the Bun server (topic fan-out). */
  attach(server: BunServer): void;
  /** Publish a payload on a channel (local topics + Redis relay). */
  publish(channel: string, payload: unknown): Promise<void>;
  /** Auto-publish entity events on `entity:<table>` channels. Returns an unbind fn. */
  bindEntityEvents(map?: (event: EntityEvent) => unknown): () => void;
  /** Close Redis connections. */
  close(): Promise<void>;
}

type BunRedis = InstanceType<typeof Bun.RedisClient>;

export function createRealtime(options: RealtimeOptions = {}): Realtime {
  const { redisUrl, topicPrefix = "wrap:rt", authorize } = options;
  const instanceId = crypto.randomUUID();

  let server: BunServer | undefined;
  let publisher: BunRedis | undefined;
  let subscriber: BunRedis | undefined;
  let relayReady: Promise<void> = Promise.resolve();

  const topic = (channel: string) => `${topicPrefix}:${channel}`;

  const localPublish = (channel: string, data: unknown) => {
    if (!server) {
      logger.warn(
        "realtime.publish before attach(server) — message dropped locally",
        { channel },
      );
      return;
    }
    server.publish(
      topic(channel),
      JSON.stringify({ type: "message", channel, data }),
    );
  };

  // Single Redis relay channel: envelopes carry the logical channel.
  const relayChannel = `${topicPrefix}:relay`;

  if (redisUrl) {
    publisher = new Bun.RedisClient(redisUrl);
    subscriber = new Bun.RedisClient(redisUrl);
    relayReady = subscriber
      .subscribe(relayChannel, (message: string) => {
        try {
          const envelope = JSON.parse(message) as {
            origin: string;
            channel: string;
            data: unknown;
          };
          if (envelope.origin === instanceId) return; // own message
          localPublish(envelope.channel, envelope.data);
        } catch (error) {
          logger.warn("realtime: malformed relay message", {}, error);
        }
      })
      .then(() => undefined);
  }

  const upgrade = upgradeWebSocket((c) => ({
    onMessage: async (event, ws) => {
      let parsed: { action?: string; channel?: string };
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "invalid JSON" }));
        return;
      }

      const { action, channel } = parsed;
      if (!channel || (action !== "subscribe" && action !== "unsubscribe")) {
        ws.send(JSON.stringify({ type: "error", error: "unknown action" }));
        return;
      }

      if (action === "subscribe") {
        if (authorize && !(await authorize(c, channel))) {
          ws.send(
            JSON.stringify({ type: "error", error: "forbidden", channel }),
          );
          return;
        }
        ws.raw?.subscribe(topic(channel));
        ws.send(JSON.stringify({ type: "subscribed", channel }));
      } else {
        ws.raw?.unsubscribe(topic(channel));
        ws.send(JSON.stringify({ type: "unsubscribed", channel }));
      }
    },
  })) as MiddlewareHandler;

  return {
    upgrade,
    websocket,
    attach(bunServer: BunServer) {
      server = bunServer;
    },
    async publish(channel: string, payload: unknown) {
      localPublish(channel, payload);
      if (publisher) {
        await relayReady;
        await publisher.publish(
          relayChannel,
          JSON.stringify({ origin: instanceId, channel, data: payload }),
        );
      }
    },
    bindEntityEvents(map?: (event: EntityEvent) => unknown) {
      return onEntityEvent("*", (event) => {
        const data = map ? map(event) : event;
        void this.publish(`entity:${event.table}`, data);
      });
    },
    async close() {
      publisher?.close();
      subscriber?.close();
    },
  };
}
