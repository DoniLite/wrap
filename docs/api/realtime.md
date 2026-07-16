---
title: Realtime
parent: API reference
nav_order: 10
---

`packages/wrap/src/realtime/index.ts` — import from `@donilite/wrap/realtime`, a **Bun-only subpath** (relies on `Bun.serve` WebSocket topics and, optionally, `Bun.RedisClient`).

WebSocket endpoint with a channel subscribe/unsubscribe protocol, fan-out through Bun's native `server.publish`/`ws.subscribe` topics, an optional Redis pub/sub relay for multi-instance deployments, and one-line auto-publication of [entity events](registry.md#entity-events-eventsts).

## `createRealtime(options?)`

```ts
interface RealtimeOptions {
  redisUrl?: string;      // enables the multi-instance relay when set
  topicPrefix?: string;    // default "wrap:rt" — prefix of Bun topics / Redis channels
  authorize?: (c: Context, channel: string) => boolean | Promise<boolean>; // default: every channel is open
}

function createRealtime(options?: RealtimeOptions): Realtime

interface Realtime {
  upgrade: MiddlewareHandler;                                   // Hono handler that upgrades the connection
  websocket: typeof import("hono/bun").websocket;                 // for `Bun.serve({ websocket })`
  attach(server: Server): void;                                    // hands the layer the Bun server for topic fan-out
  publish(channel: string, payload: unknown): Promise<void>;
  bindEntityEvents(map?: (event: EntityEvent) => unknown): () => void; // returns an unbind function
  close(): Promise<void>;
}
```

### Wiring

```ts
const realtime = createRealtime({ redisUrl: process.env.REDIS_URL });
app.get("/realtime", realtime.upgrade);
realtime.bindEntityEvents();

const server = app.listen(port, host, { websocket: realtime.websocket });
realtime.attach(server);
```

`app.listen(port, hostname, { websocket })` (see [Wrap](wrap.md#listenport-hostname-options)) forwards `websocket` straight into `Bun.serve` and returns the `Server` handle `attach()` needs — this is the one thing `Wrap` deliberately doesn't own end-to-end, since `createRealtime()` needs the raw server reference after `listen()` returns.

### Client protocol (JSON over the WebSocket)

```
→ { "action": "subscribe",   "channel": "entity:examples" }
→ { "action": "unsubscribe", "channel": "entity:examples" }
← { "type": "subscribed", "channel": "..." }
← { "type": "message", "channel": "...", "data": ... }
← { "type": "error", "error": "forbidden" | "invalid JSON" | "unknown action", "channel"?: "..." }
```

`authorize(c, channel)` runs on every `subscribe` — return `false` to reject with a `forbidden` error frame instead of subscribing the socket to that topic. There is no per-message authorization beyond the subscribe gate; once subscribed, a client receives every message published on that channel.

### `publish(channel, payload)`

Publishes locally via `server.publish(topic, ...)` to every subscriber on this instance, and — if `redisUrl` was given — relays the message through Redis pub/sub so other instances' subscribers receive it too. Each instance tags its own outgoing relay messages with a random `instanceId` and ignores relay messages carrying its own id, avoiding an echo loop. Calling `publish()` before `attach(server)` logs a warning and drops the local publish (the Redis relay side still fires if configured) — `attach()` must run before any `publish()` call that needs local delivery.

### `bindEntityEvents(map?)`

```ts
bindEntityEvents(map?: (event: EntityEvent) => unknown): () => void
```

Subscribes to every entity event (`onEntityEvent("*", ...)`, see [Registry — entity events](registry.md#entity-events-eventsts)) and republishes each one on `entity:<table>` — every repository write in the app becomes a realtime message with zero extra code per feature. `map` transforms the event payload before publishing (e.g. to strip sensitive fields); omitted, the raw `EntityEvent` is published as-is. Returns the `onEntityEvent` unsubscribe function.

### `close()`

Closes the Redis publisher/subscriber connections, if any were opened. Does not close the underlying `Bun.serve` server — that's the app's own `server.stop()` to call, since `Realtime` only owns the Redis side of its own lifecycle.
